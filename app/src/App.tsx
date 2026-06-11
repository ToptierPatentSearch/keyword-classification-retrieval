import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabaseClient';
import { downloadAnalysisPdf } from './pdf';
import type { AnalysisResult } from './types';

const sampleText = `A semiconductor device includes an AI-based defect detection unit. The artificial intelligence model analyzes wafer inspection images and classifies process abnormalities.\n半導体装置は、ウェハ検査画像を解析する人工知能モデルを含む。`;

interface ProtectedApiResponse {
  message: string;
  userId: string;
  email: string | null;
}

function getErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'An unexpected error occurred.';

  if (message.toLowerCase().includes('failed to fetch')) {
    return 'Could not reach the Supabase Edge Function. Confirm the function is deployed with CORS preflight allowed (`supabase functions deploy analyze --no-verify-jwt`) and that VITE_SUPABASE_URL points to the same Supabase project.';
  }

  return message;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [functionLoading, setFunctionLoading] = useState(false);
  const [authMode, setAuthMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [text, setText] = useState(sampleText);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [functionResult, setFunctionResult] = useState<ProtectedApiResponse | null>(null);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!isMounted) return;

      if (sessionError) {
        setError(sessionError.message);
      }

      setSession(data.session);
      setInitializing(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setInitializing(false);
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const sortedKeywords = useMemo(
    () => result?.keywords.slice().sort((a, b) => a.rank - b.rank) ?? [],
    [result],
  );

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthLoading(true);
    setError('');
    setMessage('');
    setFunctionResult(null);

    try {
      const credentials = { email, password };
      const { error: authError } = authMode === 'sign-in'
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp(credentials);

      if (authError) {
        throw authError;
      }

      setMessage(
        authMode === 'sign-in'
          ? 'Signed in successfully.'
          : 'Account created. Check your email if confirmation is enabled for your Supabase project.',
      );
      setPassword('');
    } catch (authError) {
      setError(getErrorMessage(authError));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignOut() {
    setAuthLoading(true);
    setError('');
    setMessage('');
    setResult(null);
    setFunctionResult(null);

    try {
      const { error: signOutError } = await supabase.auth.signOut();

      if (signOutError) {
        throw signOutError;
      }
    } catch (signOutError) {
      setError(getErrorMessage(signOutError));
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

    setAnalyzeLoading(true);
    setError('');
    setMessage('');
    setResult(null);

    try {
      const { data, error: analyzeError } = await supabase.functions.invoke<AnalysisResult>('analyze', {
        body: { text },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (analyzeError) {
        throw analyzeError;
      }

      if (!data) {
        throw new Error('The analyze function returned an empty response.');
      }

      setResult(data);
    } catch (analyzeError) {
      setError(getErrorMessage(analyzeError));
    } finally {
      setAnalyzeLoading(false);
    }
  }

  async function callProtectedFunction() {
    if (!session) {
      setError('You must be signed in before calling the protected Edge Function.');
      return;
    }

    setFunctionLoading(true);
    setError('');
    setMessage('');
    setFunctionResult(null);

    try {
      const { data, error: functionError } = await supabase.functions.invoke<ProtectedApiResponse>(
        'protected-api',
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        },
      );

      if (functionError) {
        throw functionError;
      }

      if (!data) {
        throw new Error('The protected-api function returned an empty response.');
      }

      setFunctionResult(data);
    } catch (functionError) {
      setError(getErrorMessage(functionError));
    } finally {
      setFunctionLoading(false);
    }
  }

  if (initializing) {
    return (
      <main className="shell">
        <p className="status-card">Loading authentication…</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="shell auth-shell">
        <section className="card auth-card">
          <p className="eyebrow">Supabase Auth</p>
          <h1>Sign in to classify patent keywords</h1>
          <p className="muted">
            Authenticate with Supabase before sending text to secure Edge Functions. Browser code only uses your Supabase URL and anon key.
          </p>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            <label>
              Email
              <input
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </label>
            <label>
              Password
              <input
                autoComplete={authMode === 'sign-in' ? 'current-password' : 'new-password'}
                minLength={6}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>
            <button className="primary" disabled={authLoading} type="submit">
              {authLoading ? 'Working…' : authMode === 'sign-in' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <button
            className="link-button"
            onClick={() => {
              setAuthMode((currentMode) => (currentMode === 'sign-in' ? 'sign-up' : 'sign-in'));
              setError('');
              setMessage('');
            }}
            type="button"
          >
            {authMode === 'sign-in' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
          </button>
          {message && <p className="success">{message}</p>}
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
            Extract normalized technical terms, rank frequencies, and map likely IPC, CPC, FI, and F-term codes using Supabase Edge Functions.
          </p>
        </div>
        <div className="user-panel">
          <span>{session.user.email}</span>
          <button className="secondary" disabled={authLoading} onClick={handleSignOut} type="button">
            {authLoading ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </header>

      <section className="card input-card">
        <div className="section-heading">
          <h2>Patent text</h2>
          <span>{text.length.toLocaleString()} characters</span>
        </div>
        <textarea
          onChange={(event) => setText(event.target.value)}
          placeholder="Paste English or Japanese patent claims, abstracts, or descriptions…"
          spellCheck={false}
          value={text}
        />
        <div className="actions">
          <button className="primary" disabled={analyzeLoading} onClick={handleAnalyze} type="button">
            {analyzeLoading ? 'Analyzing…' : 'Analyze'}
          </button>
          <button className="secondary" disabled={analyzeLoading} onClick={() => setText('')} type="button">
            Clear
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      {analyzeLoading && <p className="status-card">Analyzing text securely through Supabase Edge Functions…</p>}

      {result && (
        <section className="card results-card">
          <div className="section-heading">
            <div>
              <h2>Results</h2>
              <p className="muted">Detected language: <strong>{result.language}</strong></p>
            </div>
            <button className="primary" disabled={result.keywords.length === 0} onClick={() => downloadAnalysisPdf(result)} type="button">
              Download PDF
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

      <section className="card protected-card">
        <div className="section-heading">
          <div>
            <h2>Protected server-side logic</h2>
            <p className="muted">
              Invoke <code>protected-api</code> with <code>supabase.functions.invoke()</code>. The current user JWT is sent in the Authorization header.
            </p>
          </div>
          <button className="primary" disabled={functionLoading} onClick={callProtectedFunction} type="button">
            {functionLoading ? 'Calling…' : 'Call protected-api'}
          </button>
        </div>

        {functionResult && (
          <pre className="result" aria-label="Protected API response">
            {JSON.stringify(functionResult, null, 2)}
          </pre>
        )}
      </section>
    </main>
  );
}
