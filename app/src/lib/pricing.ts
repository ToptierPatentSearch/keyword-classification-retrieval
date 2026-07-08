import type { SupportedCurrency } from './locale';

export type PlanId = 'test' | 'business';

export interface PricingPlan {
  id: PlanId;
  credits: 2 | 10;
  validityDays: 30 | 180;
  theme: 'blue' | 'green';
}

export interface LocalizedPlanPrice {
  label: string;
  amount: number;
  stripePriceId: string;
}

export interface LocalizedPricing {
  locale: SupportedCurrency;
  currency: string;
  symbol: string;
  plans: Record<PlanId, LocalizedPlanPrice>;
}

export const PRICING_PLANS: PricingPlan[] = [
  { id: 'test', credits: 2, validityDays: 30, theme: 'blue' },
  { id: 'business', credits: 10, validityDays: 180, theme: 'green' },
];

const stripePriceId = (key: string): string => import.meta.env[key] as string | undefined ?? '';

export const LOCALIZED_PRICING: Record<SupportedCurrency, LocalizedPricing> = {
  usd: {
    locale: 'usd',
    currency: 'USD',
    symbol: '$',
    plans: {
      test: { label: 'Test Pack', amount: 5, stripePriceId: stripePriceId('VITE_STRIPE_PRICE_TEST_USD') },
      business: { label: 'Business Pack', amount: 10, stripePriceId: stripePriceId('VITE_STRIPE_PRICE_BUSINESS_USD') },
    },
  },
  jpy: {
    locale: 'jpy',
    currency: 'JPY',
    symbol: '¥',
    plans: {
      test: { label: 'Test Pack', amount: 500, stripePriceId: stripePriceId('VITE_STRIPE_PRICE_TEST_JPY') },
      business: { label: 'Business Pack', amount: 2000, stripePriceId: stripePriceId('VITE_STRIPE_PRICE_BUSINESS_JPY') },
    },
  },
  eur: {
    locale: 'eur',
    currency: 'EUR',
    symbol: '€',
    plans: {
      test: { label: 'Test Pack', amount: 5, stripePriceId: stripePriceId('VITE_STRIPE_PRICE_TEST_EUR') },
      business: { label: 'Business Pack', amount: 10, stripePriceId: stripePriceId('VITE_STRIPE_PRICE_BUSINESS_EUR') },
    },
  },
};

export function getLocalizedPricing(currency: SupportedCurrency): LocalizedPricing {
  return LOCALIZED_PRICING[currency];
}

export function formatPlanPrice(planId: PlanId, currency: SupportedCurrency, locale = 'en-US'): string {
  const pricing = getLocalizedPricing(currency);

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: pricing.currency,
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: currency === 'jpy' ? 0 : 2,
  }).format(pricing.plans[planId].amount);
}
