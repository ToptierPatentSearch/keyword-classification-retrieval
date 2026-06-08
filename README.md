# Patent Keyword Classification Retrieval

This repository contains a complete static React/Vite frontend and a Supabase Edge Function for multilingual English/Japanese patent keyword extraction and patent classification analysis.

- Frontend: `app/` (React + Vite + TypeScript), suitable for GitHub Pages.
- Secure OpenAI processing: `supabase/functions/analyze/index.ts`, deployed as the Supabase Edge Function `analyze`.
- Authentication: Supabase Auth in the browser.
- API key safety: `OPENAI_API_KEY` is read only by the Edge Function from Supabase secrets and is never exposed to frontend code.

See [`app/README.md`](app/README.md) for setup, local development, Supabase deployment, and GitHub Pages deployment instructions.
