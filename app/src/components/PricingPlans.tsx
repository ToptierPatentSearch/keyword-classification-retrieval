import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import { detectCurrency, detectLanguage, messages, type SupportedCurrency } from '../lib/locale';
import { formatPlanPrice, PRICING_PLANS, type PlanId } from '../lib/pricing';

interface PricingPlansProps {
  session: Session | null;
  onError: (message: string) => void;
}

type CreditPlanState = {
  remainingCredits: number;
  planId: PlanId | null;
  currency: SupportedCurrency | null;
  expiresAt: string | null;
};

type CreditTransactionRow = {
  credits: number;
  plan_id: PlanId | null;
  stripe_checkout_session_id: string | null;
  created_at: string;
};

type StripePaymentRow = {
  currency: string | null;
};

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '';
}

function iconForPlan(planId: PlanId) {
  return planId === 'test' ? '⚗️' : '💼';
}

function isSupportedCurrency(value: string | null | undefined): value is SupportedCurrency {
  return value === 'usd' || value === 'jpy' || value === 'eur';
}

function planName(planId: PlanId | null, t: typeof messages.en | typeof messages.ja): string {
  if (planId === 'test') return t.testName;
  if (planId === 'business') return t.businessName;
  return t.unknownPlan;
}

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value));
}

function calculateExpiration(planId: PlanId | null, createdAt: string | null): string | null {
  if (!planId || !createdAt) return null;
  const plan = PRICING_PLANS.find((pricingPlan) => pricingPlan.id === planId);
  if (!plan) return null;

  const expiration = new Date(createdAt);
  expiration.setDate(expiration.getDate() + plan.validityDays);
  return expiration.toISOString();
}

