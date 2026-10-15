import test from 'node:test';
import assert from 'node:assert/strict';
import { predict, validatePredictions } from '../lib/predict.js';
import { createHandler } from '../api/predict.js';

const sample = () => ({ suggestions: [
  { word: 'practice', score: 35 }, { word: 'do', score: 20 },
  { word: 'try', score: 15 }, { word: 'experiment', score: 10 },
  { word: 'ask', score: 5 }
], other_score: 15 });
const mockOpenAI = async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(sample()) } }] });
const makeRequest = (text, origin = 'https://writer.github.io') => new Request('https://nextword.vercel.app/api/predict', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ text })
});
const env = { OPENAI_API_KEY: 'test-only-placeholder', ALLOWED_ORIGINS: 'https://writer.github.io', VERCEL: '1' };

test('returns complete words, retains remainder, and sorts estimates without top-five renormalization', () => {
  const input = sample(); input.suggestions.reverse();
  const result = validatePredictions(input);
  assert.equal(result.suggestions[0].word, 'practice');
  assert.equal(result.suggestions[0].score, 35);
  assert.equal(result.otherScore, 15);
});
test('normalizes all six estimated buckets together when the model total is not 100', () => {
  const input = sample(); input.other_score = 85;
  const result = validatePredictions(input);
  assert.ok(Math.abs(result.suggestions.reduce((n, item) => n + item.score, result.otherScore) - 100) < 1e-9);
  assert.ok(result.suggestions[0].score < 35);
});
test('rejects duplicates, fragments containing spaces, bad scores, and wrong number of words', () => {
  for (const mutate of [
    s => { s.suggestions[1].word = 'PRACTICE'; },
    s => { s.suggestions[1].word = 'try again'; },
    s => { s.suggestions[1].score = -3; },
    s => { s.suggestions[1].score = NaN; },
    s => { s.suggestions.pop(); },
    s => { s.other_score = 101; }
  ]) { const input = sample(); mutate(input); assert.throws(() => validatePredictions(input), { status: 502 }); }
});
test('supports Unicode words and internal apostrophes', () => {
  const input = sample(); input.suggestions[1].word = '배우다'; input.suggestions[2].word = "don't";
  assert.equal(validatePredictions(input).suggestions[1].word, '배우다');
});
test('sends Luna a structured complete-word request with a server-side key', async () => {
  const result = await predict('I want to', { apiKey: 'test-key', fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer test-key');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'gpt-6-luna');
    assert.equal(body.reasoning_effort, 'none');
    assert.equal(body.response_format.json_schema.strict, true);
    assert.equal(body.store, false);
    assert.equal(body.messages[1].content, 'I want to');
    return mockOpenAI();
  } });
  assert.equal(result.scoreType, 'model_estimate');
  assert.equal(result.suggestions.length, 5);
});
test('input validation and missing key fail without an upstream request', async () => {
  let calls = 0; const fetchImpl = () => { calls++; };
  for (const text of ['', null, 'x'.repeat(2001)]) await assert.rejects(predict(text, { apiKey: 'key', fetchImpl }), { status: 400 });
  await assert.rejects(predict('hello', { fetchImpl }), { status: 503 });
  assert.equal(calls, 0);
});
test('maps provider errors, refusals, and truncated responses without exposing upstream secrets', async () => {
  for (const [upstream, expected] of [[401, 503], [403, 503], [404, 503], [429, 429], [500, 502]]) {
    await assert.rejects(predict('hello', { apiKey: 'key', fetchImpl: async () => new Response('private provider body', { status: upstream }) }), error => error.status === expected && !error.message.includes('private provider body'));
  }
  await assert.rejects(predict('hello', { apiKey: 'key', fetchImpl: async () => Response.json({ choices: [{ message: { refusal: 'refused' } }] }) }), { status: 422 });
  await assert.rejects(predict('hello', { apiKey: 'key', fetchImpl: async () => Response.json({ choices: [{ finish_reason: 'length', message: {} }] }) }), { status: 502 });
});
test('allows the configured frontend and returns no-store responses', async () => {
  const response = await createHandler({ env, fetchImpl: mockOpenAI })(makeRequest('I want to'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://writer.github.io');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal((await response.json()).suggestions.length, 5);
});
test('rejects disallowed origins before making any billable call', async () => {
  let called = false;
  const response = await createHandler({ env, fetchImpl: () => { called = true; } })(makeRequest('hello', 'https://unapproved.example'));
  assert.equal(response.status, 403); assert.equal(called, false);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
});
test('handles preflight, unsupported methods, malformed JSON, and oversized bodies', async () => {
  const handle = createHandler({ env, fetchImpl: mockOpenAI });
  const base = 'https://nextword.vercel.app/api/predict';
  assert.equal((await handle(new Request(base, { method: 'OPTIONS', headers: { Origin: 'https://writer.github.io' } }))).status, 204);
  assert.equal((await handle(new Request(base))).status, 405);
  assert.equal((await handle(new Request(base, { method: 'POST', body: '{}' }))).status, 415);
  assert.equal((await handle(new Request(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }))).status, 400);
  assert.equal((await handle(new Request(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(16385) }))).status, 413);
});
