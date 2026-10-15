const $ = id => document.getElementById(id);
const examples = [
  { text: 'Every great adventure begins with a', words: [['single', 32], ['small', 21], ['first', 16], ['simple', 11], ['bold', 7]], other: 13 },
  { text: 'In the quiet morning, I like to', words: [['read', 29], ['walk', 23], ['sit', 18], ['write', 12], ['think', 8]], other: 10 },
  { text: 'The best way to learn is to', words: [['practice', 37], ['do', 23], ['experiment', 15], ['ask', 10], ['try', 7]], other: 8 }
];
let storedUrl = '';
try { storedUrl = localStorage.getItem('nextword-backend') || ''; } catch {}
let apiBaseUrl = storedUrl || window.APP_CONFIG?.apiBaseUrl || '';
let mode = apiBaseUrl ? 'live' : 'demo';
let currentResult = null;
let pending = null;
let generation = 0;

function clearResults(message = '') {
  currentResult = null;
  $('results').hidden = true;
  $('empty-state').hidden = false;
  $('error').hidden = true;
  $('result-tag').textContent = '5 POSSIBILITIES';
  $('result-status').textContent = message;
}
function updateCount() { $('character-count').textContent = `${$('text').value.length.toLocaleString()} / 2,000`; }
function setBusy(busy) {
  $('predict-button').disabled = busy;
  $('loading').hidden = !busy;
  $('results').setAttribute('aria-busy', String(busy));
  $('predict-button').innerHTML = busy ? 'Thinking…' : `${mode === 'demo' ? 'Preview demo' : 'Predict next words'} <span aria-hidden="true">↗</span>`;
}
function cancelPending() {
  generation++;
  pending?.abort(); pending = null;
  setBusy(false);
}
function setMode(value) {
  cancelPending(); mode = value;
  document.querySelector(`input[name="mode"][value="${mode}"]`).checked = true;
  $('text').readOnly = mode === 'demo';
  $('mode-note').textContent = mode === 'demo' ? 'Demo uses three fixed examples. Choose a thought above to explore.' : 'Your text is sent to OpenAI when you predict. Scores are estimates.';
  if (mode === 'demo' && !examples.some(e => e.text === $('text').value)) $('text').value = examples[2].text;
  updateCount(); clearResults(); setBusy(false);
}
function renderResult(data, inputText, elapsed, demo) {
  currentResult = { inputText, demo };
  const list = $('word-list'); list.replaceChildren();
  data.suggestions.forEach((item, index) => {
    const li = document.createElement('li'); li.className = 'word-row';
    const button = document.createElement('button'); button.type = 'button'; button.className = 'word-button';
    button.setAttribute('aria-label', `${index + 1}. ${item.word}, estimated score ${item.score.toFixed(1)} percent. ${demo ? 'Connect the live API to continue this text.' : 'Add word to text.'}`);
    const rank = document.createElement('span'); rank.className = 'word-rank'; rank.textContent = String(index + 1).padStart(2, '0');
    const main = document.createElement('span'); main.className = 'word-main';
    const name = document.createElement('span'); name.className = 'word-name'; name.textContent = item.word;
    const track = document.createElement('span'); track.className = 'bar-track';
    const bar = document.createElement('span'); bar.className = 'bar'; bar.style.setProperty('--score', `${Math.max(0, Math.min(100, item.score))}%`);
    track.append(bar); main.append(name, track);
    const score = document.createElement('span'); score.className = 'word-score'; score.textContent = `${item.score.toFixed(1)}%`;
    button.append(rank, main, score); li.append(button); list.append(li);
    button.addEventListener('click', () => {
      if (demo) { $('mode-note').textContent = 'Switch to Live API to add words and continue your own text.'; return; }
      const nextText = `${inputText.trimEnd()} ${item.word}`;
      if (nextText.length > 2000) { showError('That word would exceed the 2,000-character limit. Shorten the text first.'); return; }
      $('text').value = nextText; updateCount(); clearResults(`Added ${item.word}. Predict again to continue.`); $('text').focus();
    });
  });
  $('other-score').textContent = `${data.otherScore.toFixed(1)}%`;
  $('result-tag').textContent = demo ? 'ILLUSTRATIVE DEMO' : `GPT-6 LUNA · ${elapsed.toFixed(1)}s`;
  document.querySelector('.append-hint').textContent = demo ? 'Fixed example scores · Switch to Live API for your text.' : 'Select a word to add it to your text ↖';
  $('empty-state').hidden = true; $('error').hidden = true; $('results').hidden = false;
  $('result-status').textContent = `${demo ? 'Illustrative demo' : 'Prediction'} ready. Five words ranked by estimated score. First: ${data.suggestions[0].word}.`;
}
function showError(message) {
  $('error').textContent = message; $('error').hidden = false;
  $('empty-state').hidden = true; $('results').hidden = true;
  $('result-status').textContent = '';
}
function validPayload(data) {
  return data?.scoreType === 'model_estimate' && data.model === 'gpt-6-luna' &&
    Array.isArray(data.suggestions) && data.suggestions.length === 5 &&
    data.suggestions.every(item => typeof item.word === 'string' && Number.isFinite(item.score) && item.score >= 0 && item.score <= 100) &&
    Number.isFinite(data.otherScore) && data.otherScore >= 0 && data.otherScore <= 100;
}
$('predict-form').addEventListener('submit', async event => {
  event.preventDefault();
  const text = $('text').value.trim();
  if (!text) { showError('Start with a sentence or a few words.'); $('text').focus(); return; }
  cancelPending();
  const run = generation;
  clearResults(); $('empty-state').hidden = true; setBusy(true);
  $('result-status').textContent = 'Finding possible next words.';
  const started = performance.now();
  try {
    if (mode === 'demo') {
      const sample = examples.find(e => e.text === text);
      if (!sample) throw new Error('Choose one of the three demo examples, or switch to Live API.');
      await new Promise(resolve => setTimeout(resolve, 350));
      if (run !== generation) return;
      renderResult({ suggestions: sample.words.map(([word, score]) => ({ word, score })), otherScore: sample.other }, text, 0, true);
    } else {
      pending = new AbortController();
      const timeout = setTimeout(() => pending?.abort(), 55000);
      let response;
      try {
        response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/api/predict`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }), signal: pending.signal
        });
      } finally { clearTimeout(timeout); }
      let data;
      try { data = await response.json(); }
      catch { throw new Error('The backend did not return JSON. Check your connection URL and Vercel deployment protection.'); }
      if (!response.ok) throw new Error(data.error || 'Prediction failed. Please try again.');
      if (!validPayload(data)) throw new Error('The backend returned an invalid prediction. Please try again.');
      if (run !== generation) return;
      renderResult(data, text, (performance.now() - started) / 1000, false);
    }
  } catch (error) {
    if (run !== generation) return;
    showError(error.name === 'AbortError' ? 'The request took too long. Please try again.' : error instanceof TypeError ? 'Could not connect. Check your backend URL, allowed origin, and internet connection.' : error.message);
  } finally {
    if (run === generation) { pending = null; setBusy(false); }
  }
});
$('text').addEventListener('input', () => { cancelPending(); updateCount(); clearResults(); });
$('text').addEventListener('keydown', event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); $('predict-form').requestSubmit(); } });
document.querySelectorAll('input[name="mode"]').forEach(input => input.addEventListener('change', () => setMode(input.value)));
document.querySelectorAll('[data-example]').forEach(button => button.addEventListener('click', () => {
  cancelPending(); $('text').value = examples[Number(button.dataset.example)].text; updateCount(); clearResults(); $('text').focus();
}));
$('clear').addEventListener('click', () => { cancelPending(); if (mode === 'demo') setMode('live'); $('text').value = ''; updateCount(); clearResults(); $('text').focus(); });
$('settings-toggle').addEventListener('click', () => {
  const opened = $('connection').hidden; $('connection').hidden = !opened; $('settings-toggle').setAttribute('aria-expanded', String(opened)); if (opened) $('backend-url').focus();
});
$('backend-url').value = apiBaseUrl;
$('connection-form').addEventListener('submit', event => {
  event.preventDefault(); const value = $('backend-url').value.trim();
  if (value) {
    let url; try { url = new URL(value); } catch { $('connection-status').textContent = 'Enter a valid backend URL.'; return; }
    const local = ['localhost', '127.0.0.1'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      $('connection-status').textContent = 'Use an HTTPS origin without a path, query, password, or fragment.'; return;
    }
    apiBaseUrl = url.origin;
  } else apiBaseUrl = '';
  try { localStorage.setItem('nextword-backend', apiBaseUrl); } catch {}
  $('backend-url').value = apiBaseUrl;
  $('connection-status').textContent = 'Connection saved. Run a prediction to check it.'; setMode('live');
});
setMode(mode);
