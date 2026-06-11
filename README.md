# Supabase Auth + Protected Edge Functions

This repository contains a React + Vite + TypeScript app in `app/` that uses Supabase Auth on the frontend and protected Supabase Edge Functions for server-side logic.

The React app uses `@supabase/supabase-js` v2 with only browser-safe Supabase configuration values. It does **not** expose service role keys or the OpenAI API key.

## Project structure

```text
app/                                  # React + Vite + TypeScript frontend
app/src/lib/supabaseClient.ts          # Supabase browser client
supabase/functions/analyze/            # Patent keyword analysis Edge Function
supabase/functions/protected-api/      # Minimal JWT verification Edge Function
```

## Install dependencies

```bash
cd app
npm install
```

## Create a Supabase project

1. Go to the [Supabase dashboard](https://supabase.com/dashboard).
2. Create a new project.
3. Open **Project Settings > API**.
4. Copy the project URL and anon public key.

## Enable Auth

1. In the Supabase dashboard, open **Authentication > Providers**.
2. Enable the **Email** provider.
3. For local development, open **Authentication > URL Configuration** and set:
   - Site URL: `http://localhost:5173`
   - Redirect URLs: `http://localhost:5173/**`
4. Choose whether email confirmations are required for sign-up in your project settings.

## Set frontend environment variables

Copy the browser-safe example file into a local Vite environment file:

```bash
cd app
cp .env.example .env.local
```

Edit `app/.env.local`:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Only use the anon public key in the React app. Do **not** put service role keys or `OPENAI_API_KEY` in any `VITE_*` variable because Vite exposes those values to the browser bundle.

## Run locally

```bash
cd app
npm run dev
```

Open `http://localhost:5173`, sign up or sign in, and then:

- Click **Analyze** to call the protected `analyze` Edge Function with the current user's JWT.
- Click **Call protected-api** to call the minimal JWT verification function.

## Configure Supabase Edge Function secrets

The `analyze` function calls OpenAI server-side, so configure the key as a Supabase secret from the repository root:

```bash
supabase login
supabase link --project-ref your-project-ref
supabase secrets set OPENAI_API_KEY=sk-your-key
```

Optionally set the model used by the analysis function:

```bash
supabase secrets set OPENAI_MODEL=gpt-4.1-mini
```

## Deploy the Edge Functions

Deploy both protected functions from the repository root. The checked-in `supabase/config.toml` is important because it lets CORS preflight requests reach the functions while the functions still verify the JWT themselves:

```bash
supabase functions deploy analyze --no-verify-jwt
supabase functions deploy protected-api --no-verify-jwt
```

The deployed functions are available at:

```text
https://your-project-ref.supabase.co/functions/v1/analyze
https://your-project-ref.supabase.co/functions/v1/protected-api
```

The frontend calls both functions with `supabase.functions.invoke()` and explicitly includes the signed-in user's JWT in the `Authorization: Bearer <token>` header. `supabase/config.toml` disables the Supabase gateway JWT check for these functions so browser CORS preflight requests are not blocked; each function verifies the JWT inside its handler before running protected logic.

## Security notes

- The frontend uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Never expose a Supabase service role key in React, Vite, or other browser code.
- Keep `OPENAI_API_KEY` only in Supabase Edge Function secrets.
- The `protected-api` function verifies the JWT with Supabase Auth before returning user data.
