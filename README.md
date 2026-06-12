<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy WriteRight AI

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/bca7cae0-bbf1-4ebc-b41d-206f409e64f3

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env.local` and set server-side provider keys:
   `ANTHROPIC_API_KEY` for live checking and `OPENAI_API_KEY` for paraphrasing
3. Run the app and API together:
   `npm run dev`

The Vite app runs on `http://localhost:3000` and proxies `/api/*` requests to the local Express server on port `8787`.

## Production

1. Build the frontend:
   `npm run build`
2. Start the Express server:
   `npm start`

The Express server serves both the API endpoints and the built `dist` frontend.

## GitHub Deployment Notes

It is safe to push this repo to GitHub because `.env.local` is ignored. Do not commit API keys.

For hosted deployments, connect the GitHub repo to a Node-capable host such as Render, Railway, Fly.io, Vercel server functions, or a VPS. Configure `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `HAIKU_MODEL`, and `OPENAI_PARAPHRASE_MODEL` in the host's environment settings.
