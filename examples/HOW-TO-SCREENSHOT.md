# How to regenerate the README hero image

`README.md` references `./examples/sample-report-preview.png`. The PNG needs to be generated manually (once, then committed). Here are three easy paths.

## Option A — macOS: VSCode Markdown Preview (recommended)

1. Open `examples/sample-report.md` in VSCode
2. `Cmd+K V` → Markdown preview opens on the right
3. Capture the "AI × Query Matrix" section through the "Tracked Competitors" barchart (roughly the first two SVG charts — the most informative fold)
4. Screenshot: `Cmd+Shift+4` → select the rendered area → saves to Desktop
5. Rename to `sample-report-preview.png`
6. Move: `mv ~/Desktop/sample-report-preview.png ./examples/`
7. Commit

Target dimensions: ~900-1200px wide, 400-600px tall. Any reasonable PNG works; npm will scale it.

## Option B — Marked 2 / MacDown / Typora

1. Open `examples/sample-report.md` in any GUI markdown viewer that renders inline SVG
2. Export to PDF or screenshot the rendered view
3. Save as `examples/sample-report-preview.png`

## Option C — Chromium headless (scriptable, zero-GUI)

If you have Chromium or Chrome installed, you can script it:

```bash
# Convert sample-report.md to HTML first (any tool works — here's a zero-deps one-liner)
node -e "
const fs = require('fs');
const md = fs.readFileSync('examples/sample-report.md', 'utf-8');
// very basic markdown → html; SVG blocks pass through untouched
const html = md
  .replace(/^# (.+)$/gm, '<h1>\$1</h1>')
  .replace(/^## (.+)$/gm, '<h2>\$1</h2>')
  .replace(/^### (.+)$/gm, '<h3>\$1</h3>');
fs.writeFileSync('/tmp/sample-report.html', '<html><body style=\"font-family:system-ui;max-width:900px;margin:40px auto;padding:20px\">' + html + '</body></html>');
"

# Then Chrome headless
chrome --headless --screenshot=examples/sample-report-preview.png --window-size=1200,800 file:///tmp/sample-report.html

# Or chromium / google-chrome-stable / edge
```

## Until the PNG exists

The `![...](./examples/sample-report-preview.png)` tag in README shows a broken image icon on GitHub. `npm view` on npmjs.com will simply not render any image for that line (no visible failure, just empty).

Generate and commit the PNG before `npm publish` for first-impression conversion.
