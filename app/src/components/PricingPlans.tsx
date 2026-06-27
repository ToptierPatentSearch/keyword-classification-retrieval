import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import { detectCurrency, detectLanguage, messages, type SupportedCurrency } from '../lib/locale';
import { formatPlanPrice, PRICING_PLANS, type PlanId } from '../lib/pricing';

interface PricingPlansProps {
  session: Session | null;
  onError: (message: string) => void;
}

interface CurrentPlan {
  planId: PlanId | null;
  currency: SupportedCurrency | null;
  remainingCredits: number;
}

interface CreditBalanceRow {
  remaining_credits: number | string | null;
}

interface CreditTransactionRow {
  plan_id: string | null;
  stripe_checkout_session_id: string | null;
  created_at: string;
}

interface CheckoutSessionRow {
  metadata: Record<string, unknown> | null;
}

interface StripePaymentRow {
  currency: string | null;
  metadata: Record<string, unknown> | null;
}

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '';
}

function iconForPlan(planId: PlanId) {
  return planId === 'test' ? '⚗️' : '💼';
}

function isPlanId(value: unknown): value is PlanId {
  return value === 'test' || value === 'business';
}

function isSupportedCurrency(value: unknown): value is SupportedCurrency {
  return value === 'usd' || value === 'jpy' || value === 'eur';
}

function normalizeCurrency(value: unknown): SupportedCurrency | null {
  if (typeof value !== 'string') return null;
  const normalized = value.toLowerCase();
  return isSupportedCurrency(normalized) ? normalized : null;
}

export function PricingPlans({ session, onError }: PricingPlansProps) {
  const browserLocale = typeof navigator === 'undefined' ? 'en-US' : navigator.languages?.[0] || navigator.language || 'en-US';
  const language = useMemo(() => detectLanguage(), []);
  const detectedCurrency = useMemo<SupportedCurrency>(() => detectCurrency(), []);
  const t = messages[language];
  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);
  const [currentPlan, setCurrentPlan] = useState<CurrentPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState('');

  async function fetchCurrentPlan() {
    if (!session) {
      setCurrentPlan(null);
      return;
    }

    setPlanLoading(true);
    setPlanError('');

    try {
      const [{ data: balanceData, error: balanceError }, { data: transactionData, error: transactionError }] = await Promise.all([
        supabase
          .from('user_credit_balances')
          .select('remaining_credits')
          .eq('user_id', session.user.id)
          .maybeSingle<CreditBalanceRow>(),
        supabase
          .from('credit_transactions')
          .select('plan_id, stripe_checkout_session_id, created_at')
          .eq('user_id', session.user.id)
          .gt('credits', 0)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle<CreditTransactionRow>(),
      ]);

      if (balanceError) throw balanceError;
      if (transactionError) throw transactionError;

      const remainingCredits = Number(balanceData?.remaining_credits ?? 0);
      const planId = isPlanId(transactionData?.plan_id) ? transactionData.plan_id : null;
      let activeCurrency: SupportedCurrency | null = null;

      if (transactionData?.stripe_checkout_session_id) {
        const [{ data: checkoutData, error: checkoutError }, { data: paymentData, error: paymentError }] = await Promise.all([
          supabase
            .from('stripe_checkout_sessions')
            .select('metadata')
            .eq('stripe_checkout_session_id', transactionData.stripe_checkout_session_id)
            .maybeSingle<CheckoutSessionRow>(),
          supabase
            .from('stripe_payments')
            .select('currency, metadata')
            .eq('stripe_checkout_session_id', transactionData.stripe_checkout_session_id)
            .maybeSingle<StripePaymentRow>(),
        ]);

        if (checkoutError) throw checkoutError;
        if (paymentError) throw paymentError;

        activeCurrency = normalizeCurrency(paymentData?.currency)
          ?? normalizeCurrency(paymentData?.metadata?.currency)
          ?? normalizeCurrency(checkoutData?.metadata?.currency);
      }

      setCurrentPlan({ planId, currency: activeCurrency, remainingCredits });
    } catch (currentPlanError) {
      const message = `${t.planLoadError} ${asErrorMessage(currentPlanError)}`.trim();
      setPlanError(message);
      onError(message);
      setCurrentPlan(null);
    } finally {
      setPlanLoading(false);
    }
  }

  useEffect(() => {
    void fetchCurrentPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const plan = params.get('purchasedPlan') as PlanId | null;
    const fallbackPlan = window.localStorage.getItem('lastCheckoutPlan') as PlanId | null;
    const nextPlan = plan === 'test' || plan === 'business' ? plan : fallbackPlan;

    if (nextPlan === 'test' || nextPlan === 'business') {
      void fetchCurrentPlan();
      window.localStorage.removeItem('lastCheckoutPlan');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  async function handleCheckout(planId: PlanId, credits: number) {
    if (!session) {
      onError(t.signInError);
      return;
    }

    onError('');
    setPlanError('');
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

  const hasActivePaidPack = Boolean(currentPlan?.planId && currentPlan.remainingCredits > 0);
  const currentPlanCurrency = currentPlan?.currency ?? detectedCurrency;

  return (
    <section className="pricing-section" aria-labelledby="pricing-heading">
      <div className="pricing-heading">
        <h2 id="pricing-heading">{hasActivePaidPack ? t.currentPlanHeading : t.heading}</h2>
        <p>{hasActivePaidPack ? t.currentPlanDescription : t.description}</p>
      </div>

      {planLoading && <p className="status-card pricing-status">{t.planLoading}</p>}
      {planError && <p className="error pricing-status">{planError}</p>}

      {!planLoading && hasActivePaidPack && currentPlan?.planId && (
        <article className="current-plan-card card">
          <div>
            <p className="eyebrow">{t.currentPlanLabel}</p>
            <h3>{t.currentPlanName(currentPlan.planId === 'test' ? t.testName : t.businessName, currentPlanCurrency.toUpperCase())}</h3>
          </div>
          <p className="remaining-credits current-plan-credits">{t.remaining(currentPlan.remainingCredits)}</p>
        </article>
      )}

      {!planLoading && !hasActivePaidPack && (
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
      )}
    </section>
  );
}
