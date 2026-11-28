# Ask panel: local server (not public)

The Ask AI panel works without this server: on the NF-1 it answers from its free, offline
answer book (`js/askBook.js`, recipes in `js/askbooks/nf1.js`). This server only adds the
optional, paid Claude mode (the "Use Claude" button in the panel).

The Ask panel lets you type a request on a synth ("vibrato lead", "what does Resonance do?").
Claude sets the controls or answers. It only runs on your own computer.

    cd tools/ai
    npm install
    node server.mjs

Then open http://localhost:8662/?synth=nf1 and press **Ask** (top bar).

- **The API key** stays on this computer: the `ANTHROPIC_API_KEY` environment variable, or the
  file `~/.synthlab-ai/key`, which the panel writes when you paste a key. It's never in the
  repository or in the browser, and this server only answers requests from its own page.
- **Cost**: each request is billed to that key at Claude API rates (pay per use).
- **Public site**: GitHub Pages serves static files only, so there is no server there, and the panel
  never appears. `main.js` doesn't even load `js/ai.js` unless the page is on localhost.
- **Other synths**: the AI's description of the synth is generated from its `PARAMS`, sections and
  `help.js` (`buildGuide` in `js/ai.js`). Synths with cables are left out for now.

## Questions it couldn't answer

When the answer book can't answer a question, or someone presses **Not helpful** under an answer,
the panel sends the question to this server, which adds it to `~/.synthlab-ai/unanswered.jsonl`
(outside the repo; no names, just the question, the synth, the time and the answer given). To see
the list, most asked first:

    node tools/ai/unanswered.mjs                  # or --synth nfmod, or --csv > list.csv

Use it to decide what to add to the answer books in `js/askbooks/`.

### Collecting questions in a Google Sheet (for the public site)

The public site has no server, so visitors' questions go to a Google Sheet instead. Setting it up
takes about five minutes, in your own Google account:

1. Make a new Google Sheet (for example "SynthLab unanswered questions").
2. In it, open **Extensions > Apps Script**. Delete what's there, paste in the whole of
   `tools/ai/google-sheet-collector.gs`, and save.
3. Choose **setup** in the function menu at the top and press **Run**. Google asks you to allow the
   script to edit this Sheet: allow it. Two tabs appear, *Questions* and *By question*.
4. Press **Deploy > New deployment**, choose the type **Web app**, set *Execute as* to **Me** and
   *Who has access* to **Anyone**, and press **Deploy**. Copy the **Web app URL** it gives you
   (it ends in `/exec`).
5. Paste that URL into `SHEET_URL` near the top of `js/ai.js`, between the quotes.

From then on every unanswered question, and every answer marked Not helpful, adds a row to
*Questions*; *By question* groups them, most asked first. This works on this computer too, so you
can try it before launch.

"Anyone" means anyone with the URL can add rows (that's how the public page reaches it), not that
anyone can read the Sheet: only you can. The script trims long entries, keeps formulas out, and
stops adding rows after 2,000 in a day. If you change the script later, use **Deploy > Manage
deployments > Edit > New version** so the URL stays the same.
