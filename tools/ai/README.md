# Ask panel: local server (not public)

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
