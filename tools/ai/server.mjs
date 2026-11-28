// SynthLab's Ask panel: a local-only server. Never deployed (GitHub Pages serves static files only,
// so on the public site the Ask panel uses its free answer book and never offers Claude).
//
// It does three jobs:
//   1. serves the SynthLab folder, like `python3 -m http.server`, on http://localhost:8662
//   2. answers POST /api/ai/ask by calling the Claude API, so the API key stays in this process
//      and never reaches the browser, the page's storage, or the repository.
//   3. records questions the Ask panel couldn't answer (POST /api/ai/miss) in
//      ~/.synthlab-ai/unanswered.jsonl, outside the repo. List them: node tools/ai/unanswered.mjs
//
// The key: the ANTHROPIC_API_KEY environment variable, or the file ~/.synthlab-ai/key (outside the
// repo). The Ask panel can write that file for you (POST /api/ai/key), once, from this computer.
//
// Run:  cd tools/ai && npm install && node server.mjs            (then open http://localhost:8662/?synth=nf1)

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, d) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : d; };
const PORT = Number(arg('port', 8662));
const ROOT = path.resolve(arg('root', path.join(here, '..', '..')));
const KEY_DIR = path.join(os.homedir(), '.synthlab-ai');
const KEY_FILE = path.join(KEY_DIR, 'key');
const MODEL = 'claude-opus-5-5';
const MISS_FILE = path.join(KEY_DIR, 'unanswered.jsonl'); // questions the Ask panel couldn't answer

// ---- the key -------------------------------------------------------------------------------
function readKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY.trim();
  try { return fs.readFileSync(KEY_FILE, 'utf8').trim(); } catch { return ''; }
}
function saveKey(key) {
  if (!key) { try { fs.unlinkSync(KEY_FILE); } catch { /* none saved */ } return; }
  fs.mkdirSync(KEY_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(KEY_FILE, key + '\n', { mode: 0o600 });
}

// ---- the prompt ------------------------------------------------------------------------------
// The synth-specific part (the "guide": every control, its range and its help text) is built by
// the page from the synth's PARAMS and help.js (js/ai.js), so this file knows nothing about any
// one synth. It sits in the system prompt after the rules and is cached between requests.
const RULES = `You are the teaching assistant built into SynthLab, a web app where university students learn sound design on software synthesisers. The student is looking at the synth described below and types a request into the Ask panel.

There are two kinds of request.
1. A sound ("vibrato lead", "warm pad", "make it brighter"). Design it with the controls listed. Set kind to "sound". Use base "init" to build a new sound from the init patch (every control at its default), or base "current" to adjust the sound the student already has ("brighter", "more vibrato", "less", "now add..."). List only the controls you set, each with a short reason.
2. A question ("what does Resonance do?", "how do I make it brighter?"). Set kind to "answer" and answer it. Put the controls you talk about in point_at so the panel can highlight them. You may also change controls to demonstrate (base "current"), but only when it helps; otherwise leave changes empty.

The reply is what the student reads. Write it as a good teacher would: two to four short sentences, plain words, British spelling. Name controls the way the panel labels them, with their section ("the filter's Cutoff", "Oscillator 2's Detune"). For a sound, say what makes it that sound (which controls matter most and why) rather than listing every value; the panel lists the values itself. Do not use markdown.

Values: give each value as the plain number in the units stated for that control (Hz, seconds, cents, octaves, semitones, or a 0 to 1 fraction for levels and amounts, which the panel shows as a percentage). For a switch, give exactly one of its option values. Only use the control ids listed. If the synth can't do what was asked, say so briefly and make the closest sound it can. Never name real commercial instruments, brands or products.`;

function schemaFor(ids) {
  const id = { type: 'string', enum: ids };
  return {
    type: 'object',
    additionalProperties: false,
    required: ['kind', 'base', 'reply', 'changes', 'point_at'],
    properties: {
      kind: { type: 'string', enum: ['sound', 'answer'] },
      base: { type: 'string', enum: ['init', 'current'] },
      reply: { type: 'string' },
      changes: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['id', 'value', 'why'],
          properties: { id, value: { type: 'string' }, why: { type: 'string' } },
        },
      },
      point_at: { type: 'array', items: id },
    },
  };
}

