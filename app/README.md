# React + Vite + Supabase Auth App

This is the frontend for the Supabase Auth + protected Edge Function example. It is intentionally minimal and uses `@supabase/supabase-js` v2.

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

Do not add service role keys to this app. Any `VITE_*` value is bundled for the browser.

## Run

```bash
npm run dev
```

After signing in, the dashboard calls the `protected-api` Edge Function with `supabase.functions.invoke()` and sends the current user's JWT in the `Authorization` header.

## Build

```bash
npm run build
```
