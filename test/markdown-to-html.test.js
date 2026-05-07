// Tests for the tiny markdown → HTML converter used by the HTML report.

import assert from 'node:assert/strict';
import { mdToHtml } from '../lib/report/markdown-to-html.js';

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { failed++; console.log(`  ✗ ${name}\n    ${err.message}`); }
}

console.log('\nmdToHtml — headers');

test('h2', () => assert.equal(mdToHtml('## Hello'), '<h2>Hello</h2>'));
test('h3', () => assert.equal(mdToHtml('### Sub'), '<h3>Sub</h3>'));
test('h6', () => assert.equal(mdToHtml('###### Tiny'), '<h6>Tiny</h6>'));

console.log('\nmdToHtml — inline');

test('bold', () => assert.ok(mdToHtml('a **bold** word').includes('<strong>bold</strong>')));
test('italic with *', () => assert.ok(mdToHtml('a *italic* word').includes('<em>italic</em>')));
test('italic with _', () => assert.ok(mdToHtml('a _italic_ word').includes('<em>italic</em>')));
test('inline code', () => assert.ok(mdToHtml('use `npm test` here').includes('<code>npm test</code>')));
test('link', () => assert.ok(mdToHtml('[label](https://x.com)').includes('<a href="https://x.com">label</a>')));
test('link with javascript: scheme is neutralised to #', () => {
  const html = mdToHtml('[click](javascript:alert(1))');
  assert.ok(html.includes('href="#"'));
  assert.ok(!html.includes('javascript:'));
});
test('link with data: scheme is neutralised to #', () => {
  const html = mdToHtml('[x](data:text/html,<script>alert(1)</script>)');
  assert.ok(html.includes('href="#"'));
});
test('link label with raw < is HTML-escaped (XSS defence-in-depth)', () => {
  const html = mdToHtml('[<script>](https://x.com)');
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<a href="https://x.com"><script>'));
});
test('link label pre-escaped with &amp; is not double-encoded', () => {
  const html = mdToHtml('[Foo &amp; Bar](https://x.com)');
  assert.ok(html.includes('Foo &amp; Bar'));
  assert.ok(!html.includes('&amp;amp;'));
});

console.log('\nmdToHtml — tables');

test('basic 2-column table', () => {
  const md = `| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |`;
  const html = mdToHtml(md);
  assert.ok(html.includes('<table class="md-table">'));
  assert.ok(html.includes('<th>A</th>'));
  assert.ok(html.includes('<td>1</td>'));
  assert.ok(html.includes('<td>4</td>'));
});

test('table with inline markdown in cells', () => {
  const md = `| Name | Score |\n|---|---|\n| **Webappski** | 82 |`;
  const html = mdToHtml(md);
  assert.ok(html.includes('<strong>Webappski</strong>'));
});

test('alignment row tolerated', () => {
  const md = `| A | B |\n|:---|---:|\n| 1 | 2 |`;
  const html = mdToHtml(md);
  assert.ok(html.includes('<table'));
});

console.log('\nmdToHtml — raw HTML pass-through');

test('inline span passes through', () => {
  const md = `<span style="color:red">hi</span>`;
  const html = mdToHtml(md);
  assert.ok(html.includes('<span style="color:red">hi</span>'));
});

test('details/summary block passes through', () => {
  const md = `<details><summary>x</summary>body</details>`;
  const html = mdToHtml(md);
  assert.ok(html.includes('<details>'));
  assert.ok(html.includes('<summary>'));
});

test('div with inline svg passes through', () => {
  const md = `<div>before</div>\n<svg viewBox="0 0 10 10"><circle/></svg>\n<div>after</div>`;
  const html = mdToHtml(md);
  assert.ok(html.includes('<svg'));
  assert.ok(html.includes('viewBox="0 0 10 10"'));
});

console.log('\nmdToHtml — lists & blockquotes');

test('bullet list', () => {
  const md = `- one\n- two\n- three`;
  const html = mdToHtml(md);
  assert.ok(html.includes('<ul>'));
  assert.ok(html.includes('<li>one</li>'));
  assert.ok(html.includes('<li>three</li>'));
});

test('blockquote', () => {
  const html = mdToHtml('> warning text');
  assert.ok(html.includes('<blockquote>'));
  assert.ok(html.includes('warning text'));
});

console.log('\nmdToHtml — paragraphs & defensive');

test('plain paragraph wrapped in <p>', () => {
  const html = mdToHtml('a simple sentence here.');
  assert.ok(html.includes('<p>a simple sentence here.</p>'));
});

test('empty input → empty', () => {
  assert.equal(mdToHtml(''), '');
  assert.equal(mdToHtml(null), '');
  assert.equal(mdToHtml(undefined), '');
});

test('handles header followed by table', () => {
  const md = `## Title\n\n| A | B |\n|---|---|\n| 1 | 2 |`;
  const html = mdToHtml(md);
  assert.ok(html.includes('<h2>Title</h2>'));
  assert.ok(html.includes('<table'));
});

test('preserves order of mixed content', () => {
  const md = `## Header\n\n_intro line_\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n<div>raw</div>`;
  const html = mdToHtml(md);
  const hPos = html.indexOf('<h2>');
  const tPos = html.indexOf('<table');
  const dPos = html.indexOf('<div>raw</div>');
  assert.ok(hPos < tPos && tPos < dPos);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
