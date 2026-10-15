import { predict, PredictionError } from '../lib/predict.js';

export function createHandler({ env = process.env, fetchImpl = fetch } = {}) {
  return async function handle(request) {
    const headers = new Headers({ 'Cache-Control': 'no-store', Vary: 'Origin', 'X-Content-Type-Options': 'nosniff' });
    const origin = request.headers.get('origin');
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const sameOrigin = new URL(request.url).origin;
    // Local origins are only implicit outside Vercel production/preview.
    if (!env.VERCEL) allowed.push('http://127.0.0.1:3000', 'http://localhost:3000');
    const json = (data, status = 200) => Response.json(data, { status, headers });
    if (origin && origin !== sameOrigin && !allowed.includes(origin)) return json({ error: 'This frontend origin is not allowed by the backend.' }, 403);
    if (origin) headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') {
      headers.set('Allow', 'POST, OPTIONS');
      return json({ error: 'Use POST to request a prediction.' }, 405);
    }
    if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) {
      return json({ error: 'Send a JSON request.' }, 415);
    }
    try {
      if (Number(request.headers.get('content-length')) > 16384) return json({ error: 'Request is too large.' }, 413);
      const reader = request.body?.getReader();
      if (!reader) return json({ error: 'Send a JSON request body.' }, 400);
      const chunks = []; let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 16384) { await reader.cancel(); return json({ error: 'Request is too large.' }, 413); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      let body;
      try { body = JSON.parse(new TextDecoder().decode(bytes)); }
      catch { return json({ error: 'Request body must be valid JSON.' }, 400); }
      return json(await predict(body?.text, { apiKey: env.OPENAI_API_KEY, fetchImpl }));
    } catch (error) {
      if (error instanceof PredictionError) return json({ error: error.message }, error.status);
      return json({ error: 'Prediction failed. Please try again.' }, 500);
    }
  };
}

export default { fetch: createHandler() };
