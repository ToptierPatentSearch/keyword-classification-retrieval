import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import type { AnalysisResult } from './types';

function estimateOutputTime(textLength: number, includePdf = false): string {
  const baseSeconds = 20;
  const lengthSeconds = Math.ceil(textLength / 2500) * 5;
  const pdfSeconds = includePdf ? 5 : 0;
  const lower = Math.min(90, baseSeconds + lengthSeconds + pdfSeconds);
  const upper = Math.min(120, lower + 20 + Math.ceil(textLength / 10000) * 10);

  return `Estimated output time: about ${lower}–${upper} seconds. This is a heuristic estimate, not a guarantee.`;
}

const sampleText = `A semiconductor device includes an AI-based defect detection unit. The artificial intelligence model analyzes wafer inspection images and classifies process abnormalities.\n半導体装置は、ウェハ検査画像を解析する人工知能モデルを含む。`;

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred.';
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [authMessage, setAuthMessage] = useState('');
  const [text, setText] = useState(sampleText);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [estimatedOutputTime, setEstimatedOutputTime] = useState('');
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState('');

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
    if (!session) {
      setError('Please sign in before analyzing patent text.');
      return;
    }

    if (!text.trim()) {
      setError('Enter English or Japanese patent text to analyze.');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);
    setEstimatedOutputTime(estimateOutputTime(text.trim().length));

    try {
      const { data, error: functionError } = await supabase.functions.invoke<AnalysisResult>('analyze', {
        body: { text },
      });

      if (functionError) {
        throw functionError;
      }

      if (!data) {
        throw new Error('Analyze request completed without returning a result.');
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

    const { downloadAnalysisPdf } = await import('./pdf');

    try {
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
    setEstimatedOutputTime('');
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
            Authenticate with Supabase before sending text to the secure Edge Function. The OpenAI API key stays server-side.
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
        <div className="actions">
          <button className="primary" type="button" onClick={handleAnalyze} disabled={loading}>
            {loading ? 'Analyzing…' : 'Analyze'}
          </button>
          <button className="secondary" type="button" onClick={() => setText('')} disabled={loading}>Clear</button>
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      {(loading || result) && (
        <section className="card results-card">
          {loading && (
            <div className="output-status">
              <h2>Results</h2>
              <p className="estimate">{estimatedOutputTime}</p>
              <p className="muted">Analyzing text securely through Supabase Edge Functions…</p>
            </div>
          )}

          {result && (
            <>
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
            </>
          )}
        </section>
      )}
    </main>
  );
}
