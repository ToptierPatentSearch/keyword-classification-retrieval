import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import { detectCurrency, detectLanguage, messages, type SupportedCurrency } from '../lib/locale';
import { formatPlanPrice, getLocalizedPricing, PRICING_PLANS, type PlanId } from '../lib/pricing';

interface PricingPlansProps {
  session: Session | null;
  onError: (message: string) => void;
  refreshKey?: number;
  onCreditsChange?: (credits: number) => void;
}

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '';
}

function iconForPlan(planId: PlanId) {
  return planId === 'test' ? '⚗️' : '💼';
}

export function PricingPlans({
  session,
  onError,
  refreshKey,
  onCreditsChange,
}: PricingPlansProps) {
  const browserLocale =
    typeof navigator === 'undefined'
      ? 'en-US'
      : navigator.languages?.[0] || navigator.language || 'en-US';

  const language = useMemo(() => detectLanguage(), []);
  const currency = useMemo<SupportedCurrency>(() => detectCurrency(), []);
  const localizedPricing = useMemo(() => getLocalizedPricing(currency), [currency]);
  const t = messages[language];

  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);
  const [remainingCredits, setRemainingCredits] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  function applyCredits(credits: number) {
    const safeCredits = Number.isFinite(credits) ? credits : 0;
    setRemainingCredits(safeCredits);
    onCreditsChange?.(safeCredits);
  }

  async function fetchRemainingCredits() {
    if (!session) {
      applyCredits(0);
      return;
    }

    setBalanceLoading(true);

    try {
      const { data, error } = await supabase
        .from('user_credit_balances')
        .select('remaining_credits')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (error) {
        throw error;
      }

      const credits = Number(data?.remaining_credits ?? 0);

      console.log('Credit balance row:', data);
      console.log('remainingCredits =', credits);

      applyCredits(credits);
    } catch (error) {
      onError(`${t.checkoutError} ${asErrorMessage(error)}`);
      applyCredits(0);
    } finally {
      setBalanceLoading(false);
    }
  }

  useEffect(() => {
    void fetchRemainingCredits();
  }, [session?.user.id, refreshKey]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    const plan = params.get('purchasedPlan') as PlanId | null;
    const fallbackPlan = window.localStorage.getItem('lastCheckoutPlan') as PlanId | null;
    const nextPlan = plan === 'test' || plan === 'business' ? plan : fallbackPlan;

    if (checkout === 'success' && (nextPlan === 'test' || nextPlan === 'business')) {
      void fetchRemainingCredits();
      window.localStorage.removeItem('lastCheckoutPlan');

      window.history.replaceState(
        {},
        document.title,
        window.location.pathname
      );
    }

    if (checkout === 'cancelled') {
      window.localStorage.removeItem('lastCheckoutPlan');

      window.history.replaceState(
        {},
        document.title,
        window.location.pathname
      );
    }
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
      const selectedPriceId = localizedPricing.plans[planId].stripePriceId;
      const displayedPrice = formatPlanPrice(planId, currency, browserLocale);

      console.log('locale =', language);
      console.log('currency =', localizedPricing.currency);
      console.log('planId =', planId);
      console.log('displayPrice =', displayedPrice);
      console.log('stripePriceId =', selectedPriceId);

      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: { planId, credits, currency },
      });

      if (error) throw error;
      if (!data?.url || typeof data.url !== 'string') throw new Error(t.checkoutError);

      window.location.href = data.url;
    } catch (checkoutError) {
      onError(
        `${t.checkoutError}${asErrorMessage(checkoutError) ? ` ${asErrorMessage(checkoutError)}` : ''
        }`
      );
      setLoadingPlan(null);
      window.localStorage.removeItem('lastCheckoutPlan');
    }
  }

  if (balanceLoading || remainingCredits === null) {
    return (
      <section className="card">
        <p className="muted">
          {language === 'ja' ? '残り分析回数を確認中...' : 'Loading remaining analyses...'}
        </p>
      </section>
    );
  }

  if (remainingCredits > 0) {
    return null;
  }

  return (
    <section className="pricing-section" aria-labelledby="pricing-heading">
      <div className="pricing-heading">
        <h2 id="pricing-heading">{t.heading}</h2>
        <p>{t.description}</p>
      </div>

      <div className="pricing-grid">
        {PRICING_PLANS.map((plan) => {
          const price = formatPlanPrice(plan.id, currency, browserLocale);
          const selectedPriceId = localizedPricing.plans[plan.id].stripePriceId;

          console.log('locale =', language);
          console.log('currency =', localizedPricing.currency);
          console.log('planId =', plan.id);
          console.log('displayPrice =', price);
          console.log('stripePriceId =', selectedPriceId);

          const name = plan.id === 'test' ? t.testName : t.businessName;
          const description = plan.id === 'test' ? t.testDescription : t.businessDescription;
          const creditLabel = plan.credits === 2 ? t.credits2 : t.credits10;
          const validLabel = plan.validityDays === 30 ? t.valid30 : t.valid180;
          const isLoading = loadingPlan === plan.id;

          return (
            <article key={plan.id} className={`pricing-card pricing-card-${plan.theme}`}>
              <div className="pricing-card-hero">
                <span className="pricing-icon" aria-hidden="true">
                  {iconForPlan(plan.id)}
                </span>
                <div>
                  <p className="pricing-credit-count">
                    {plan.credits} Analyses
                  </p>
                  <h3>{name}</h3>
                </div>
              </div>

              <p className="pricing-description">{description}</p>

              <ul className="pricing-features">
                <li>
                  <span aria-hidden="true">✓</span>
                  {creditLabel}
                </li>
                <li>
                  <span aria-hidden="true">✓</span>
                  {validLabel}
                </li>
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
    </section>
  );
}
