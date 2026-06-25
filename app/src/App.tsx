import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import type { AnalysisResult } from './types';

type AppLanguage = 'en' | 'ja';
type CurrencyCode = 'usd' | 'jpy' | 'eur';
type PlanId = 'test' | 'business';

const PRICE_IDS = {
  test_jpy: 'price_1TkwGxPgeq1kLGKwRzqmFE4H',
  test_usd: 'price_1TkwM7Pgeq1kLGKwh63ElRm9',
  test_eur: 'price_1TkwM7Pgeq1kLGKwL7cZcNbn',
  business_jpy: 'price_1TkgJcPgeq1kLGKw9lRAwT8b',
  business_usd: 'price_1TkgJcPgeq1kLGKwIDTaJW26',
  business_eur: 'price_1TkgJcPgeq1kLGKwQVVTvk51',
} as const;

const EURO_COUNTRIES = new Set([
  'AT', 'BE', 'HR', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PT', 'SK', 'SI', 'ES',
]);

const PLAN_PRICES: Record<PlanId, Record<CurrencyCode, number>> = {
  test: { usd: 2.99, jpy: 450, eur: 2.99 },
  business: { usd: 9.99, jpy: 1500, eur: 9.99 },
};

const PLAN_CREDITS: Record<PlanId, number> = {
  test: 2,
  business: 10,
};

const COPY = {
  en: {
    loadingAuth: 'Loading authentication…',
    signedIn: 'Signed in successfully.',
    signUpRequested: 'Sign-up requested. Check your email if confirmation is enabled.',
    signInRequiredPurchase: 'Please sign in before purchasing.',
    signInRequiredAnalyze: 'Please sign in before analyzing patent text.',
    emptyText: 'Enter English or Japanese patent text to analyze.',
    noResult: 'Analyze request completed without returning a result.',
    authEyebrow: 'Patent AI Analysis',
    authTitle: 'Sign in to classify patent keywords',
    authIntro: 'Authenticate with Supabase before sending text to the secure Edge Function. The OpenAI API key stays server-side.',
    email: 'Email',
    password: 'Password',
    working: 'Working…',
    signIn: 'Sign in',
    createAccount: 'Create account',
    needAccount: 'Need an account? Sign up',
    haveAccount: 'Already have an account? Sign in',
    eyebrow: 'English / Japanese Patent Intelligence',
    title: 'Keyword Extraction & Classification Analysis',
    intro: 'Extract normalized technical terms, rank frequencies, and map likely IPC, CPC, FI, and F-term codes using a Supabase Edge Function.',
    signOut: 'Sign out',
    planTitle: 'Choose the Right Plan for You',
    planIntro: 'Buy analysis credits and start using the tool right away.',
    testUse: 'Test Use',
    businessUse: 'Business Use',
    testDescription: 'Try the tool with 2 analyses. Perfect for a quick test.',
    businessDescription: 'More analyses for your business needs. Great for regular work.',
    analysisCredits: 'Analysis Credits',
    validFor: 'Valid for',
    days30: '30 days',
    days180: '180 days',
    oneTimePayment: 'One-time payment',
    buy: 'Buy',
    forTestUse: 'For Test Use',
    forBusinessUse: 'For Business Use',
    selectedCredits: 'Credits selected',
    openingCheckout: 'Opening checkout…',
    patentText: 'Patent text',
    characters: 'characters',
    placeholder: 'Paste English or Japanese patent claims, abstracts, or descriptions…',
    estimatedEmpty: 'Estimated result time: enter patent text to calculate.',
    estimatedFor: 'Estimated result time for',
    analyze: 'Analyze',
    analyzing: 'Analyzing…',
    clear: 'Clear',
    secureAnalyze: 'Analyzing text securely through Supabase Edge Functions…',
    results: 'Results',
    detectedLanguage: 'Detected language:',
    preparingPdf: 'Preparing PDF…',
    downloadPdf: 'Download PDF',
    columns: ['Term', 'Normalized Term', 'Count', 'Rank', 'IPC', 'CPC', 'FI', 'F-term', 'Confidence', 'Reason'],
  },
  ja: {
    loadingAuth: '認証情報を読み込み中…',
    signedIn: 'サインインしました。',
    signUpRequested: 'アカウント作成を受け付けました。確認メールが有効な場合はメールをご確認ください。',
    signInRequiredPurchase: '購入する前にサインインしてください。',
    signInRequiredAnalyze: '特許テキストを解析する前にサインインしてください。',
    emptyText: '解析する英語または日本語の特許テキストを入力してください。',
    noResult: '解析リクエストは完了しましたが、結果が返されませんでした。',
    authEyebrow: '特許AI解析',
    authTitle: 'サインインして特許キーワードを分類',
    authIntro: '安全なEdge Functionへテキストを送信する前にSupabaseで認証します。OpenAI APIキーはサーバー側で保護されます。',
    email: 'メールアドレス',
    password: 'パスワード',
    working: '処理中…',
    signIn: 'サインイン',
    createAccount: 'アカウント作成',
    needAccount: 'アカウントが必要ですか？登録',
    haveAccount: 'アカウントをお持ちですか？サインイン',
    eyebrow: '英語 / 日本語 特許インテリジェンス',
    title: 'キーワード抽出・分類解析',
    intro: '正規化した技術用語を抽出し、頻度をランク付けして、関連するIPC、CPC、FI、FタームをSupabase Edge Functionで推定します。',
    signOut: 'サインアウト',
    planTitle: '最適なプランを選択',
    planIntro: '解析クレジットを購入して、すぐにツールを利用できます。',
    testUse: 'テスト利用',
    businessUse: 'ビジネス利用',
    testDescription: '2回分の解析でツールを試せます。短時間の確認に最適です。',
    businessDescription: '業務に必要な解析回数をまとめて利用できます。継続的な作業に最適です。',
    analysisCredits: '解析クレジット',
    validFor: '有効期間',
    days30: '30日',
    days180: '180日',
    oneTimePayment: '一回払い',
    buy: '購入',
    forTestUse: 'テスト利用向け',
    forBusinessUse: 'ビジネス利用向け',
    selectedCredits: 'クレジット選択済み',
    openingCheckout: '決済ページを開いています…',
    patentText: '特許テキスト',
    characters: '文字',
    placeholder: '英語または日本語の特許請求の範囲、要約、明細書を貼り付けてください…',
    estimatedEmpty: '推定結果時間: 特許テキストを入力すると計算します。',
    estimatedFor: '推定結果時間',
    analyze: '解析',
    analyzing: '解析中…',
    clear: 'クリア',
    secureAnalyze: 'Supabase Edge Functions経由で安全に解析中…',
    results: '結果',
    detectedLanguage: '検出言語:',
    preparingPdf: 'PDFを準備中…',
    downloadPdf: 'PDFをダウンロード',
    columns: ['用語', '正規化用語', '回数', '順位', 'IPC', 'CPC', 'FI', 'Fターム', '信頼度', '理由'],
  },
} as const;

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred.';
}

