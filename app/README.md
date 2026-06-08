# Patent Keyword Classification App

A static React + Vite + TypeScript web app for multilingual English/Japanese patent keyword extraction and classification analysis. Users sign in with Supabase Authentication, submit patent text, and the browser calls a Supabase Edge Function at `/functions/v1/analyze`. The Edge Function uses the official OpenAI SDK and the OpenAI Responses API so the OpenAI API key is never exposed to frontend code.

## Features

- English/Japanese input with UTF-8 Japanese support.
- Language detection (`en` or `ja`).
- Technical keyword extraction with stopword and boilerplate exclusion.
- Synonym normalization such as `AI` / `artificial intelligence` and `semiconductor device` / `semiconductor apparatus`.
- Occurrence counts and frequency-based ranking.
- Likely IPC, CPC, FI, and F-term mapping with confidence levels.
- JSON-first result structure for future USPTO CPC, WIPO IPC, and JPO FI/F-term integrations.
- Results table and frontend PDF export via `jsPDF` and `jspdf-autotable`.

## 1. Install dependencies

```bash
cd app
npm install
npm run dev
```

For a production build:

```bash
npm run build
```

## 2. Configure Supabase URL and anon key

Copy the browser-safe environment example:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_BASE_PATH=/
```

Only `VITE_*` values are included in the frontend bundle. Do **not** add `OPENAI_API_KEY` to `.env.local`, `.env`, or frontend code.

In the Supabase dashboard:

1. Open **Authentication**.
2. Enable your preferred email sign-in/sign-up settings.
3. Confirm your Site URL and redirect URLs match your local and GitHub Pages URLs.

## 3. Set `OPENAI_API_KEY` as a Supabase secret

From the repository root, install and authenticate the Supabase CLI, then link your project:

```bash
supabase login
supabase link --project-ref your-project-ref
```

Set the OpenAI key as an Edge Function secret:

```bash
supabase secrets set OPENAI_API_KEY=sk-your-key
```

Optionally choose a model without changing code:

```bash
supabase secrets set OPENAI_MODEL=gpt-4.1-mini
```

## 4. Deploy the Edge Function

The function lives at:

```text
../supabase/functions/analyze/index.ts
```

Deploy it from the repository root:

```bash
supabase functions deploy analyze
```

The frontend calls:

```text
https://your-project-ref.supabase.co/functions/v1/analyze
```

The request includes the user's Supabase access token and the anon key in headers. Keep JWT verification enabled for the deployed function unless you intentionally make it public.

## 5. Deploy the frontend to GitHub Pages

For a user/organization GitHub Pages site, leave:

```bash
VITE_BASE_PATH=/
```

For a project site, set the repository path before building, for example:

```bash
VITE_BASE_PATH=/keyword-classification-retrieval/ npm run build
```

Then publish `app/dist` to GitHub Pages. Common options include:

- GitHub Actions using `actions/upload-pages-artifact` with `app/dist`.
- A `gh-pages` branch containing the built output.
- Manual upload through your preferred Pages deployment process.

## JSON response shape

```json
{
  "language": "en",
  "keywords": [
    {
      "term": "artificial intelligence",
      "normalized_term": "AI",
      "count": 2,
      "rank": 1,
      "ipc": ["G06N"],
      "cpc": ["G06N"],
      "fi": [],
      "f_term": [],
      "classification_confidence": "medium",
      "reason": "AI model used for technical image analysis."
    }
  ]
}
```

## Security notes

- `OPENAI_API_KEY` is read only by `supabase/functions/analyze/index.ts` from Supabase secrets.
- The frontend uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- No `server.js` or Express server is required.
- Do not commit `.env.local` or any file containing API keys.
