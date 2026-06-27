import type { SupportedCurrency } from './locale';

export type PlanId = 'test' | 'business';

export interface PricingPlan {
  id: PlanId;
  credits: 2 | 10;
  validityDays: 30 | 180;
  theme: 'blue' | 'green';
}

export const PRICING_PLANS: PricingPlan[] = [
  { id: 'test', credits: 2, validityDays: 30, theme: 'blue' },
  { id: 'business', credits: 10, validityDays: 180, theme: 'green' },
];

export const PRICE_DISPLAY: Record<PlanId, Record<SupportedCurrency, number>> = {
  test: { usd: 5, jpy: 500, eur: 5 },
  business: { usd: 10, jpy: 1000, eur: 10 },
};

export function formatPlanPrice(planId: PlanId, currency: SupportedCurrency, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: currency === 'jpy' ? 0 : 2,
  }).format(PRICE_DISPLAY[planId][currency]);
}
