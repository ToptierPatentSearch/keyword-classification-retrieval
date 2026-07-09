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

function getBrowserTimeZone(): string {
  if (typeof Intl === 'undefined') {
    return '';
  }

  return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
}

export function detectLanguage(): LanguageCode {
  // UI copy is intentionally fixed to English.
  // Currency is detected separately in detectCurrency().
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

export function detectCurrency(
  languages = getBrowserLanguages(),
  timeZone = getBrowserTimeZone()
): SupportedCurrency {
  const normalizedTimeZone = timeZone.toLowerCase();

  // Japan pricing is selected by region/time zone, not by UI language.
  if (normalizedTimeZone === 'asia/tokyo') {
    return 'jpy';
  }

  const regions = languages
    .map(getRegionFromLocale)
    .filter((region): region is string => Boolean(region));

  if (regions.includes('JP')) {
    return 'jpy';
  }

  if (regions.some((region) => EUROZONE_REGIONS.has(region))) {
    return 'eur';
  }

  // Fallback for European time zones where the browser locale has no region.
  if (normalizedTimeZone.startsWith('europe/')) {
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
    valid10: 'Valid for 10 days',
    valid30: 'Valid for 30 days',
    oneTime: 'One-time payment',
    buy: (credits: number, price: string) => `Buy ${credits} analyses — ${price}`,
    loading: (credits: number) => `Preparing checkout for ${credits} analyses...`,
    signInError: 'Please sign in before purchasing.',
    checkoutError: 'Unable to start checkout. Please try again.',
    currentPlan: 'Current Plan',
    remaining: (credits: number) => `Remaining Credits: ${credits}`,
    planStatusLoading: 'Loading your current credit balance...',
  },
  ja: {
    heading: 'あなたに合ったプランを選択',
    description: '分析クレジットを購入して、すぐにツールを使い始められます。',
    testName: 'テスト利用',
    businessName: 'ビジネス利用',
    testDescription: '2回分の分析でツールをお試しください。短時間のテストに最適です。',
    businessDescription: 'ビジネス用途に十分な分析回数です。継続的な作業に適しています。',
    credits2: '2回分の分析クレジット',
    credits10: '10回分の分析クレジット',
    valid10: '10日間有効',
    valid30: '30日間有効',
    oneTime: '一回払い',
    buy: (credits: number, price: string) => `${credits}回分を購入 — ${price}`,
    loading: (credits: number) => `${credits}回分の決済を準備中...`,
    signInError: '購入するにはサインインしてください。',
    checkoutError: '決済を開始できませんでした。もう一度お試しください。',
    currentPlan: '現在のプラン',
    remaining: (credits: number) => `残りクレジット: ${credits}`,
    planStatusLoading: '現在のクレジット残高を読み込んでいます...',
  },
} as const;
