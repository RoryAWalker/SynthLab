// SynthLab Ask AI: collects the questions the Ask panel couldn't answer into this Google Sheet.
// Paste this whole file into the Sheet's Extensions > Apps Script editor, run setup() once, then
// deploy it as a web app (steps in tools/ai/README.md). The web app's URL goes in SHEET_URL in js/ai.js.
//
// Two tabs:
//   Questions     one row per question, newest at the bottom
//   By question   the same questions grouped, most asked first (a formula: it updates by itself)
//
// The page sends plain text (JSON inside), because a web page can't send anything else to Apps
// Script without the browser blocking it. Anyone who finds the URL could post to it, so entries are
// trimmed and the number of rows a day is capped.

const SHEET = 'Questions';
const DAILY_CAP = 2000; // rows a day at most; beyond that, entries are dropped until tomorrow
const HEADERS = ['When', 'Synth', 'Why', 'Question', 'Answer given', 'Mode'];

function setup() {
  const book = SpreadsheetApp.getActive();
  const sheet = book.getSheetByName(SHEET) || book.insertSheet(SHEET);
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(4, 360); sheet.setColumnWidth(5, 360);
  const sum = book.getSheetByName('By question') || book.insertSheet('By question');
  sum.getRange('A1').setFormula(
    `=QUERY(${SHEET}!A:F, "select lower(D), B, count(A), max(A) where D is not null group by lower(D), B order by count(A) desc label lower(D) 'Question', B 'Synth', count(A) 'Times asked', max(A) 'Last asked'", 1)`);
  sum.setColumnWidth(1, 360);
}

function doPost(e) {
  let d = {};
  try { d = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return reply('bad'); }
  const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  const question = str(d.question, 500).trim();
  if (!question) return reply('empty');

  // daily cap
  const props = PropertiesService.getScriptProperties();
  const today = Utilities.formatDate(new Date(), 'UTC', 'yyyy-MM-dd');
  const count = props.getProperty('day') === today ? Number(props.getProperty('count') || 0) : 0;
  if (count >= DAILY_CAP) return reply('cap');
  props.setProperties({ day: today, count: String(count + 1) });

  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET);
    // a leading = + - @ would be read as a formula: prefix it with ' so it stays text
    const safe = (s) => (/^[=+\-@]/.test(s) ? "'" + s : s);
    sheet.appendRow([new Date(), str(d.synth, 20), d.reason === 'not-helpful' ? 'not helpful' : 'no answer',
      safe(question), safe(str(d.reply, 300)), d.mode === 'claude' ? 'claude' : 'book']);
  } finally { lock.releaseLock(); }
  return reply('ok');
}

function reply(s) { return ContentService.createTextOutput(s); }