function getBrowserLanguage(): AppLanguage {
  return navigator.language.toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

function getLocaleCountry(): string {
  const locale = navigator.language || 'en-US';
  const country = locale.split('-')[1]?.toUpperCase();
  return country || 'US';
}

function getCurrencyForCountry(country: string): CurrencyCode {
  if (country === 'JP') {
    return 'jpy';
  }

  if (EURO_COUNTRIES.has(country)) {
    return 'eur';
  }

  return 'usd';
}

function formatPrice(amount: number, currency: CurrencyCode, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
    maximumFractionDigits: currency === 'jpy' ? 0 : 2,
  }).format(amount);
}

function formatEstimatedDuration(totalSeconds: number, language: AppLanguage): string {
  if (totalSeconds < 60) {
    return language === 'ja' ? `${totalSeconds}秒` : `${totalSeconds} seconds`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (language === 'ja') {
    return seconds === 0 ? `${minutes}分` : `${minutes}分${seconds}秒`;
  }

  return seconds === 0 ? `${minutes} minute${minutes === 1 ? '' : 's'}` : `${minutes} min ${seconds} sec`;
}

function estimateResultTime(characterCount: number, language: AppLanguage): string {
  const t = COPY[language];

  if (characterCount === 0) {
    return t.estimatedEmpty;
  }

  const inputBlocks = Math.ceil(characterCount / 500);
  const minimumSeconds = 20 + (inputBlocks * 8);
  const maximumSeconds = minimumSeconds + 20 + (Math.ceil(characterCount / 2000) * 10);

  if (language === 'ja') {
    return `${t.estimatedFor}（${characterCount.toLocaleString()}文字）: ${formatEstimatedDuration(minimumSeconds, language)}〜${formatEstimatedDuration(maximumSeconds, language)}。`;
  }

  return `${t.estimatedFor} ${characterCount.toLocaleString()} characters: ${formatEstimatedDuration(minimumSeconds, language)}–${formatEstimatedDuration(maximumSeconds, language)}.`;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [authMessage, setAuthMessage] = useState('');
  const [text, setText] = useState('');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState('');
  const [clickedPlan, setClickedPlan] = useState<PlanId | null>(null);

  const language = useMemo(getBrowserLanguage, []);
  const locale = useMemo(() => navigator.language || (language === 'ja' ? 'ja-JP' : 'en-US'), [language]);
  const currency = useMemo(() => getCurrencyForCountry(getLocaleCountry()), []);
  const t = COPY[language];

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthLoading(false);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const sortedKeywords = useMemo(
    () =>
      Array.isArray(result?.keywords)
        ? result.keywords.slice().sort((a, b) => a.rank - b.rank)
        : [],
    [result],
  );

  const estimatedResultTime = useMemo(
    () => estimateResultTime(text.trim().length, language),
    [language, text],
  );

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setAuthMessage('');
    setAuthLoading(true);

    try {
      const { error: authError } = authMode === 'sign-in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

      if (authError) {
        throw authError;
      }

      setAuthMessage(authMode === 'sign-in' ? t.signedIn : t.signUpRequested);
    } catch (authError) {
      setError(asErrorMessage(authError));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleCheckout(plan: PlanId) {
    if (!session) {
      setError(t.signInRequiredPurchase);
      return;
    }

    setError('');
    setClickedPlan(plan);

    try {
      const priceId = PRICE_IDS[`${plan}_${currency}`];
      const { data, error } = await supabase.functions.invoke(
        'create-checkout-session',
        {
          body: {
            priceId,
            quantity: 1,
          },
        },
      );

      if (error) {
        throw error;
      }

      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (checkoutError) {
      setClickedPlan(null);
      setError(asErrorMessage(checkoutError));
    }
  }

  async function handleAnalyze() {
    if (!session) {
      setError(t.signInRequiredAnalyze);
      return;
    }

    if (!text.trim()) {
      setError(t.emptyText);
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const { data, error: functionError } = await supabase.functions.invoke<AnalysisResult>('openai-proxy', {
        body: { input: text },
      });

      if (functionError) {
        throw functionError;
      }

      if (!data) {
        throw new Error(t.noResult);
      }

      setResult(data);
    } catch (analyzeError) {
      setError(asErrorMessage(analyzeError));
    } finally {
      setLoading(false);
    }
  }

  async function handleDownloadPdf() {
    if (!result) {
      return;
    }

    setPdfLoading(true);
    setError('');

    try {
      const { downloadAnalysisPdf } = await import('./pdf');
      downloadAnalysisPdf(result);
    } catch (pdfError) {
      setError(asErrorMessage(pdfError));
    } finally {
      setPdfLoading(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setResult(null);
  }

  function renderPlan(plan: PlanId) {
    const credits = PLAN_CREDITS[plan];
    const isTest = plan === 'test';
    const isClicked = clickedPlan === plan;
    const planLabel = isTest ? t.testUse : t.businessUse;
    const duration = isTest ? t.days30 : t.days180;
    const price = formatPrice(PLAN_PRICES[plan][currency], currency, locale);

    return (
      <article className={`plan-card ${isTest ? 'test-plan' : 'business-plan'}`}>
        <div className="plan-top">
          <div className="plan-icon" aria-hidden="true">{isTest ? '⚗' : '💼'}</div>
          <div>
            <h3>{credits} Analyses</h3>
            <p>{planLabel}</p>
          </div>
        </div>
        <div className="plan-body">
          <p className="plan-description">{isTest ? t.testDescription : t.businessDescription}</p>
          <ul className="plan-features">
            <li><span>✓</span>{credits} {t.analysisCredits}</li>
            <li><span>✓</span>{t.validFor} {duration}</li>
          </ul>
          <div className="plan-divider" />
          <p className="plan-price">{price}</p>
          <p className="plan-payment">{t.oneTimePayment}</p>
          <button
            className="plan-button"
            type="button"
            onClick={() => handleCheckout(plan)}
            disabled={clickedPlan !== null}
          >
            <span aria-hidden="true">🛒</span>
            <span>
              {isClicked ? `${credits} ${t.selectedCredits}` : `${t.buy} ${credits} Analyses`}
              <small>{isClicked ? t.openingCheckout : isTest ? t.forTestUse : t.forBusinessUse}</small>
            </span>
          </button>
        </div>
      </article>
    );
  }

  if (authLoading && !session) {
    return <main className="shell"><p className="status-card">{t.loadingAuth}</p></main>;
  }

  if (!session) {
    return (
      <main className="shell auth-shell">
        <section className="card auth-card">
          <p className="eyebrow">{t.authEyebrow}</p>
          <h1>{t.authTitle}</h1>
          <p className="muted">{t.authIntro}</p>

          <form onSubmit={handleAuth} className="auth-form">
            <label>
              {t.email}
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </label>
            <label>
              {t.password}
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} />
            </label>
            <button className="primary" type="submit" disabled={authLoading}>
              {authLoading ? t.working : authMode === 'sign-in' ? t.signIn : t.createAccount}
            </button>
          </form>

          <button className="link-button" type="button" onClick={() => setAuthMode(authMode === 'sign-in' ? 'sign-up' : 'sign-in')}>
            {authMode === 'sign-in' ? t.needAccount : t.haveAccount}
          </button>
          {authMessage && <p className="success">{authMessage}</p>}
          {error && <p className="error">{error}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">{t.eyebrow}</p>
          <h1>{t.title}</h1>
          <p className="muted">{t.intro}</p>
        </div>
        <div className="user-panel">
          <span>{session.user.email}</span>
          <button type="button" className="secondary" onClick={handleSignOut}>{t.signOut}</button>
        </div>
      </header>

      <section className="plans-section" aria-labelledby="plans-title">
        <div className="plans-heading">
          <h2 id="plans-title">{t.planTitle}</h2>
          <p>{t.planIntro}</p>
        </div>
        <div className="plans-grid">
          {renderPlan('test')}
          {renderPlan('business')}
        </div>
      </section>

      <section className="card input-card">
        <div className="section-heading">
          <h2>{t.patentText}</h2>
          <span>{text.length.toLocaleString()} {t.characters}</span>
        </div>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t.placeholder}
          spellCheck={false}
        />
        <p className="estimate">{estimatedResultTime}</p>
        <div className="actions">
          <button className="primary" type="button" onClick={handleAnalyze} disabled={loading}>
            {loading ? t.analyzing : t.analyze}
          </button>
          <button className="secondary" type="button" onClick={() => setText('')} disabled={loading}>{t.clear}</button>
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      {loading && <p className="status-card">{t.secureAnalyze} {estimatedResultTime}</p>}

      {result && (
        <section className="card results-card">
          <div className="section-heading">
            <div>
              <h2>{t.results}</h2>
              <p className="muted">{t.detectedLanguage} <strong>{result.language}</strong></p>
            </div>
            <button className="primary" type="button" onClick={handleDownloadPdf} disabled={!Array.isArray(result.keywords) || result.keywords.length === 0 || pdfLoading}>
              {pdfLoading ? t.preparingPdf : t.downloadPdf}
            </button>
          </div>
          {result.warning && <p className="warning">{result.warning}</p>}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {t.columns.map((column) => <th key={column}>{column}</th>)}
                </tr>
              </thead>
              <tbody>
                {sortedKeywords.map((keyword) => (
                  <tr key={`${keyword.rank}-${keyword.normalized_term}`}>
                    <td>{keyword.term}</td>
                    <td>{keyword.normalized_term}</td>
                    <td>{keyword.count}</td>
                    <td>{keyword.rank}</td>
                    <td>{keyword.ipc.join(', ') || '—'}</td>
                    <td>{keyword.cpc.join(', ') || '—'}</td>
                    <td>{keyword.fi.join(', ') || '—'}</td>
                    <td>{keyword.f_term.join(', ') || '—'}</td>
                    <td><span className={`badge ${keyword.classification_confidence}`}>{keyword.classification_confidence}</span></td>
                    <td>{keyword.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
