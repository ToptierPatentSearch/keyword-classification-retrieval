import Stripe from 'npm:stripe@^18.0.0';
import { createClient } from 'npm:@supabase/supabase-js@^2.75.0';

const PLAN_CREDITS: Record<string, number> = { test: 2, business: 10 };

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured in Supabase secrets.`);
  return value;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const stripe = new Stripe(getRequiredEnv('STRIPE_SECRET_KEY'));
  const signature = request.headers.get('stripe-signature');
  if (!signature) return new Response('Missing Stripe signature', { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(await request.text(), signature, getRequiredEnv('STRIPE_WEBHOOK_SECRET'));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid webhook signature';
    return new Response(message, { status: 400 });
  }

  const admin = createClient(getRequiredEnv('SUPABASE_URL'), getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

  // Webhook idempotency: the unique Stripe event row and unique payment/session transaction prevent duplicate credit grants.
  const { error: eventInsertError } = await admin
    .from('stripe_webhook_events')
    .insert({ stripe_event_id: event.id, event_type: event.type, payload: event as unknown as Record<string, unknown> });
  if (eventInsertError) return new Response('Already processed', { status: 200 });

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const planId = session.metadata?.plan_id ?? '';
    const credits = PLAN_CREDITS[planId];
    const userId = session.metadata?.supabase_user_id ?? session.client_reference_id;

    if (session.mode === 'payment' && userId && credits) {
      await admin.from('stripe_checkout_sessions').update({ status: session.status, payment_status: session.payment_status }).eq('stripe_checkout_session_id', session.id);
      await admin.from('stripe_payments').upsert({
        user_id: userId,
        stripe_customer_id: String(session.customer),
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : null,
        price_id: session.metadata?.price_id ?? '',
        amount_total: session.amount_total,
        currency: session.currency,
        payment_status: session.payment_status,
        metadata: session.metadata ?? {},
      }, { onConflict: 'stripe_checkout_session_id' });

    const { error: balanceError } = await admin
      .from('user_credit_balances')
        .upsert(
          {
            user_id: userId,
            remaining_credits: credits,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'user_id',
          }
        )
        .select('user_id, remaining_credits')
        .single();

      if (balanceError) {
        console.error('Failed to upsert credit balance:', balanceError);

        return new Response(
          JSON.stringify({
            error: 'Credit balance update failed',
            detail: balanceError.message,
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      const { data: finalBalanceRow, error: finalBalanceError } = await admin
        .from('user_credit_balances')
        .select('remaining_credits')
        .eq('user_id', userId)
        .single();

      if (finalBalanceError) {
        console.error('Failed to read final balance:', finalBalanceError);

        return new Response(
          JSON.stringify({
            error: 'Final credit balance read failed',
            detail: finalBalanceError.message,
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      console.log('credit grant completed', {
        stripe_event_id: event.id,
        stripe_session_id: session.id,
        user_id: userId,
        plan_id: planId,
        delta: credits,
        balance_after: finalBalanceRow?.remaining_credits,
        source: 'stripe_checkout',
      });
    }      
  }

  await admin
    .from('stripe_webhook_events')
    .update({ processed_at: new Date().toISOString() })
    .eq('stripe_event_id', event.id);
  return new Response(JSON.stringify({ received: true }), { 
    headers: { 'Content-Type': 'application/json' } 
  });
});
