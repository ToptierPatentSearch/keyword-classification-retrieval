import Footer from "./components/Footer";
import termsOfUseText from './components/terms-of-use.txt?raw';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import AdminUserActivity from "./components/AdminUserActivity";
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import type { AnalysisResult } from './types';
import { PricingPlans } from './components/PricingPlans';
type PlanId = 'test' | 'business';
function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred.';
}

function formatEstimatedDuration(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `${totalSeconds} seconds`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return seconds === 0 ? `${minutes} minute${minutes === 1 ? '' : 's'}` : `${minutes} min ${seconds} sec`;
}

function estimateResultTime(characterCount: number): string {
  if (characterCount === 0) {
    return 'Estimated analysis time: enter English or Japanese text to calculate.';
  }

  const inputBlocks = Math.ceil(characterCount / 500);
  const minimumSeconds = 20 + (inputBlocks * 8);
  const maximumSeconds = minimumSeconds + 20 + (Math.ceil(characterCount / 2000) * 10);

  return `Estimated analysis time for ${characterCount.toLocaleString()} characters: ${formatEstimatedDuration(minimumSeconds)}–${formatEstimatedDuration(maximumSeconds)}.`;
}
type LandingPageProps = {
  onAcceptTerms: () => void;
};

function LandingPage({ onAcceptTerms }: LandingPageProps) {
  const [checked, setChecked] = useState(false);

  return (
    <main className="landing-page">
      <section className="landing-card">
        <p className="eyebrow">Patent AI Analysis</p>
        <h1>Keyword Classification Retrieval</h1>

        <p className="landing-lead">
          This app helps classify patent-related keywords from English or Japanese
          technical text and supports patent search preparation by organizing
          likely technical terms and classification-related information.
        </p>

        <div className="landing-section">
          <h2>Brief Features</h2>
          <ul>
            <li>Classifies patent-related keywords from technical text.</li>
            <li>Supports English and Japanese patent text.</li>
            <li>Helps organize terms for prior art search and patent analysis.</li>
            <li>Processes analysis securely after authentication.</li>
          </ul>
        </div>
        <div className="landing-section">
          <h2>Terms of Use</h2>
          <div className="muted terms-text">
            {termsOfUseText
              .split(/\n\s*\n/)
              .map((paragraph) => paragraph.trim())
              .filter(Boolean)
              .map((paragraph, index) => (
                <p key={`terms-paragraph-${index}`}>{paragraph}</p>
              ))}
          </div>
        </div>

        <label className="terms-check">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
          />
          <span>I accept the Terms of Use.</span>
        </label>

        <button
          className="primary-button"
          type="button"
          disabled={!checked}
          onClick={onAcceptTerms}
        >
          Continue to Sign Up / Sign In
        </button>
      </section>
    </main>
  );
}

function detectInputLanguage(text: string): string {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(text) ? "ja" : "en";
}

function estimateInputTokens(text: string): number {
  const chars = text.length;

  return /[\u3040-\u30ff\u3400-\u9fff]/.test(text)
    ? Math.ceil(chars * 0.9)
    : Math.ceil(chars / 4);
}

function formatPlanLabel(planId: PlanId | null): string {
  if (planId === 'test') return 'Test plan';
  if (planId === 'business') return 'Business plan';
  return '-';
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(date);

    const values = Object.fromEntries(
      parts
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value])
    );

    const localTimeAsUtc = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second)
    );

    return Math.round((localTimeAsUtc - date.getTime()) / 60000);
  } catch {
    return null;
  }
}

