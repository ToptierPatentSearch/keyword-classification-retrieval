import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
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
    return 'Estimated result time: enter patent text to calculate.';
  }

  const inputBlocks = Math.ceil(characterCount / 500);
  const minimumSeconds = 20 + (inputBlocks * 8);
  const maximumSeconds = minimumSeconds + 20 + (Math.ceil(characterCount / 2000) * 10);

  return `Estimated result time for ${characterCount.toLocaleString()} characters: ${formatEstimatedDuration(minimumSeconds)}–${formatEstimatedDuration(maximumSeconds)}.`;
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
  const [creditRefreshKey, setCreditRefreshKey] = useState(0);
  const [remainingCreditsAfterAnalysis, setRemainingCreditsAfterAnalysis] = useState<number | null>(null);
  const [remainingCredits, setRemainingCredits] = useState<number | null>(null);
  const analyzeInFlightRef = useRef(false);
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
  const sortedKeywords = useMemo(
    () =>
      Array.isArray(result?.keywords)
        ? result.keywords.slice().sort((a, b) => a.rank - b.rank)
        : [],
    [result],
  );

  const estimatedResultTime = useMemo(
    () => estimateResultTime(text.trim().length),
    [text],
  );
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

    try {
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
          setError('');
          setResult(null);
          setRemainingCreditsAfterAnalysis(0);
          setRemainingCredits(0);
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

      setRemainingCreditsAfterAnalysis(0);
      setRemainingCredits(0);
    } catch (analyzeError) {
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
    setRemainingCredits(0);
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

  if (authLoading && !session) {
    return <main className="shell"><p className="status-card">Loading authentication…</p></main>;
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
    </main>
  );
}
