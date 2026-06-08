import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { downloadPatentReport, type AnalysisResult } from './pdf';
import { getAnalyzeEndpoint, isSupabaseConfigured, supabase } from './supabaseClient';
import './styles.css';

const sampleEnglish = `A semiconductor device includes an artificial intelligence accelerator, a memory controller, and a heat dissipation structure for reducing thermal resistance in the package.`;
const sampleJapanese = `半導体装置は、人工知能アクセラレータ、メモリ制御部、およびパッケージ内の熱抵抗を低減する放熱構造を備える。`;

const emptyAuth = { email: '', password: '' };

function codes(value: string[]) {
  return value.length ? value.join(', ') : '—';
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authForm, setAuthForm] = useState(emptyAuth);
  const [authMode, setAuthMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [authLoading, setAuthLoading] = useState(true);
  const [text, setText] = useState(sampleEnglish);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const characterCount = useMemo(() => text.trim().length, [text]);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        setAuthLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthLoading(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function handleAuthSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setAuthLoading(true);

    const authCall = authMode === 'sign-in'
      ? supabase.auth.signInWithPassword(authForm)
      : supabase.auth.signUp(authForm);

    const { error: authError } = await authCall;
    if (authError) {
      setError(authError.message);
    } else if (authMode === 'sign-up') {
      setError('Sign-up submitted. Check your email if confirmation is enabled, then sign in.');
    }

    setAuthLoading(false);
  }

  async function handleAnalyze() {
    setError(null);
    setResult(null);

    if (!text.trim()) {
      setError('Enter patent text in English or Japanese before analyzing.');
      return;
    }

    if (!session?.access_token) {
      setError('Please sign in before analyzing patent text.');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(getAnalyzeEndpoint(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ text }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? `Analyze request failed with HTTP ${response.status}.`);
      }

      setResult(payload as AnalysisResult);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unexpected analysis error.');
    } finally {
      setLoading(false);
    }
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="page narrow">
        <section className="card">
          <h1>Patent Keyword Classification</h1>
          <p className="error">Supabase environment variables are missing.</p>
          <p>Copy <code>app/.env.example</code> to <code>app/.env.local</code> and set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>.</p>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="page narrow">
        <section className="card hero-card">
          <p className="eyebrow">English / 日本語</p>
          <h1>Patent Keyword Classification</h1>
          <p>Sign in with Supabase Auth to analyze patent text securely through the Supabase Edge Function.</p>
          <form className="auth-form" onSubmit={handleAuthSubmit}>
            <label>
              Email
              <input
                type="email"
                autoComplete="email"
                value={authForm.email}
                onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete={authMode === 'sign-in' ? 'current-password' : 'new-password'}
                value={authForm.password}
                onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
                required
                minLength={6}
              />
            </label>
            {error && <p className={error.startsWith('Sign-up') ? 'notice' : 'error'}>{error}</p>}
            <button type="submit" disabled={authLoading}>{authLoading ? 'Please wait…' : authMode === 'sign-in' ? 'Sign in' : 'Create account'}</button>
          </form>
          <button className="link-button" onClick={() => setAuthMode(authMode === 'sign-in' ? 'sign-up' : 'sign-in')}>
            {authMode === 'sign-in' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <header className="app-header">
        <div>
          <p className="eyebrow">Secure Supabase Edge Function + OpenAI Responses API</p>
          <h1>Patent Keyword Classification</h1>
          <p>Extract multilingual technical keywords and map them to likely IPC, CPC, FI, and F-term classifications.</p>
        </div>
        <div className="user-panel">
          <span>{session.user.email}</span>
          <button className="secondary" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </header>

      <section className="grid">
        <div className="card input-card">
          <div className="card-header">
            <h2>Patent text</h2>
            <span>{characterCount.toLocaleString()} characters</span>
          </div>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Paste English or Japanese patent text here…"
          />
          <div className="button-row">
            <button onClick={handleAnalyze} disabled={loading}>{loading ? 'Analyzing…' : 'Analyze'}</button>
            <button className="secondary" onClick={() => setText(sampleEnglish)}>English sample</button>
            <button className="secondary" onClick={() => setText(sampleJapanese)}>日本語 sample</button>
          </div>
          {error && <p className="error">{error}</p>}
        </div>

        <div className="card guidance-card">
          <h2>What the analyzer returns</h2>
          <ul>
            <li>Language detection for English or Japanese.</li>
            <li>Ranked normalized technical keyword counts.</li>
            <li>GPT-assisted classification candidates with confidence.</li>
            <li>Conservative FI/F-term handling when mappings are uncertain.</li>
          </ul>
        </div>
      </section>

      <section className="card results-card">
        <div className="card-header">
          <div>
            <h2>Results</h2>
            {result && <p>Detected language: <strong>{result.language}</strong></p>}
          </div>
          <button className="secondary" onClick={() => result && downloadPatentReport(result)} disabled={!result}>Download PDF</button>
        </div>

        {loading && <p className="notice">Analyzing keywords and classifications…</p>}
        {result?.warning && <p className="notice">{result.warning}</p>}
        {!result && !loading && <p className="muted">Run an analysis to populate the table.</p>}

        {result && (
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
                {result.keywords.map((keyword) => (
                  <tr key={`${keyword.rank}-${keyword.normalized_term}`}>
                    <td>{keyword.term}</td>
                    <td>{keyword.normalized_term}</td>
                    <td>{keyword.count}</td>
                    <td>{keyword.rank}</td>
                    <td>{codes(keyword.ipc)}</td>
                    <td>{codes(keyword.cpc)}</td>
                    <td>{codes(keyword.fi)}</td>
                    <td>{codes(keyword.f_term)}</td>
                    <td><span className={`confidence ${keyword.classification_confidence}`}>{keyword.classification_confidence}</span></td>
                    <td>{keyword.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

export default App;
