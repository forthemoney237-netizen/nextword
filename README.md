# Nextword

A complete-word suggestion app: a GitHub Pages frontend, a Vercel backend, and GPT-6 Luna through the OpenAI API. No third-party packages or build step required. Node.js 22 is used for the backend and local development.

## What the scores mean

The model generates five plausible complete words and **subjective estimated likelihood scores**. These are not token logprobs, calibrated probabilities, or a guaranteed exhaustive top five. The UI labels them as estimates. The backend normalizes all five estimates **together with** an “all other words” bucket so they total 100 before display rounding. Rounded percentages can differ slightly from 100.

The final word in the input is treated as complete, even without a trailing space. For example, `I like to rea` is treated as a finished context; it is not a partial-word autocomplete. Suggestions contain letters with optional internal apostrophes or hyphens. The backend checks structure and uniqueness; the model is responsible for linguistic completeness and plausibility.

## Try it locally

1. Open a terminal in this folder and run `node scripts/dev.mjs` (or `npm run dev`).
2. Visit http://127.0.0.1:3000.
3. Demo mode includes three fixed example sentences and clearly labeled illustrative scores. It does not call OpenAI. Demo text is read-only; select a different example using the chips.
4. For live predictions, copy `.env.example` to `.env.local` and set `OPENAI_API_KEY` privately. Start with `node --env-file=.env.local scripts/dev.mjs`, or use `npm run dev` to load it automatically.
5. Switch to **Live API**. Leave the connection URL blank to use the local backend. Enter any text, predict, and select a suggestion to append it. Ctrl+Enter / Cmd+Enter also predicts.

Do not paste an API key into the webpage or commit it to GitHub. Your browser sends the text to your backend, which sends it to OpenAI. This app does not persist text or log request bodies. OpenAI/provider retention policies still apply; `store: false` disables storing this completion for retrieval, rather than promising zero provider retention.

## Deploy the backend on Vercel

1. Create a GitHub repository and upload the contents of **this folder**, including `api/`, `lib/`, `docs/`, `package.json`, and `vercel.json`. Keep `.env.local` out of the upload.
2. In Vercel, add a project and import that repository. Choose **Other** as the framework, use the repository root as the Root Directory, and use Node.js 22. The included `vercel.json` sets the static output directory to `docs`; it also deploys `api/predict.js` as a Node function. There is no build command or dependency installation to perform.
3. In Vercel → Project Settings → Environment Variables, add these production values:

   | Name | Value |
   | --- | --- |
   | `OPENAI_API_KEY` | Your OpenAI API project key with access to `gpt-6-luna` |
   | `ALLOWED_ORIGINS` | `https://YOUR-USERNAME.github.io` |

   `ALLOWED_ORIGINS` accepts multiple comma-separated origins if needed. Use the origin only, without the repository path or a trailing slash. Do not use `*`. For a custom frontend domain, use that origin instead.

4. Deploy/redeploy after saving the environment values. Note your production URL, for example `https://your-backend.vercel.app`.
5. The backend must be reachable by ordinary browser requests. If deployment protection blocks your intended users, configure Vercel access appropriately. Never embed a deployment-protection bypass secret in public JavaScript.

The backend also serves the frontend on the Vercel domain; it can be used there with a blank connection URL if desired. The requested GitHub Pages setup is below.

## Deploy the frontend on GitHub Pages

1. Edit `docs/config.js`: set `apiBaseUrl` to your Vercel production origin, with no path, for example:

   ```js
   window.APP_CONFIG = { apiBaseUrl: "https://your-backend.vercel.app" };
   ```

   This is a public URL, not a secret. Never add your OpenAI key to this file.

2. Commit/upload the change to GitHub. Go to **Settings → Pages → Build and deployment**. Choose **Deploy from a branch**, select your default branch, and select the **`/docs`** folder. Save.
3. Open the published GitHub Pages URL. Static assets use relative URLs, so repository project paths work.
4. With a configured backend URL, the app starts in Live API mode. Predict to verify connectivity. A local saved connection takes precedence over `config.js`; clear the saved connection or save the correct URL through **Connection** when switching deployments.

You can also save a backend URL through **Connection** to try a deployment before editing `config.js`. The browser stores only that public URL locally.

## Before sharing a public paid endpoint

The API key stays on the server. CORS limits which browser origins can read responses, but **CORS is not authentication** and does not prevent direct requests to your endpoint. This starter does not include user authentication or durable rate limiting. Configure Vercel Firewall rate limits/access controls and appropriate OpenAI project usage limits before broadly sharing it. Each button press sends one billable model request; typing does not trigger requests. Input is limited to 2,000 characters, output to 500 tokens, and the provider request to 45 seconds. Requests and responses are not cached by the app.

## Checks

Run `node --test` for the backend tests with mocked provider responses, and `npm run check` for syntax checks. Mock tests do not establish that your account has model access. A real end-to-end prediction needs your private key, API credit, and a reachable deployed backend.

## Files

- `docs/` — static frontend; this is the folder published by GitHub Pages.
- `api/predict.js` — Vercel endpoint, origin controls, request size limits, error handling.
- `lib/predict.js` — GPT-6 Luna call, structured output schema, validation, score normalization.
- `scripts/dev.mjs` — local server for the frontend and backend.
- `test/` — meaningful backend behavior tests; no live API charges.

## Documentation

- [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna)
- [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Vercel Node.js functions](https://vercel.com/docs/functions/runtimes/node-js)
- [GitHub Pages setup](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)
