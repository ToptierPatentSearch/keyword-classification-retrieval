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

export function detectLanguage(languages = getBrowserLanguages()): LanguageCode {
  // Japanese browser locales use the Japanese copy; every other language falls back to English.
  return languages.some((language) => language.toLowerCase().startsWith('ja')) ? 'ja' : 'en';
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
  const regions = languages.map(getRegionFromLocale).filter((region): region is string => Boolean(region));

  if (regions.includes('JP')) return 'jpy';
  if (regions.includes('US')) return 'usd';
  if (regions.some((region) => EUROZONE_REGIONS.has(region))) return 'eur';

  // Currency fallback: unsupported or region-less locales display and request USD.
  return 'usd';
}

export const messages = {
  en: {
    heading: 'Choose the Right Plan for You',
    description: 'Buy analyses credits and start using the tool right away.',
    testName: 'Test Use',
    businessName: 'Business Use',
    testDescription: 'Try the tool with 2 analyses. Perfect for a quick test.',
    businessDescription: 'More analyses for your business needs. Great for regular work.',
    credits2: '2 analyses credits',
    credits10: '10 analyses credits',
    valid30: 'valid for 30 days',
    valid180: 'valid for 180 days',
    oneTime: 'one-time payment',
    buy: (credits: number, price: string) => `Buy ${credits} Analyses — ${price}`,
    loading: (credits: number) => `Preparing checkout for ${credits} credits...`,
    signInError: 'Please sign in before purchasing.',
    checkoutError: 'Unable to start checkout. Please try again.',
    currentPlan: 'Current Plan',
    availableCredits: 'Available Credits',
    testPack: 'Test Pack',
    businessPack: 'Business Pack',
    plan10: '10-analysis plan',
    remaining: (credits: number) => `Remaining analyses: ${credits}`,
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
    valid30: '30日間有効',
    valid180: '180日間有効',
    oneTime: '一回払い',
    buy: (credits: number, price: string) => `${credits}回分を購入 — ${price}`,
    loading: (credits: number) => `${credits}回分の決済を準備中...`,
    signInError: '購入するにはサインインしてください。',
    checkoutError: '決済を開始できませんでした。もう一度お試しください。',
    currentPlan: '現在のプラン',
    availableCredits: '現在の利用可能回数',
    testPack: 'テスト利用',
    businessPack: 'ビジネス利用',
    plan10: '10回分プラン',
    remaining: (credits: number) => `残り分析回数: ${credits}回`,
    planStatusLoading: '現在のクレジット残高を読み込んでいます...',
  },
} as const;
