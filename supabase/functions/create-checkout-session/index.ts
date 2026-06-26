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
const PRICE_ENV: Record<PlanId, Record<Currency, string>> = {
  // Stripe Price ID mapping: values are read from secrets so no fake Price IDs are trusted or committed.
  test: { usd: 'STRIPE_PRICE_TEST_USD', jpy: 'STRIPE_PRICE_TEST_JPY', eur: 'STRIPE_PRICE_TEST_EUR' },
  business: { usd: 'STRIPE_PRICE_BUSINESS_USD', jpy: 'STRIPE_PRICE_BUSINESS_JPY', eur: 'STRIPE_PRICE_BUSINESS_EUR' },
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
    const defaultSuccessUrl = getRequiredEnv('STRIPE_CHECKOUT_SUCCESS_URL');
    const defaultCancelUrl = getRequiredEnv('STRIPE_CHECKOUT_CANCEL_URL');

    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Missing Authorization header.' }, { status: 401 });

    const body = await request.json().catch(() => ({})) as CheckoutRequest;
    const planId = getPlan(body.planId);
    const currency = getCurrency(body.currency);
    const expectedCredits = PLAN_CREDITS[planId];
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

    const successUrl = `${defaultSuccessUrl}${defaultSuccessUrl.includes('?') ? '&' : '?'}checkout=success&purchasedPlan=${planId}`;
    const metadata = { supabase_user_id: user.id, plan_id: planId, credits: String(expectedCredits), currency, price_id: priceId };

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: defaultCancelUrl,
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
      cancel_url: defaultCancelUrl,
      allow_promotion_codes: false,
      metadata,
    });

    return jsonResponse({ id: session.id, url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create Stripe Checkout session.';
    return jsonResponse({ error: message }, { status: 400 });
  }
});
