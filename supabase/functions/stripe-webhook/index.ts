import Stripe from 'npm:stripe@^18.0.0';
import { createClient } from 'npm:@supabase/supabase-js@^2.75.0';

const PLAN_CREDITS: Record<string, number> = { test: 2, business: 10 };
const PLAN_VALIDITY_DAYS: Record<string, number> = { test: 10, business: 30 };

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured in Supabase secrets.`);
  return value;
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}

function getPaymentIntentId(session: Stripe.Checkout.Session): string {
  if (typeof session.payment_intent === 'string') return session.payment_intent;
  return session.payment_intent?.id ?? '';
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const stripe = new Stripe(getRequiredEnv('STRIPE_SECRET_KEY'));
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return new Response('Missing Stripe signature', { status: 400 });
  }

  let event: Stripe.Event;

  try {
    const rawBody = await request.text();

    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      getRequiredEnv('STRIPE_WEBHOOK_SECRET'),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Invalid webhook signature';

    return new Response(message, { status: 400 });
  }

  const admin = createClient(
    getRequiredEnv('SUPABASE_URL'),
    getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  );

  /*
   * Record every Stripe event first.
   *
   * A duplicate event ID is not automatically treated as fully processed:
   * Stripe may retry an event after an earlier processing failure.
   */
  const { error: eventInsertError } = await admin
    .from('stripe_webhook_events')
    .insert({
      stripe_event_id: event.id,
      event_type: event.type,
      payload: event as unknown as Record<string, unknown>,
    });

  if (eventInsertError) {
    const { data: existingEvent, error: existingEventError } = await admin
      .from('stripe_webhook_events')
      .select('processed_at')
      .eq('stripe_event_id', event.id)
      .maybeSingle();

    if (existingEventError) {
      console.error(
        'Failed to check existing Stripe webhook event:',
        existingEventError,
      );

      return jsonResponse(
        {
          error: 'Webhook idempotency check failed',
          detail: existingEventError.message,
        },
        { status: 500 },
      );
    }

    if (existingEvent?.processed_at) {
      return jsonResponse({
        received: true,
        alreadyProcessed: true,
      });
    }
  }

  const supportedEventTypes = new Set([
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded',
  ]);

  if (supportedEventTypes.has(event.type)) {
    const session = event.data.object as Stripe.Checkout.Session;

    /*
     * Do not grant credits merely because Checkout finished.
     * Credits are granted only after Stripe reports the Session as paid.
     */
    if (session.mode !== 'payment' || session.payment_status !== 'paid') {
      console.log('Ignoring unpaid or non-payment Checkout Session', {
        stripe_event_id: event.id,
        stripe_session_id: session.id,
        mode: session.mode,
        payment_status: session.payment_status,
      });
    } else {
      const planMode = session.metadata?.plan_mode ?? '';
      const creditsFromMetadata = Number.parseInt(
        session.metadata?.credits ?? '',
        10,
      );
      const expectedCredits = PLAN_CREDITS[planMode];
      const validityDays = PLAN_VALIDITY_DAYS[planMode];
      const userId =
        session.metadata?.user_id ??
        session.client_reference_id ??
        '';

      if (
        !userId ||
        !expectedCredits ||
        !validityDays ||
        !Number.isInteger(creditsFromMetadata) ||
        creditsFromMetadata !== expectedCredits
      ) {
        console.error('Invalid Checkout Session metadata', {
          stripe_event_id: event.id,
          stripe_session_id: session.id,
          user_id: userId || null,
          plan_mode: planMode || null,
          credits_metadata: session.metadata?.credits ?? null,
          expected_credits: expectedCredits ?? null,
        });

        return jsonResponse(
          {
            error: 'Invalid Checkout Session metadata',
          },
          { status: 500 },
        );
      }

      const paymentIntentId = getPaymentIntentId(session);

      const { error: sessionUpdateError } = await admin
        .from('stripe_checkout_sessions')
        .update({
          status: session.status,
          payment_status: session.payment_status,
        })
        .eq('stripe_checkout_session_id', session.id);

      if (sessionUpdateError) {
        console.error(
          'Failed to update Stripe Checkout Session:',
          sessionUpdateError,
        );
      }

      const { error: paymentUpsertError } = await admin
        .from('stripe_payments')
        .upsert(
          {
            user_id: userId,
            stripe_customer_id:
              typeof session.customer === 'string'
                ? session.customer
                : session.customer?.id ?? null,
            stripe_checkout_session_id: session.id,
            stripe_payment_intent_id: paymentIntentId || null,
            price_id: session.metadata?.price_id ?? '',
            amount_total: session.amount_total,
            currency: session.currency,
            payment_status: session.payment_status,
            metadata: {
              ...(session.metadata ?? {}),
              validity_days: String(validityDays),
              stripe_event_id: event.id,
            },
          },
          { onConflict: 'stripe_checkout_session_id' },
        );

      if (paymentUpsertError) {
        console.error('Failed to upsert Stripe payment:', paymentUpsertError);

        return jsonResponse(
          {
            error: 'Stripe payment recording failed',
            detail: paymentUpsertError.message,
          },
          { status: 500 },
        );
      }

      /*
       * The database RPC performs the transaction insert and balance update
       * atomically. UNIQUE constraints on the Session, PaymentIntent, and
       * event IDs make repeated webhook delivery safe.
       */
      const { data: grantResult, error: grantError } = await admin.rpc(
        'grant_checkout_credits_once',
        {
          p_user_id: userId,
          p_credits: expectedCredits,
          p_plan_id: planMode,
          p_stripe_checkout_session_id: session.id,
          p_stripe_payment_intent_id: paymentIntentId,
          p_stripe_event_id: event.id,
          p_metadata: {
            currency: session.currency,
            payment_status: session.payment_status,
            price_id: session.metadata?.price_id ?? null,
            validity_days: validityDays,
          },
        },
      );

      if (grantError) {
        console.error('Failed to grant checkout credits:', grantError);

        return jsonResponse(
          {
            error: 'Credit grant failed',
            detail: grantError.message,
          },
          { status: 500 },
        );
      }

      const grantObject =
        grantResult &&
          typeof grantResult === 'object' &&
          !Array.isArray(grantResult)
          ? (grantResult as Record<string, unknown>)
          : {};

      const alreadyProcessed =
        grantObject.granted === false &&
        grantObject.reason === 'already_processed';

      const { data: finalBalanceRow, error: finalBalanceError } = await admin
        .from('user_credit_balances')
        .select('remaining_credits, plan_mode, expires_at')
        .eq('user_id', userId)
        .maybeSingle();
      if (finalBalanceError) {
        console.error('Failed to read final balance:', finalBalanceError);

        return jsonResponse(
          {
            error: 'Final credit balance read failed',
            detail: finalBalanceError.message,
          },
          { status: 500 },
        );
      }

      console.log('Checkout credit processing completed', {
        stripe_event_id: event.id,
        stripe_session_id: session.id,
        stripe_payment_intent_id: paymentIntentId || null,
        user_id: userId,
        plan_mode: planMode,
        credits: expectedCredits,
        validity_days: validityDays,
        granted: grantObject.granted ?? null,
        already_processed: alreadyProcessed,
        balance_after: finalBalanceRow?.remaining_credits ?? 0,
        expires_at: finalBalanceRow?.expires_at ?? null,
        source: 'stripe_checkout',
      });
    }
  }

  const { error: processedUpdateError } = await admin
    .from('stripe_webhook_events')
    .update({ processed_at: new Date().toISOString() })
    .eq('stripe_event_id', event.id);

  if (processedUpdateError) {
    console.error(
      'Failed to mark Stripe webhook event as processed:',
      processedUpdateError,
    );

    return jsonResponse(
      {
        error: 'Failed to finalize webhook event',
        detail: processedUpdateError.message,
      },
      { status: 500 },
    );
  }

  return jsonResponse({ received: true });
});