function getLocalTimeZoneAbbreviation(date: Date, timeZone: string): string {
  const offsetMinutes = getTimeZoneOffsetMinutes(date, timeZone);

  const fixedAbbreviations: Record<string, string> = {
    'Asia/Tokyo': 'JST',
    'Asia/Seoul': 'KST',
    'Asia/Shanghai': 'CST',
    'Asia/Hong_Kong': 'HKT',
    'Asia/Singapore': 'SGT',
    UTC: 'UTC',
  };

  if (fixedAbbreviations[timeZone]) {
    return fixedAbbreviations[timeZone];
  }

  const dstAwareAbbreviations: Record<
    string,
    { standard: string; daylight: string; standardOffset: number; daylightOffset: number }
  > = {
    'America/New_York': { standard: 'EST', daylight: 'EDT', standardOffset: -300, daylightOffset: -240 },
    'America/Detroit': { standard: 'EST', daylight: 'EDT', standardOffset: -300, daylightOffset: -240 },
    'America/Toronto': { standard: 'EST', daylight: 'EDT', standardOffset: -300, daylightOffset: -240 },
    'America/Chicago': { standard: 'CST', daylight: 'CDT', standardOffset: -360, daylightOffset: -300 },
    'America/Denver': { standard: 'MST', daylight: 'MDT', standardOffset: -420, daylightOffset: -360 },
    'America/Los_Angeles': { standard: 'PST', daylight: 'PDT', standardOffset: -480, daylightOffset: -420 },
    'America/Vancouver': { standard: 'PST', daylight: 'PDT', standardOffset: -480, daylightOffset: -420 },
    'Europe/Berlin': { standard: 'CET', daylight: 'CEST', standardOffset: 60, daylightOffset: 120 },
    'Europe/Paris': { standard: 'CET', daylight: 'CEST', standardOffset: 60, daylightOffset: 120 },
    'Europe/Rome': { standard: 'CET', daylight: 'CEST', standardOffset: 60, daylightOffset: 120 },
    'Europe/Madrid': { standard: 'CET', daylight: 'CEST', standardOffset: 60, daylightOffset: 120 },
    'Europe/Amsterdam': { standard: 'CET', daylight: 'CEST', standardOffset: 60, daylightOffset: 120 },
    'Europe/Brussels': { standard: 'CET', daylight: 'CEST', standardOffset: 60, daylightOffset: 120 },
    'Europe/Vienna': { standard: 'CET', daylight: 'CEST', standardOffset: 60, daylightOffset: 120 },
    'Europe/Zurich': { standard: 'CET', daylight: 'CEST', standardOffset: 60, daylightOffset: 120 },
    'Europe/Stockholm': { standard: 'CET', daylight: 'CEST', standardOffset: 60, daylightOffset: 120 },
    'Europe/Oslo': { standard: 'CET', daylight: 'CEST', standardOffset: 60, daylightOffset: 120 },
    'Europe/Copenhagen': { standard: 'CET', daylight: 'CEST', standardOffset: 60, daylightOffset: 120 },
    'Europe/Prague': { standard: 'CET', daylight: 'CEST', standardOffset: 60, daylightOffset: 120 },
    'Europe/Warsaw': { standard: 'CET', daylight: 'CEST', standardOffset: 60, daylightOffset: 120 },
    'Europe/Budapest': { standard: 'CET', daylight: 'CEST', standardOffset: 60, daylightOffset: 120 },
    'Europe/London': { standard: 'GMT', daylight: 'BST', standardOffset: 0, daylightOffset: 60 },
    'Australia/Sydney': { standard: 'AEST', daylight: 'AEDT', standardOffset: 600, daylightOffset: 660 },
    'Australia/Melbourne': { standard: 'AEST', daylight: 'AEDT', standardOffset: 600, daylightOffset: 660 },
  };

  const mappedZone = dstAwareAbbreviations[timeZone];

  if (mappedZone && offsetMinutes !== null) {
    if (offsetMinutes === mappedZone.daylightOffset) {
      return mappedZone.daylight;
    }

    return mappedZone.standard;
  }

  const timeZoneName = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    timeZoneName: 'short',
  })
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName')?.value;

  return timeZoneName || timeZone;
}

