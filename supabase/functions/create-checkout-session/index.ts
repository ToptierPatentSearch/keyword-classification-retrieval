import Stripe from 'npm:stripe@^18.0.0';
import { createClient } from 'npm:@supabase/supabase-js@^2.75.0';

type PlanId = 'test' | 'business';
type Currency = 'usd' | 'jpy' | 'eur';

interface CheckoutRequest {
  planId?: unknown;
  credits?: unknown;
  currency?: unknown;
}

const PLAN_CREDITS: Record<PlanId, number> = { test: 2, business: 10 };
const PLAN_VALIDITY_DAYS: Record<PlanId, number> = { test: 10, business: 30 };
const PRICE_ENV: Record<PlanId, Record<Currency, string>> = {
  // Stripe Price ID mapping: values are read from secrets so no fake Price IDs are trusted or committed.
  test: { usd: 'STRIPE_PRICE_ID_TEST_USD', jpy: 'STRIPE_PRICE_ID_TEST_JPY', eur: 'STRIPE_PRICE_ID_TEST_EUR' },
  business: { usd: 'STRIPE_PRICE_ID_BUSINESS_USD', jpy: 'STRIPE_PRICE_ID_BUSINESS_JPY', eur: 'STRIPE_PRICE_ID_BUSINESS_EUR' },
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', ...(init.headers ?? {}) },
  });
}

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured in Supabase secrets.`);
  return value;
}

function getRequiredUrlEnv(name: string): string {
  const rawValue = getRequiredEnv(name).trim();
  try {
    const url = new URL(rawValue);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error();
    }
    url.hash = '';
    return url.toString();
  } catch {
    throw new Error(`${name} must be a valid absolute URL, for example https://toptierpatentsearch.github.io/keyword-classification-retrieval/`);
  }
}

function buildSuccessUrl(siteUrl: string, planId: PlanId): string {
  const url = new URL(siteUrl);
  url.searchParams.set('checkout', 'success');
  url.searchParams.set('purchasedPlan', planId);
  return url.toString();
}

function getPlan(value: unknown): PlanId {
  if (value === 'test' || value === 'business') return value;
  throw new Error('planId must be "test" or "business".');
}

function getCurrency(value: unknown): Currency {
  if (value === 'usd' || value === 'jpy' || value === 'eur') return value;
  throw new Error('currency must be "usd", "jpy", or "eur".');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed. Use POST.' }, { status: 405 });

  try {
    const supabaseUrl = getRequiredEnv('SUPABASE_URL');
    const supabaseAnonKey = getRequiredEnv('SUPABASE_ANON_KEY');
    const supabaseServiceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');
    const stripeSecretKey = getRequiredEnv('STRIPE_SECRET_KEY');

    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Missing Authorization header.' }, { status: 401 });

    const body = await request.json().catch(() => ({})) as CheckoutRequest;
    const planId = getPlan(body.planId);
    const currency = getCurrency(body.currency);
    const expectedCredits = PLAN_CREDITS[planId];
    const validityDays = PLAN_VALIDITY_DAYS[planId];
    if (body.credits !== expectedCredits) throw new Error(`credits must be ${expectedCredits} for the ${planId} plan.`);

    const priceId = getRequiredEnv(PRICE_ENV[planId][currency]);

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const admin = createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false } });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return jsonResponse({ error: 'Invalid or expired Supabase session.' }, { status: 401 });

    const stripe = new Stripe(stripeSecretKey);
    const { data: customerRow } = await admin
      .from('stripe_customers')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    let customerId = customerRow?.stripe_customer_id as string | undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email ?? undefined, metadata: { supabase_user_id: user.id } });
      customerId = customer.id;
      await admin.from('stripe_customers').insert({ user_id: user.id, stripe_customer_id: customerId, email: user.email });
    }

    // Use the configured production app URL as the only redirect source.
    // Do not trust the request Origin header here, because it can be localhost during tests
    // and would make completed Stripe Checkout sessions return to http://localhost:5173.
    const siteUrl = getRequiredUrlEnv('SITE_URL');
    const successUrl = buildSuccessUrl(siteUrl, planId);
    const cancelUrl = siteUrl;
    const metadata = {
      supabase_user_id: user.id,
      plan_id: planId,
      credits: String(expectedCredits),
      validity_days: String(validityDays),
      currency,
      price_id: priceId,
    };

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      locale: 'en',

      automatic_tax: { enabled: true },
      billing_address_collection: 'required',
      customer_update: {
        address: 'auto',
        name: 'auto',
      },

      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: user.id,
      metadata,
      payment_intent_data: { metadata },
    });
    await admin.from('stripe_checkout_sessions').insert({
      user_id: user.id,
      stripe_customer_id: customerId,
      stripe_checkout_session_id: session.id,
      mode: 'payment',
      price_id: priceId,
      quantity: 1,
      status: session.status,
      payment_status: session.payment_status,
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: false,
      metadata,
    });

    return jsonResponse({ id: session.id, url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create Stripe Checkout session.';
    return jsonResponse({ error: message }, { status: 400 });
  }
});
