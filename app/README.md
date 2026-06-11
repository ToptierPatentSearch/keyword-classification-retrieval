# React + Vite + Supabase Auth App

This is the frontend for the Supabase Auth + protected Edge Functions example. It uses `@supabase/supabase-js` v2.

## Install

```bash
npm install
```

## Configure Supabase

Create a Supabase project, enable the Email Auth provider, and copy your project URL and anon public key into `.env.local`:

```bash
cp .env.example .env.local
```

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Do not add service role keys or OpenAI keys to this app. Any `VITE_*` value is bundled for the browser.

## Run

```bash
npm run dev
```

After signing in, the dashboard can:

- Call the `analyze` Edge Function from the **Analyze** button using `supabase.functions.invoke()` and the current user's JWT.
- Call the `protected-api` Edge Function using `supabase.functions.invoke()` and the current user's JWT.

## Build

```bash
npm run build
```