function formatLocalExpirationDate(isoString: string | null): string {
  if (!isoString) return '-';

  const date = new Date(isoString);

  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  const localTimeZone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  const formattedDate = new Intl.DateTimeFormat('en-US', {
    timeZone: localTimeZone,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);

  return `${formattedDate} ${getLocalTimeZoneAbbreviation(date, localTimeZone)}`;
}

export default function App() {
  const TERMS_ACCEPTED_KEY = 'kcr_terms_accepted';

  const [termsAccepted, setTermsAccepted] = useState<boolean>(() => {
    return window.localStorage.getItem(TERMS_ACCEPTED_KEY) === 'true';
  });

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
  const [creditRefreshKey, setCreditRefreshKey] = useState(0);
  const [remainingCreditsAfterAnalysis, setRemainingCreditsAfterAnalysis] = useState<number | null>(null);
  const [remainingCredits, setRemainingCredits] = useState<number | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanId | null>(null);
  const [creditsExpireAt, setCreditsExpireAt] = useState<string | null>(null);
  const [measuredEstimatedResultTime, setMeasuredEstimatedResultTime] = useState<string | null>(null);
  const analyzeInFlightRef = useRef(false);
  function handleAcceptTerms() {
    window.localStorage.setItem(TERMS_ACCEPTED_KEY, 'true');
    setTermsAccepted(true);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);
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
      setRemainingCredits(null);
      setCreditRefreshKey((key) => key + 1);
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

  useEffect(() => {
    let cancelled = false;

    async function fetchCreditBalance() {
      if (!session) {
        setRemainingCredits(null);
        setSelectedPlan(null);
        setCreditsExpireAt(null);
        return;
      }

      const { data, error } = await supabase
        .from('user_credit_balances')
        .select('remaining_credits, plan_mode, expires_at')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (cancelled) {
        return;
      }

      if (error) {
        console.error('Failed to fetch credit balance:', error);
        setRemainingCredits(0);
        setSelectedPlan(null);
        setCreditsExpireAt(null);
        return;
      }

      if (!data) {
        setRemainingCredits(0);
        setSelectedPlan(null);
        setCreditsExpireAt(null);
        return;
      }

      const remaining =
        typeof data.remaining_credits === 'number'
          ? data.remaining_credits
          : 0;
      const planMode =
        data.plan_mode === 'test' || data.plan_mode === 'business'
          ? data.plan_mode
          : null;
      const expiresAt =
        typeof data.expires_at === 'string' ? data.expires_at : null;
      const isExpired = expiresAt
        ? new Date(expiresAt).getTime() <= Date.now()
        : false;

      if (remaining <= 0 || isExpired) {
        setRemainingCredits(0);
        setSelectedPlan(null);
        setCreditsExpireAt(null);
        return;
      }

      setRemainingCredits(remaining);
      setSelectedPlan(planMode);
      setCreditsExpireAt(expiresAt);
    }

    void fetchCreditBalance();

    return () => {
      cancelled = true;
    };
  }, [session?.user.id, creditRefreshKey]);

  const sortedKeywords = useMemo(
    () =>
      Array.isArray(result?.keywords)
        ? result.keywords.slice().sort((a, b) => a.rank - b.rank)
        : [],
    [result],
  );

  const fallbackEstimatedResultTime = useMemo(
    () => estimateResultTime(text.trim().length),
    [text],
  );

  const estimatedResultTime =
    measuredEstimatedResultTime ?? fallbackEstimatedResultTime;
  useEffect(() => {
    const trimmedText = text.trim();

    if (!session || trimmedText.length === 0) {
      setMeasuredEstimatedResultTime(null);
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      const language = detectInputLanguage(trimmedText);

      const { data, error } = await supabase.rpc(
        'get_analysis_time_estimate',
        {
          p_input_chars: trimmedText.length,
          p_language: language,
        }
      );

      if (error || !Array.isArray(data) || data.length === 0) {
        setMeasuredEstimatedResultTime(null);
        return;
      }

      const estimate = data[0] as {
        sample_count: number;
        median_seconds: number | null;
        p90_seconds: number | null;
      };

      if (
        estimate.sample_count >= 3 &&
        estimate.median_seconds &&
        estimate.p90_seconds
      ) {
        setMeasuredEstimatedResultTime(
          `Estimated analysis time based on ${estimate.sample_count} previous analyses: ${formatEstimatedDuration(
            estimate.median_seconds
          )}–${formatEstimatedDuration(estimate.p90_seconds)}.`
        );
      } else {
        setMeasuredEstimatedResultTime(null);
      }
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [text, session?.user.id]);
  const creditsLoaded = typeof remainingCredits === 'number';
  const hasCredits = creditsLoaded && remainingCredits > 0;
  const noCredits = !creditsLoaded || remainingCredits <= 0;
  const showPurchaseCards = noCredits && !loading && !result;
  const showInputCard = hasCredits || result !== null;
  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setAuthMessage('');
    setAuthLoading(true);

    try {
      const { error: authError } =
        authMode === 'sign-in'
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: `${window.location.origin}/keyword-classification-retrieval/`,
            },
          });
      if (authError) {
        throw authError;
      }

      setAuthMessage(
        authMode === 'sign-in'
          ? 'Signed in successfully.'
          : 'Sign-up requested. Check your email if confirmation is enabled.',
      );
    } catch (authError) {
      setError(asErrorMessage(authError));
    } finally {
      setAuthLoading(false);
    }
  }
  async function handleAnalyze() {
    if (analyzeInFlightRef.current || loading) {
      return;
    }

    if (!session) {
      setError('Please sign in before analyzing patent text.');
      return;
    }

    if (!text.trim()) {
      setError('Enter English or Japanese patent text to analyze.');
      return;
    }

    analyzeInFlightRef.current = true;
    setLoading(true);
    setError('');
    setResult(null);
    setRemainingCreditsAfterAnalysis(null);

    const startedAt = Date.now();
    let analysisLogId: string | null = null;

    try {
      const { data: logRow, error: logInsertError } = await supabase
        .from('analysis_logs')
        .insert({
          user_id: session.user.id,
          input_chars: text.trim().length,
          estimated_input_tokens: estimateInputTokens(text),
          selected_model: 'gpt-5.5',
          language: detectInputLanguage(text),
          status: 'started',
          started_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (logInsertError) {
        console.error('Failed to insert analysis log:', logInsertError);
      } else {
        analysisLogId = logRow.id;
      }

      const { data, error: functionError } = await supabase.functions.invoke<
        AnalysisResult & { remainingCredits?: number }
      >('analyze', {
        body: { input: text },
      });

      if (functionError) {
        const response = (functionError as unknown as { context?: Response }).context;

        let errorBody: {
          error?: string;
          message?: string;
          remainingCredits?: number;
        } | null = null;

        if (response) {
          try {
            errorBody = await response.clone().json();
          } catch {
            errorBody = null;
          }
        }

        if (response?.status === 402) {
          if (analysisLogId) {
            await supabase
              .from('analysis_logs')
              .update({
                finished_at: new Date().toISOString(),
                duration_ms: Date.now() - startedAt,
                status: 'no_credits',
                error_message: 'No remaining analysis credits.',
              })
              .eq('id', analysisLogId);
          }

          setError('');
          setResult(null);
          setRemainingCreditsAfterAnalysis(0);
          setRemainingCredits(0);
          setSelectedPlan(null);
          setCreditsExpireAt(null);
          setCreditRefreshKey((key) => key + 1);
          return;
        }

        throw new Error(
          errorBody?.error ??
          errorBody?.message ??
          functionError.message
        );
      }

      if (!data) {
        throw new Error('Analyze request completed without returning a result.');
      }

      setResult(data);

      if (analysisLogId) {
        await supabase
          .from('analysis_logs')
          .update({
            finished_at: new Date().toISOString(),
            duration_ms: Date.now() - startedAt,
            output_chars: JSON.stringify(data).length,
            status: 'success',
          })
          .eq('id', analysisLogId);
      }

      const nextRemainingCredits =
        typeof data.remainingCredits === 'number'
          ? data.remainingCredits
          : Math.max((remainingCredits ?? 1) - 1, 0);

      setRemainingCreditsAfterAnalysis(nextRemainingCredits);
      setRemainingCredits(nextRemainingCredits);

      if (nextRemainingCredits <= 0) {
        setSelectedPlan(null);
        setCreditsExpireAt(null);
      } else {
        setCreditRefreshKey((key) => key + 1);
      }
    } catch (analyzeError) {
      if (analysisLogId) {
        await supabase
          .from('analysis_logs')
          .update({
            finished_at: new Date().toISOString(),
            duration_ms: Date.now() - startedAt,
            status: 'error',
            error_message: asErrorMessage(analyzeError),
          })
          .eq('id', analysisLogId);
      }

      setError(asErrorMessage(analyzeError));
    } finally {
      analyzeInFlightRef.current = false;
      setLoading(false);
    }
  }
  function handleClear() {
    setText('');
    setResult(null);
    setError('');
    setRemainingCreditsAfterAnalysis(null);
    setCreditRefreshKey((key) => key + 1);
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
    setRemainingCredits(null);
    setSelectedPlan(null);
    setCreditsExpireAt(null);
  }

  if (authLoading && !session) {
    return <main className="shell"><p className="status-card">Loading authentication…</p></main>;
  }


  if (!session && !termsAccepted) {
    return <LandingPage onAcceptTerms={handleAcceptTerms} />;
  }

  if (!session) {
    return (
      <main className="shell auth-shell">
        <section className="card auth-card">
          <p className="eyebrow">Patent AI Analysis</p>
          <h1>Sign in to classify patent keywords</h1>
          <p className="muted">
            Sign in to securely classify patent keywords. Your text is processed through our secure backend after authentication.
          </p>

          <form onSubmit={handleAuth} className="auth-form">
            <label>
              Email
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </label>
            <label>
              Password
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} />
            </label>
            <button className="primary" type="submit" disabled={authLoading}>
              {authLoading ? 'Working…' : authMode === 'sign-in' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <button className="link-button" type="button" onClick={() => setAuthMode(authMode === 'sign-in' ? 'sign-up' : 'sign-in')}>
            {authMode === 'sign-in' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
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
          <p className="eyebrow">English / Japanese Patent Intelligence</p>
          <h1>Keyword Extraction & Classification Analysis</h1>
          <p className="muted">
            Extract normalized technical terms, rank frequencies, and map likely IPC, CPC, FI, and F-term codes using a Supabase Edge Function.
          </p>
        </div>
        <div className="user-panel">
          <span>{session.user.email}</span>
          <button type="button" className="secondary" onClick={handleSignOut}>Sign out</button>
        </div>
      </header>
      {showPurchaseCards && (
        <PricingPlans
          session={session}
          onError={setError}
          refreshKey={creditRefreshKey}
          onCreditsChange={setRemainingCredits}
        />
      )}
      {hasCredits && (
        <section className="card">
          <p
            className="remaining-credits"
            style={{ fontSize: '1.25rem', fontWeight: 700, textAlign: 'center' }}
          >
            Remaining analysis credits: <strong>{remainingCredits}</strong>
          </p>
          {selectedPlan && creditsExpireAt && (
            <p
              className="credit-expiration"
              style={{ marginTop: '0.5rem', textAlign: 'center' }}
            >
              Selected plan: <strong>{formatPlanLabel(selectedPlan)}</strong>
              {' | '}
              Credits expire: <strong>{formatLocalExpirationDate(creditsExpireAt)}</strong>
            </p>
          )}
        </section>
      )}

      {showInputCard && (
        <section className="card input-card">
          <div className="section-heading">
            <h2>Patent text</h2>
            <span>{text.length.toLocaleString()} characters</span>
          </div>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Paste English or Japanese patent claims, abstracts, or descriptions…"
            spellCheck={false}
          />
          <p className="estimate">{estimatedResultTime}</p>
          <div className="actions">
            <button className="primary" type="button" onClick={handleAnalyze} disabled={loading || !hasCredits}>
              {loading ? 'Analyzing…' : 'Analyze'}
            </button>
            <button className="secondary" type="button" onClick={handleClear} disabled={loading}>
              Clear
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </section>
      )}

      {loading && (
        <p className="status-card">
          Analyzing text securely through Supabase Edge Functions… {estimatedResultTime}
        </p>
      )}
      {result && (
        <section className="card results-card">
          <div className="section-heading">
            <div>
              <h2>Results</h2>
              <p className="muted">Detected language: <strong>{result.language}</strong></p>



            </div>
            <button className="primary" type="button" onClick={handleDownloadPdf} disabled={!Array.isArray(result.keywords) || result.keywords.length === 0 || pdfLoading}>
              {pdfLoading ? 'Preparing PDF…' : 'Download PDF'}
            </button>
          </div>
          {result.warning && <p className="warning">{result.warning}</p>}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Term</th>
                  <th>Normalized Term</th>
                  <th>Count</th>
                  <th>Rank</th>
                  <th>IPC</th>
                  <th>CPC</th>
                  <th>FI</th>
                  <th>F-term</th>
                  <th>Confidence</th>
                  <th>Reason</th>
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
      <AdminUserActivity />

      <Footer />
    </main>
  );
}
