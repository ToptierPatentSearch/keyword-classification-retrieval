import Stripe from 'npm:stripe@^18.0.0';
import { createClient } from 'npm:@supabase/supabase-js@^2.75.0';

type CheckoutMode = 'payment' | 'subscription';

interface CheckoutRequest {
  priceId?: unknown;
  quantity?: unknown;
  successUrl?: unknown;
  cancelUrl?: unknown;
  metadata?: unknown;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const checkoutMode = (Deno.env.get('STRIPE_CHECKOUT_MODE') ?? 'subscription') as CheckoutMode;
const defaultQuantity = Number.parseInt(Deno.env.get('STRIPE_CHECKOUT_QUANTITY') ?? '1', 10);
const allowPromotionCodes = (Deno.env.get('STRIPE_ALLOW_PROMOTION_CODES') ?? 'true') === 'true';
const trialPeriodDays = Number.parseInt(Deno.env.get('STRIPE_TRIAL_PERIOD_DAYS') ?? '0', 10);

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      ...(init.headers ?? {}),
    },
  });
}

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`${name} is not configured in Supabase secrets.`);
  }

  return value;
}

function getString(value: unknown, fallback: string | undefined): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function getQuantity(value: unknown): number {
  const quantity = typeof value === 'number' ? value : defaultQuantity;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    throw new Error('quantity must be an integer between 1 and 99.');
  }

  return quantity;
}

function getMetadata(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => ['string', 'number', 'boolean'].includes(typeof entryValue))
      .map(([key, entryValue]) => [key, String(entryValue)]),
  );
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed. Use POST.' }, { status: 405 });
  }

  try {
    if (checkoutMode !== 'payment' && checkoutMode !== 'subscription') {
      throw new Error('STRIPE_CHECKOUT_MODE must be either payment or subscription.');
    }

    const supabaseUrl = getRequiredEnv('SUPABASE_URL');
    const supabaseAnonKey = getRequiredEnv('SUPABASE_ANON_KEY');
    const supabaseServiceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');
    const stripeSecretKey = getRequiredEnv('STRIPE_SECRET_KEY');
    const defaultPriceId = getRequiredEnv('STRIPE_PRICE_ID');
    const defaultSuccessUrl = getRequiredEnv('STRIPE_CHECKOUT_SUCCESS_URL');
    const defaultCancelUrl = getRequiredEnv('STRIPE_CHECKOUT_CANCEL_URL');

    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header.' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({})) as CheckoutRequest;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const admin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: 'Invalid or expired Supabase session.' }, { status: 401 });
    }

    const stripe = new Stripe(stripeSecretKey);
    const priceId = getString(body.priceId, defaultPriceId) as string;
    const quantity = getQuantity(body.quantity);
    const successUrl = getString(body.successUrl, defaultSuccessUrl) as string;
    const cancelUrl = getString(body.cancelUrl, defaultCancelUrl) as string;
    const requestMetadata = getMetadata(body.metadata);

    const { data: customerRow } = await admin
      .from('stripe_customers')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    let customerId = customerRow?.stripe_customer_id as string | undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      await admin.from('stripe_customers').insert({
        user_id: user.id,
        stripe_customer_id: customerId,
        email: user.email,
      });
    }

    const metadata = {
      ...requestMetadata,
      supabase_user_id: user.id,
      checkout_mode: checkoutMode,
      price_id: priceId,
    };

    const session = await stripe.checkout.sessions.create({
      mode: checkoutMode,
      customer: customerId,
      line_items: [{ price: priceId, quantity }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: allowPromotionCodes,
      client_reference_id: user.id,
      metadata,
      ...(checkoutMode === 'subscription'
        ? {
            subscription_data: {
              metadata,
              ...(trialPeriodDays > 0 ? { trial_period_days: trialPeriodDays } : {}),
            },
          }
        : {
            payment_intent_data: { metadata },
          }),
    });

    await admin.from('stripe_checkout_sessions').insert({
      user_id: user.id,
      stripe_customer_id: customerId,
      stripe_checkout_session_id: session.id,
      mode: checkoutMode,
      price_id: priceId,
      quantity,
      status: session.status,
      payment_status: session.payment_status,
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: allowPromotionCodes,
      trial_period_days: checkoutMode === 'subscription' && trialPeriodDays > 0 ? trialPeriodDays : null,
      metadata,
    });

    return jsonResponse({ id: session.id, url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create Stripe Checkout session.';
    return jsonResponse({ error: message }, { status: 400 });
  }
});
