import { FormEvent, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabaseClient';

interface ProtectedApiResponse {
  message: string;
  userId: string;
  email: string | null;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred.';
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [functionLoading, setFunctionLoading] = useState(false);
  const [authMode, setAuthMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
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

      setFunctionResult(data ?? null);
    } catch (functionError) {
      setError(getErrorMessage(functionError));
    } finally {
      setFunctionLoading(false);
    }
  }

  if (initializing) {
    return (
      <main className="page centered">
        <section className="card">
          <p className="muted">Loading session…</p>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="page centered">
        <section className="card auth-card">
          <p className="eyebrow">Supabase Auth</p>
          <h1>{authMode === 'sign-in' ? 'Sign in' : 'Create an account'}</h1>
          <p className="muted">
            Use email and password authentication. The browser only uses your Supabase URL and anon key.
          </p>

          <form className="form" onSubmit={handleAuthSubmit}>
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
              {authLoading ? 'Please wait…' : authMode === 'sign-in' ? 'Sign in' : 'Sign up'}
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
    <main className="page">
      <section className="hero card">
        <div>
          <p className="eyebrow">Protected dashboard</p>
          <h1>Welcome{session.user.email ? `, ${session.user.email}` : ''}</h1>
          <p className="muted">
            You are authenticated with Supabase. Call the protected Edge Function to verify your JWT on the server.
          </p>
        </div>
        <button className="secondary" disabled={authLoading} onClick={handleSignOut} type="button">
          {authLoading ? 'Signing out…' : 'Sign out'}
        </button>
      </section>

      <section className="card stack">
        <div>
          <h2>Protected server-side logic</h2>
          <p className="muted">
            This button invokes <code>protected-api</code> with <code>supabase.functions.invoke()</code> and sends the current user JWT in the Authorization header.
          </p>
        </div>

        <button className="primary" disabled={functionLoading} onClick={callProtectedFunction} type="button">
          {functionLoading ? 'Calling Edge Function…' : 'Call protected-api'}
        </button>

        {message && <p className="success">{message}</p>}
        {error && <p className="error">{error}</p>}

        {functionResult && (
          <pre className="result" aria-label="Protected API response">
            {JSON.stringify(functionResult, null, 2)}
          </pre>
        )}
      </section>
    </main>
  );
}