export function PricingPlans({ session, onError }: PricingPlansProps) {
  const browserLocale = typeof navigator === 'undefined' ? 'en-US' : navigator.languages?.[0] || navigator.language || 'en-US';
  const language = useMemo(() => detectLanguage(), []);
  const detectedCurrency = useMemo<SupportedCurrency>(() => detectCurrency(), []);
  const t = messages[language];
  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);
  const [creditPlanState, setCreditPlanState] = useState<CreditPlanState | null>(null);
  const [isCreditStateLoading, setIsCreditStateLoading] = useState(false);
  const [creditStateError, setCreditStateError] = useState<string | null>(null);

  async function fetchCreditPlanState() {
    if (!session) {
      setCreditPlanState(null);
      setIsCreditStateLoading(false);
      setCreditStateError(null);
      return;
    }

    setIsCreditStateLoading(true);
    setCreditStateError(null);

    const { data: balanceData, error: balanceError } = await supabase
      .from('user_credit_balances')
      .select('remaining_credits')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (balanceError) {
      const message = `${t.creditStateError} ${balanceError.message}`;
      setCreditStateError(message);
      setCreditPlanState(null);
      setIsCreditStateLoading(false);
      onError(message);
      return;
    }

    const remainingCredits = Number(balanceData?.remaining_credits ?? 0);

    if (remainingCredits <= 0) {
      setCreditPlanState({ remainingCredits, planId: null, currency: null, expiresAt: null });
      setIsCreditStateLoading(false);
      return;
    }

    const { data: transactionData, error: transactionError } = await supabase
      .from('credit_transactions')
      .select('credits, plan_id, stripe_checkout_session_id, created_at')
      .eq('user_id', session.user.id)
      .gt('credits', 0)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<CreditTransactionRow>();

    if (transactionError) {
      const message = `${t.creditStateError} ${transactionError.message}`;
      setCreditStateError(message);
      setCreditPlanState(null);
      setIsCreditStateLoading(false);
      onError(message);
      return;
    }

    let purchasedCurrency: SupportedCurrency | null = null;
    if (transactionData?.stripe_checkout_session_id) {
      const { data: paymentData } = await supabase
        .from('stripe_payments')
        .select('currency')
        .eq('stripe_checkout_session_id', transactionData.stripe_checkout_session_id)
        .maybeSingle<StripePaymentRow>();

      const normalizedCurrency = paymentData?.currency?.toLowerCase();
      purchasedCurrency = isSupportedCurrency(normalizedCurrency) ? normalizedCurrency : null;
    }

    setCreditPlanState({
      remainingCredits,
      planId: transactionData?.plan_id ?? null,
      currency: purchasedCurrency,
      expiresAt: calculateExpiration(transactionData?.plan_id ?? null, transactionData?.created_at ?? null),
    });
    setIsCreditStateLoading(false);
  }

  useEffect(() => {
    void fetchCreditPlanState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  async function handleCheckout(planId: PlanId, credits: number) {
    if (!session) {
      onError(t.signInError);
      return;
    }

    onError('');
    setLoadingPlan(planId);
    window.localStorage.setItem('lastCheckoutPlan', planId);

    try {
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: { planId, credits, currency: detectedCurrency },
      });

      if (error) throw error;
      if (!data?.url || typeof data.url !== 'string') throw new Error(t.checkoutError);

      window.location.href = data.url;
    } catch (checkoutError) {
      onError(`${t.checkoutError}${asErrorMessage(checkoutError) ? ` ${asErrorMessage(checkoutError)}` : ''}`);
      setLoadingPlan(null);
      window.localStorage.removeItem('lastCheckoutPlan');
    }
  }

  const hasCredits = (creditPlanState?.remainingCredits ?? 0) > 0;
  const currentPlanState = hasCredits ? creditPlanState : null;

  return (
    <section className="pricing-section" aria-labelledby="pricing-heading">
      <div className="pricing-heading">
        <h2 id="pricing-heading">{t.heading}</h2>
        <p>{t.description}</p>
      </div>

      {session && isCreditStateLoading && <p className="pricing-status-card">{t.creditStateLoading}</p>}
      {session && creditStateError && <p className="pricing-status-card pricing-status-error">{creditStateError}</p>}

      {session && !isCreditStateLoading && currentPlanState ? (
        <article className="pricing-current-plan-card" aria-live="polite">
          <p className="eyebrow">{t.currentPlanStatus}</p>
          <h3>{t.currentPlan}: {planName(currentPlanState.planId, t)}</h3>
          {currentPlanState.currency && <p>{t.currency}: {currentPlanState.currency.toUpperCase()}</p>}
          <p>{t.remaining(currentPlanState.remainingCredits)}</p>
          {currentPlanState.expiresAt && <p>{t.expires}: {formatDate(currentPlanState.expiresAt, browserLocale)}</p>}
        </article>
      ) : (
        !isCreditStateLoading && (
          <div className="pricing-grid">
            {PRICING_PLANS.map((plan) => {
              const price = formatPlanPrice(plan.id, detectedCurrency, browserLocale);
              const name = plan.id === 'test' ? t.testName : t.businessName;
              const description = plan.id === 'test' ? t.testDescription : t.businessDescription;
              const creditLabel = plan.credits === 2 ? t.credits2 : t.credits10;
              const validLabel = plan.validityDays === 30 ? t.valid30 : t.valid180;
              const isLoading = loadingPlan === plan.id;

              return (
                <article key={plan.id} className={`pricing-card pricing-card-${plan.theme}`}>
                  <div className="pricing-card-hero">
                    <span className="pricing-icon" aria-hidden="true">{iconForPlan(plan.id)}</span>
                    <div>
                      <p className="pricing-credit-count">{plan.credits} {language === 'ja' ? '回分' : 'Analyses'}</p>
                      <h3>{name}</h3>
                    </div>
                  </div>

                  <p className="pricing-description">{description}</p>
                  <ul className="pricing-features">
                    <li><span aria-hidden="true">✓</span>{creditLabel}</li>
                    <li><span aria-hidden="true">✓</span>{validLabel}</li>
                  </ul>

                  <div className="pricing-price">
                    <strong>{price}</strong>
                    <span>{t.oneTime}</span>
                  </div>

                  <button
                    className="pricing-buy-button"
                    type="button"
                    disabled={loadingPlan !== null}
                    onClick={() => void handleCheckout(plan.id, plan.credits)}
                    aria-label={isLoading ? t.loading(plan.credits) : t.buy(plan.credits, price)}
                  >
                    <span aria-hidden="true">🛒</span>
                    {isLoading ? t.loading(plan.credits) : t.buy(plan.credits, price)}
                  </button>
                </article>
              );
            })}
          </div>
        )
      )}
    </section>
  );
}
