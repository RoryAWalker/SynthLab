// Lists the questions the Ask panel couldn't answer, and the answers someone marked "Not helpful",
// most asked first, so you can decide what to add to the answer books (js/askbooks/*.js).
//
//   node tools/ai/unanswered.mjs                 every question, grouped, with how often it was asked
//   node tools/ai/unanswered.mjs --synth nfmod   one synth only
//   node tools/ai/unanswered.mjs --csv > list.csv  the same as a spreadsheet
//   node tools/ai/unanswered.mjs --file other.jsonl  read another file (e.g. one downloaded from a
//                                                    hosted collector, in the same one-line-per-entry format)
//
// The list lives in ~/.synthlab-ai/unanswered.jsonl, written by tools/ai/server.mjs.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const arg = (name) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : null; };
const file = arg('file') || path.join(os.homedir(), '.synthlab-ai', 'unanswered.jsonl');
const only = arg('synth');
const csv = process.argv.includes('--csv');

let lines = [];
try { lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean); }
catch { console.log(`No questions recorded yet (${file} doesn't exist).`); process.exit(0); }

// group the same question asked in slightly different ways: case, spacing and end punctuation
const key = (q) => q.toLowerCase().replace(/[?!.,]+$/g, '').replace(/\s+/g, ' ').trim();
const groups = new Map();
for (const l of lines) {
  let e; try { e = JSON.parse(l); } catch { continue; }
  if (!e.question || (only && e.synth !== only)) continue;
  const k = (e.synth || '?') + '|' + key(e.question);
  const g = groups.get(k) || { question: e.question, synth: e.synth || '?', count: 0, noAnswer: 0, notHelpful: 0, first: e.at, last: e.at, reply: e.reply || '' };
  g.count++; if (e.reason === 'not-helpful') { g.notHelpful++; g.reply = e.reply || g.reply; } else g.noAnswer++;
  if (e.at < g.first) g.first = e.at; if (e.at > g.last) g.last = e.at;
  groups.set(k, g);
}
const list = [...groups.values()].sort((a, b) => b.count - a.count || (a.last < b.last ? 1 : -1));

if (csv) {
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  console.log('question,synth,times asked,no answer,not helpful,first asked,last asked,answer given (for not helpful)');
  for (const g of list) console.log([g.question, g.synth, g.count, g.noAnswer, g.notHelpful, g.first, g.last, g.notHelpful ? g.reply : ''].map(q).join(','));
} else if (!list.length) {
  console.log('No questions recorded' + (only ? ` for ${only}.` : '.'));
} else {
  console.log(`${list.length} different question${list.length === 1 ? '' : 's'}, ${list.reduce((n, g) => n + g.count, 0)} in all (${file}):\n`);
  for (const g of list) {
    const why = [g.noAnswer && `${g.noAnswer}× no answer`, g.notHelpful && `${g.notHelpful}× not helpful`].filter(Boolean).join(', ');
    console.log(`${String(g.count).padStart(4)}  [${g.synth}] ${g.question}   (${why}; last ${g.last.slice(0, 10)})`);
    if (g.notHelpful) console.log(`        answered: ${g.reply.slice(0, 140)}${g.reply.length > 140 ? '…' : ''}`);
  }
}