async function ask(body) {
  const key = readKey();
  if (!key) return { status: 400, json: { error: 'No API key yet. Paste one into the Ask panel.' } };
  const { guide, ids, patch, history, request } = body;
  if (typeof request !== 'string' || !request.trim() || !Array.isArray(ids) || !ids.length || typeof guide !== 'string')
    return { status: 400, json: { error: 'Bad request from the page.' } };

  const messages = [];
  for (const t of (Array.isArray(history) ? history : []).slice(-8)) {
    if (t && (t.role === 'user' || t.role === 'assistant') && typeof t.text === 'string') messages.push({ role: t.role, content: t.text });
  }
  messages.push({
    role: 'user',
    content: `Current settings (control id = value):\n${Object.entries(patch || {}).map(([k, v]) => `${k} = ${v}`).join('\n')}\n\nThe student asks: ${request.trim().slice(0, 1000)}`,
  });

  const client = new Anthropic({ apiKey: key });
  const started = Date.now();
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default', // if a safety check declines, the API retries on a suitable model
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: schemaFor(ids) } },
      system: [
        { type: 'text', text: RULES },
        { type: 'text', text: guide, cache_control: { type: 'ephemeral' } },
      ],
      messages,
    });
    const ms = Date.now() - started;
    const usage = response.usage || {};
    console.log(`ask: ${ms} ms, in ${usage.input_tokens} (+${usage.cache_read_input_tokens || 0} cached, +${usage.cache_creation_input_tokens || 0} written), out ${usage.output_tokens}, stop ${response.stop_reason}`);
    if (response.stop_reason === 'refusal') return { status: 200, json: { error: 'The model declined this request.' } };
    if (response.stop_reason === 'max_tokens') return { status: 200, json: { error: 'The answer was cut off. Try a shorter request.' } };
    const text = response.content.find((b) => b.type === 'text');
    let out;
    try { out = JSON.parse(text ? text.text : ''); } catch { return { status: 502, json: { error: 'The answer could not be read.' } }; }
    return { status: 200, json: { result: out, usage, ms, model: response.model } };
  } catch (e) {
    console.error('ask failed:', e && e.message);
    if (e instanceof Anthropic.AuthenticationError) return { status: 401, json: { error: 'The API key was refused. Check it and paste it again.' } };
    if (e instanceof Anthropic.PermissionDeniedError) return { status: 403, json: { error: 'This API key is not allowed to use the model.' } };
    if (e instanceof Anthropic.RateLimitError) return { status: 429, json: { error: 'Too many requests just now. Wait a moment and try again.' } };
    if (e instanceof Anthropic.BadRequestError) return { status: 400, json: { error: 'The API rejected the request: ' + e.message } };
    if (e instanceof Anthropic.APIError) return { status: 502, json: { error: `The API had a problem (${e.status}). Try again.` } };
    return { status: 502, json: { error: 'Could not reach the API. Check the internet connection.' } };
  }
}

// ---- the server ------------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.md': 'text/plain; charset=utf-8',
};

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

// Only this page may use the API routes: a request from any other site (another tab, a page you
// visit) has a different Origin and is refused, so it can't spend your credit or change the key.
function sameOrigin(req) {
  const o = req.headers.origin;
  return o === `http://localhost:${PORT}` || o === `http://127.0.0.1:${PORT}`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 400_000) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname.startsWith('/api/ai/')) {
    if (url.pathname === '/api/ai/status' && req.method === 'GET') return sendJson(res, 200, { ok: true, hasKey: !!readKey(), fromEnv: !!process.env.ANTHROPIC_API_KEY, model: MODEL });
    if (req.method !== 'POST' || !sameOrigin(req) || !String(req.headers['content-type']).startsWith('application/json')) return sendJson(res, 403, { error: 'Not allowed.' });
    let body;
    try { body = await readBody(req); } catch { return sendJson(res, 400, { error: 'Bad request.' }); }
    if (url.pathname === '/api/ai/key') {
      const key = typeof body.key === 'string' ? body.key.trim() : '';
      if (key && !/^sk-ant-[\w-]{20,}$/.test(key)) return sendJson(res, 400, { error: 'That does not look like an Anthropic API key (they start with sk-ant-).' });
      saveKey(key);
      return sendJson(res, 200, { ok: true, hasKey: !!readKey() });
    }
    if (url.pathname === '/api/ai/miss') { // one line per question: list them with `node tools/ai/unanswered.mjs`
      const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
      const entry = { at: new Date().toISOString(), synth: str(body.synth, 20), reason: body.reason === 'not-helpful' ? 'not-helpful' : 'no-answer',
        mode: body.mode === 'claude' ? 'claude' : 'book', question: str(body.question, 500).trim(), reply: str(body.reply, 300) };
      if (!entry.question) return sendJson(res, 400, { error: 'No question.' });
      fs.mkdirSync(KEY_DIR, { recursive: true, mode: 0o700 });
      fs.appendFileSync(MISS_FILE, JSON.stringify(entry) + '\n', { mode: 0o600 });
      return sendJson(res, 200, { ok: true });
    }
    if (url.pathname === '/api/ai/ask') { const r = await ask(body); return sendJson(res, r.status, r.json); }
    return sendJson(res, 404, { error: 'Not found.' });
  }

  // static files from the SynthLab folder
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
  if (!file.startsWith(ROOT) || file.split(path.sep).includes('node_modules')) { res.writeHead(403); return res.end(); }
  try { if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html'); } catch { /* falls through to 404 */ }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`SynthLab with the Ask panel: http://localhost:${PORT}/?synth=nf1`);
  console.log(`Serving ${ROOT}. API key: ${process.env.ANTHROPIC_API_KEY ? 'from ANTHROPIC_API_KEY' : readKey() ? 'from ' + KEY_FILE : 'none yet (paste one into the Ask panel)'}.`);
});
