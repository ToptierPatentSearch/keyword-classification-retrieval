# Supabase Auth + Protected Edge Function

This repository contains a minimal React + Vite + TypeScript app in `app/` that uses Supabase Auth on the frontend and calls a protected Supabase Edge Function in `supabase/functions/protected-api/`.

The React app uses `@supabase/supabase-js` v2 with only browser-safe Supabase configuration values. It does **not** expose service role keys.

## Project structure

```text
app/                                  # React + Vite + TypeScript frontend
app/src/lib/supabaseClient.ts          # Supabase browser client
supabase/functions/protected-api/      # Protected Edge Function
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

## Set environment variables

Copy the example file into a local Vite environment file:

```bash
cd app
cp .env.example .env.local
```

Edit `app/.env.local`:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Only use the anon public key in the React app. Do **not** put service role keys in any `VITE_*` variable because Vite exposes those values to the browser bundle.

## Run locally

```bash
cd app
npm run dev
```

Open `http://localhost:5173`, sign up or sign in, and then click **Call protected-api** on the dashboard.

## Deploy the Edge Function

Install and authenticate the Supabase CLI, then link this repository to your Supabase project from the repository root:

```bash
supabase login
supabase link --project-ref your-project-ref
```

Deploy the protected function:

```bash
supabase functions deploy protected-api
```

The deployed function is available at:

```text
https://your-project-ref.supabase.co/functions/v1/protected-api
```

The frontend calls it with `supabase.functions.invoke('protected-api')` and explicitly includes the signed-in user's JWT in the `Authorization: Bearer <token>` header. The Edge Function verifies that JWT with Supabase Auth before returning protected data.

## Security notes

- The frontend uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Never expose a Supabase service role key in React, Vite, or other browser code.
- Keep JWT verification enabled for this function in Supabase unless you have a specific reason to handle all verification yourself.
- The Edge Function uses the runtime-provided `SUPABASE_URL` and `SUPABASE_ANON_KEY` values to validate the authenticated user.
