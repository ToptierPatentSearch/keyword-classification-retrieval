export type LanguageCode = 'en' | 'ja';
export type SupportedCurrency = 'usd' | 'jpy' | 'eur';

const EUROZONE_REGIONS = new Set([
  'AT', 'BE', 'HR', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE', 'IT', 'LV',
  'LT', 'LU', 'MT', 'NL', 'PT', 'SK', 'SI', 'ES',
]);

function getBrowserLanguages(): string[] {
  if (typeof navigator === 'undefined') {
    return ['en-US'];
  }

  return navigator.languages?.length ? [...navigator.languages] : [navigator.language || 'en-US'];
}

export function detectLanguage(_languages = getBrowserLanguages()): LanguageCode {
  return 'en';
}

export function getRegionFromLocale(locale: string): string | null {
  try {
    const region = new Intl.Locale(locale).region;
    return region ? region.toUpperCase() : null;
  } catch {
    const match = locale.match(/[-_]([A-Za-z]{2}|\d{3})\b/);
    return match?.[1]?.toUpperCase() ?? null;
  }
}

export function detectCurrency(languages = getBrowserLanguages()): SupportedCurrency {
  const normalizedLanguages = languages.map((language) => language.toLowerCase());

  if (normalizedLanguages.some((language) => language === 'ja' || language.startsWith('ja-'))) {
    return 'jpy';
  }

  const regions = languages
    .map(getRegionFromLocale)
    .filter((region): region is string => Boolean(region));

  if (regions.some((region) => EUROZONE_REGIONS.has(region))) {
    return 'eur';
  }

  return 'usd';
}

export const messages = {
  en: {
    heading: 'Choose the Plan That Fits You',
    description: 'Purchase analysis credits and start using the tool immediately.',
    testName: 'Trial Use',
    businessName: 'Business Use',
    testDescription: 'Try the tool with 2 analyses. Ideal for a quick test.',
    businessDescription: 'Enough analysis credits for business use. Suitable for ongoing work.',
    credits2: '2 analysis credits',
    credits10: '10 analysis credits',
    valid30: 'Valid for 30 days',
    valid180: 'Valid for 180 days',
    oneTime: 'One-time payment',
    buy: (credits: number, price: string) => `Buy ${credits} analyses — ${price}`,
    loading: (credits: number) => `Preparing checkout for ${credits} credits...`,
    signInError: 'Please sign in before purchasing.',
    checkoutError: 'Unable to start checkout. Please try again.',
    currentPlan: 'Current Plan',
    remaining: (credits: number) => `Remaining Credits: ${credits}`,
    planStatusLoading: 'Loading your current credit balance...',
  },
  ja: {
    heading: 'Choose the Plan That Fits You',
    description: 'Purchase analysis credits and start using the tool immediately.',
    testName: 'Trial Use',
    businessName: 'Business Use',
    testDescription: 'Try the tool with 2 analyses. Ideal for a quick test.',
    businessDescription: 'Enough analysis credits for business use. Suitable for ongoing work.',
    credits2: '2 analysis credits',
    credits10: '10 analysis credits',
    valid30: 'Valid for 30 days',
    valid180: 'Valid for 180 days',
    oneTime: 'One-time payment',
    buy: (credits: number, price: string) => `Buy ${credits} analyses — ${price}`,
    loading: (credits: number) => `Preparing checkout for ${credits} credits...`,
    signInError: 'Please sign in before purchasing.',
    checkoutError: 'Unable to start checkout. Please try again.',
    currentPlan: 'Current Plan',
    remaining: (credits: number) => `Remaining Credits: ${credits}`,
    planStatusLoading: 'Loading your current credit balance...',
  },
} as const;