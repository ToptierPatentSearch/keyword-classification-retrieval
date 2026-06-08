# Patent Keyword Analysis Web App

A multilingual English/Japanese patent keyword extraction and classification analysis web app.

## Architecture

- **Static frontend:** React + Vite + TypeScript, deployable to GitHub Pages.
- **Authentication:** Supabase Auth for login/sign-up.
- **Secure analysis:** Supabase Edge Function named `analyze` at `/functions/v1/analyze`.
- **OpenAI:** The Edge Function uses the official OpenAI SDK and the Responses API.
- **Secrets:** `OPENAI_API_KEY` is stored only as a Supabase Edge Function secret.
- **PDF:** The browser generates reports with `jsPDF` and `jspdf-autotable`.

## Folder Structure

```text
/app
  /src
    App.tsx
    main.tsx
    supabaseClient.ts
    pdf.ts
    styles.css
  index.html
  package.json
  vite.config.ts
  tsconfig.json
  .env.example
  README.md

/supabase
  /functions
    /analyze
      index.ts
```

## 1. Install dependencies

```bash
cd app
npm install
npm run dev
```

The development server starts with Vite. Copy the local URL printed by Vite into your browser.

## 2. Configure Supabase URL and anon key

Create a Supabase project, then copy `app/.env.example` to `app/.env.local`:

```bash
cp .env.example .env.local
```

Set these values in `app/.env.local`:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_BASE_PATH=/
```

For a GitHub Pages project site, set `VITE_BASE_PATH` to your repository path, for example:

```bash
VITE_BASE_PATH=/keyword-classification-retrieval/
```

The Supabase anon key is expected in frontend code. The OpenAI key is not.

## 3. Configure Supabase Auth

In the Supabase dashboard:

1. Open **Authentication > Providers**.
2. Enable email/password sign-in.
3. Open **Authentication > URL Configuration**.
4. Add your local development URL and GitHub Pages URL to allowed redirect URLs, for example:
   - `http://localhost:5173`
   - `https://YOUR_GITHUB_USER.github.io/keyword-classification-retrieval/`

## 4. Set `OPENAI_API_KEY` as a Supabase secret

Do not commit `.env.local` files or API keys.

From the repository root, run:

```bash
supabase secrets set OPENAI_API_KEY=sk-your-openai-key
```

Optional: set a model override for the Edge Function:

```bash
supabase secrets set OPENAI_MODEL=gpt-5.1
```

If `OPENAI_MODEL` is omitted, the function defaults to `gpt-5.1`.

## 5. Deploy the Supabase Edge Function

From the repository root:

```bash
supabase functions deploy analyze
```

The frontend calls the function at:

```text
https://your-project-ref.supabase.co/functions/v1/analyze
```

The frontend sends the signed-in user's Supabase JWT in the `Authorization` header. The function includes CORS headers for static hosting, including GitHub Pages.

## 6. Deploy the frontend to GitHub Pages

Build the static frontend:

```bash
cd app
npm run build
```

Deploy `app/dist` to GitHub Pages using your preferred workflow. A simple GitHub Actions flow should:

1. Check out the repository.
2. Run `cd app && npm ci && npm run build`.
3. Publish `app/dist` as the Pages artifact.

Make sure your GitHub Pages build environment has:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_BASE_PATH=/keyword-classification-retrieval/
```

## Expected Analysis JSON

The Edge Function returns JSON in this shape:

```json
{
  "language": "en",
  "keywords": [
    {
      "term": "artificial intelligence accelerator",
      "normalized_term": "AI accelerator",
      "count": 1,
      "rank": 1,
      "ipc": ["G06N"],
      "cpc": ["G06N"],
      "fi": [],
      "f_term": [],
      "classification_confidence": "medium",
      "reason": "Technical AI processing term; FI/F-term mapping is not specific enough from context."
    }
  ]
}
```

A top-level `warning` string may also be returned for long inputs.

## Security Notes

- Never put `OPENAI_API_KEY` in frontend code.
- Never commit real secrets in `.env` files.
- Use Supabase secrets for production Edge Function environment variables.
- The browser calls only `/functions/v1/analyze`; OpenAI API calls happen server-side in Supabase.

## Production Extension Points

The Edge Function prompt and JSON schema are intentionally extensible for future deterministic mapping integrations with:

- USPTO CPC data
- WIPO IPC data
- JPO FI/F-term data
