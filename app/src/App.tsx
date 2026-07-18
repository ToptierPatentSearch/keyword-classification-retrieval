import Footer from "./components/Footer";
import termsOfUseText from './components/terms-of-use.txt?raw';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import AdminUserActivity from "./components/AdminUserActivity";
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import type {
  AnalysisResult,
  ClassificationCandidateEvidence,
  ClassificationCodeEvidence,
  ClassificationSystem,
} from './types';
import { PricingPlans } from './components/PricingPlans';
type PlanId = 'test' | 'business';

type ClassificationEvidenceCellProps = {
  system: ClassificationSystem;
  codes: string[];
  evidence?: ClassificationCodeEvidence[];
  candidates?: ClassificationCandidateEvidence[];
};

function ClassificationEvidenceCell({
  system,
  codes,
  evidence,
  candidates,
}: ClassificationEvidenceCellProps) {
  const evidenceItems: ClassificationCodeEvidence[] =
    evidence && evidence.length > 0
      ? evidence
      : codes.map((code) => ({
        code,
        status: 'ai_suggested' as const,
      }));

  const suggestedCodeKeys = new Set(
    evidenceItems.map((item) =>
      item.code.toUpperCase().replace(/[^A-Z0-9]/g, ''),
    ),
  );

  const additionalCandidates = (candidates ?? [])
    .filter(
      (candidate) =>
        !suggestedCodeKeys.has(
          candidate.code.toUpperCase().replace(/[^A-Z0-9]/g, ''),
        ),
    )
    .slice(0, 3);

  if (evidenceItems.length === 0 && additionalCandidates.length === 0) {
    return (
      <span style={{ color: '#64748b', fontSize: '0.8rem' }}>
        {system === 'FI'
          ? 'No FI candidate found in the currently imported FI coverage.'
          : '—'}
      </span>
    );
  }

  return (
    <div style={{ display: 'grid', gap: '0.7rem', minWidth: '13rem' }}>
      {evidenceItems.map((item, index) => {
        const databaseVerified = item.status === 'database_verified';
        const title = item.title_en || item.title_ja;

        return (
          <div
            key={`${system}-${item.code}-${index}`}
            style={{
              paddingBottom: '0.55rem',
              borderBottom: '1px solid #e2e8f0',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.4rem',
              }}
            >
              <strong>{item.code}</strong>
              <span
                style={{
                  display: 'inline-flex',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '999px',
                  background: databaseVerified ? '#dcfce7' : '#dbeafe',
                  color: databaseVerified ? '#166534' : '#1e40af',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  whiteSpace: 'nowrap',
                }}
              >
                {databaseVerified ? 'Database verified' : 'AI suggested'}
              </span>
            </div>

            {title && (
              <div
                style={{
                  marginTop: '0.25rem',
                  color: '#64748b',
                  fontSize: '0.78rem',
                  lineHeight: 1.35,
                }}
              >
                {title}
                {item.edition ? ` · ${item.edition}` : ''}
              </div>
            )}
          </div>
        );
      })}

      {additionalCandidates.length > 0 && (
        <div style={{ display: 'grid', gap: '0.45rem' }}>
          <span
            style={{
              color: '#475569',
              fontSize: '0.72rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Database candidates
          </span>
          {additionalCandidates.map((candidate) => {
            const title = candidate.title_en || candidate.title_ja;
            const score = Math.max(
              0,
              Math.min(
                1,
                candidate.match_score ?? candidate.similarity_score ?? 0,
              ),
            );

            return (
              <div
                key={`${system}-candidate-${candidate.code}`}
                style={{
                  padding: '0.45rem 0.55rem',
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.65rem',
                  background: '#f8fafc',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.4rem',
                  }}
                >
                  <strong>{candidate.code}</strong>
                  <span
                    style={{
                      color: '#6d28d9',
                      background: '#ede9fe',
                      borderRadius: '999px',
                      padding: '0.16rem 0.45rem',
                      fontSize: '0.7rem',
                      fontWeight: 800,
                    }}
                  >
                    Candidate {Math.round(score * 100)}%
                  </span>
                </div>
                {title && (
                  <div
                    style={{
                      marginTop: '0.2rem',
                      color: '#64748b',
                      fontSize: '0.76rem',
                      lineHeight: 1.35,
                    }}
                  >
                    {title}
                    {candidate.edition ? ` · ${candidate.edition}` : ''}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

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
  const [, setRemainingCreditsAfterAnalysis] = useState<number | null>(null);
  const [remainingCredits, setRemainingCredits] = useState<number | null>(null);
  const [, setSelectedPlan] = useState<PlanId | null>(null);
  const [creditsExpireAt, setCreditsExpireAt] = useState<string | null>(null);
  const analyzeInFlightRef = useRef(false);
  const pendingAnalyzeRequestRef = useRef<{
    requestId: string;
    input: string;
  } | null>(null);
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

  const estimatedResultTime = fallbackEstimatedResultTime;
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

    const trimmedText = text.trim();

    if (!trimmedText) {
      setError('Enter English or Japanese patent text to analyze.');
      return;
    }

    analyzeInFlightRef.current = true;
    setLoading(true);
    setError('');
    setResult(null);
    setRemainingCreditsAfterAnalysis(null);

    try {
      const pendingRequest = pendingAnalyzeRequestRef.current;
      const requestId =
        pendingRequest?.input === trimmedText
          ? pendingRequest.requestId
          : crypto.randomUUID();

      pendingAnalyzeRequestRef.current = {
        requestId,
        input: trimmedText,
      };

      const {
        data: { session: activeSession },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw new Error(`Unable to retrieve the signed-in session: ${sessionError.message}`);
      }

      const accessToken = activeSession?.access_token;

      if (!activeSession || !accessToken || activeSession.user.id !== session.user.id) {
        throw new Error('Your signed-in session is no longer valid. Please sign in again.');
      }

      const { data, error: functionError } =
        await supabase.functions.invoke<
          AnalysisResult & {
            requestId?: string;
            remainingCredits: number;
          }
        >('analyze', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          body: {
            input: trimmedText,
            request_id: requestId,
            selected_keywords: [],
          },
        });

      if (functionError) {
        const response = (
          functionError as unknown as { context?: Response }
        ).context;

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
          pendingAnalyzeRequestRef.current = null;
          setError('');
          setResult(null);
          setRemainingCreditsAfterAnalysis(0);
          setRemainingCredits(0);
          setSelectedPlan(null);
          setCreditsExpireAt(null);
          return;
        }

        throw new Error(
          errorBody?.error ??
          errorBody?.message ??
          functionError.message,
        );
      }

      if (!data) {
        throw new Error(
          'Analyze request completed without returning a result.',
        );
      }

      if (typeof data.remainingCredits !== 'number') {
        throw new Error(
          'Analyze returned no updated credit balance.',
        );
      }

      setResult(data);
      pendingAnalyzeRequestRef.current = null;
      setRemainingCreditsAfterAnalysis(data.remainingCredits);
      setRemainingCredits(data.remainingCredits);

      if (data.remainingCredits <= 0) {
        setSelectedPlan(null);
        setCreditsExpireAt(null);
      }
    } catch (analyzeError) {
      setError(asErrorMessage(analyzeError));
    } finally {
      analyzeInFlightRef.current = false;
      setLoading(false);
    }
  }
  function handleClear() {
    pendingAnalyzeRequestRef.current = null;
    setText('');
    setResult(null);
    setError('');
    setRemainingCreditsAfterAnalysis(null);
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
    pendingAnalyzeRequestRef.current = null;
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
        <div className="hero-copy">
          <p className="eyebrow">English / Japanese Patent Intelligence</p>
          <h1>Keyword Extraction & Classification Analysis</h1>
          {hasCredits && (
            <div className="credit-summary" aria-label="Credit status">
              <span className="user-detail">
                <span className="user-detail-label">Remaining credits</span>
                <strong>{remainingCredits}</strong>
              </span>
              {creditsExpireAt && (
                <span className="user-detail">
                  <span className="user-detail-label">Expiration date</span>
                  <strong>{formatLocalExpirationDate(creditsExpireAt)}</strong>
                </span>
              )}
            </div>
          )}
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
              <p className="muted" style={{ marginBottom: 0 }}>
                IPC, CPC, and FI suggestions are marked <strong>Database verified</strong>{' '}
                only when the code exists in the imported classification database.
                Additional title-matched entries are displayed as <strong>Database candidates</strong>.
                Unmatched codes and all F-term codes remain <strong>AI suggested</strong>.
              </p>

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
                    <td>
                      <ClassificationEvidenceCell
                        system="IPC"
                        codes={keyword.ipc}
                        evidence={keyword.ipc_evidence}
                        candidates={keyword.ipc_candidates}
                      />
                    </td>
                    <td>
                      <ClassificationEvidenceCell
                        system="CPC"
                        codes={keyword.cpc}
                        evidence={keyword.cpc_evidence}
                        candidates={keyword.cpc_candidates}
                      />
                    </td>
                    <td>
                      <ClassificationEvidenceCell
                        system="FI"
                        codes={keyword.fi}
                        evidence={keyword.fi_evidence}
                        candidates={keyword.fi_candidates}
                      />
                    </td>
                    <td>
                      <ClassificationEvidenceCell
                        system="F-term"
                        codes={keyword.f_term}
                        evidence={keyword.f_term_evidence}
                      />
                    </td>
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
