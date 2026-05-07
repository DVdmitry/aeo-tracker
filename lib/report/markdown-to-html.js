/**
 * Tiny markdown → HTML converter, scoped to the constructs our report sections
 * actually emit. Zero dependencies, pure function.
 *
 * Supported:
 *   - `## Header` → `<h2>...</h2>`
 *   - `### Sub`   → `<h3>...</h3>`
 *   - Pipe tables (with header + alignment row + body)
 *   - `**bold**`, `*italic*`, `_italic_`, `` `code` ``
 *   - `[label](url)` links
 *   - `> blockquote`
 *   - Bullet lists (`-`, `*`)
 *   - Inline HTML passes through unchanged (so sections with embedded
 *     `<details>`, `<div style="...">`, `<span>`, inline SVG keep working)
 *
 * NOT supported (and not needed by our sections): images, nested lists,
 * fenced code blocks with syntax highlighting, definition lists, footnotes.
 */

const TABLE_HEADER_SEP_RE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/;

function processInline(text) {
  // Order matters: code first to protect literal **/_ inside backticks.
  let out = text;
  out = out.replace(/`([^`]+)`/g, (_, code) => `<code>${escapeHtml(code)}</code>`);
  // Protect HTML entities and tags only outside code spans handled above.
  // We don't escape <, > for whole text because raw HTML must pass through;
  // markdown mixed with raw HTML is the explicit contract here.

  // Links — only allow safe URL schemes (http/https, mailto, anchor). Anything
  // else (javascript:, data:, vbscript:) is rewritten to a no-op `#` to prevent
  // XSS via malicious markdown sources. Labels go through `escapeHtmlIdempotent`
  // so legit raw `<` is escaped (defence in depth) while pre-encoded `&amp;`
  // from sections.js's escMd doesn't double-encode into `&amp;amp;`.
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    const safeUrl = isSafeUrl(url) ? url : '#';
    return `<a href="${escapeAttr(safeUrl)}">${escapeHtmlIdempotent(label)}</a>`;
  });

  // Bold then italic — bold pattern uses ** which is also a substring of *
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic with single * — must not eat into already-rendered `<strong>`
  out = out.replace(/(^|[\s(\->])\*([^*\s][^*]*?)\*(?=$|[\s.,;:)<\->])/g, '$1<em>$2</em>');
  // Italic with _ — careful not to break snake_case identifiers; require
  // space/start before, space/punct/end after.
  out = out.replace(/(^|\s)_([^_]+)_(?=$|[\s.,;:)<])/g, '$1<em>$2</em>');

  return out;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
}
/** Like escapeHtml but skips `&` already part of an entity, so callers that
 *  pass mixed pre-escaped + raw input don't end up with `&amp;amp;`. */
function escapeHtmlIdempotent(s) {
  return String(s)
    .replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;');
}
function isSafeUrl(url) {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim().toLowerCase();
  // Relative paths and anchors are always safe.
  if (trimmed.startsWith('#') || trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../')) return true;
  // Absolute URLs must use a known-safe scheme.
  return /^(?:https?:|mailto:|tel:)/.test(trimmed);
}

function splitTableRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map(c => c.trim());
}

/**
 * Convert markdown to HTML.
 *
 * @param {string} md  raw markdown text (may include inline raw HTML — preserved)
 * @returns {string} HTML
 */
export function mdToHtml(md) {
  if (!md || typeof md !== 'string') return '';

  const lines = md.split(/\r?\n/);
  const out = [];
  let i = 0;

  let listOpen = false;
  let blockquoteOpen = false;
  const closeList = () => { if (listOpen) { out.push('</ul>'); listOpen = false; } };
  const closeBlockquote = () => { if (blockquoteOpen) { out.push('</blockquote>'); blockquoteOpen = false; } };

  while (i < lines.length) {
    const line = lines[i];
    const stripped = line.trim();

    // Empty line
    if (!stripped) {
      closeList();
      closeBlockquote();
      i++;
      continue;
    }

    // Raw HTML block — pass through unchanged. Heuristic: the line starts
    // with `<` and is not part of a markdown construct.
    if (/^</.test(stripped)) {
      closeList();
      closeBlockquote();
      out.push(line);
      i++;
      continue;
    }

    // Header
    let m = stripped.match(/^(#{1,6})\s+(.*)$/);
    if (m) {
      closeList();
      closeBlockquote();
      const level = m[1].length;
      out.push(`<h${level}>${processInline(m[2])}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^-{3,}$/.test(stripped)) {
      closeList();
      closeBlockquote();
      out.push('<hr/>');
      i++;
      continue;
    }

    // Blockquote
    if (stripped.startsWith('>')) {
      closeList();
      if (!blockquoteOpen) { out.push('<blockquote>'); blockquoteOpen = true; }
      out.push(processInline(stripped.replace(/^>\s?/, '')) + '<br/>');
      i++;
      continue;
    } else if (blockquoteOpen) {
      closeBlockquote();
    }

    // Table — header row then `---` separator then body
    if (/\|/.test(stripped) && i + 1 < lines.length && TABLE_HEADER_SEP_RE.test(lines[i + 1])) {
      closeList();
      const headerCells = splitTableRow(stripped);
      i += 2; // skip header + separator
      const bodyRows = [];
      while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim()) {
        bodyRows.push(splitTableRow(lines[i]));
        i++;
      }
      const thead = `<thead><tr>${headerCells.map(c => `<th>${processInline(c)}</th>`).join('')}</tr></thead>`;
      const tbody = `<tbody>${bodyRows.map(row => `<tr>${row.map(c => `<td>${processInline(c)}</td>`).join('')}</tr>`).join('')}</tbody>`;
      out.push(`<table class="md-table">${thead}${tbody}</table>`);
      continue;
    }

    // Bullet list
    m = line.match(/^(\s*)[-*]\s+(.+)$/);
    if (m) {
      if (!listOpen) { out.push('<ul>'); listOpen = true; }
      out.push(`<li>${processInline(m[2])}</li>`);
      i++;
      continue;
    } else if (listOpen) {
      closeList();
    }

    // Plain paragraph — accumulate until blank or block boundary
    const paragraph = [stripped];
    let j = i + 1;
    while (j < lines.length) {
      const next = lines[j];
      const nstripped = next.trim();
      if (!nstripped) break;
      if (/^(#{1,6})\s+/.test(nstripped)) break;
      if (nstripped.startsWith('>')) break;
      if (nstripped.startsWith('<')) break;
      if (/^[-*]\s+/.test(nstripped)) break;
      if (/\|/.test(nstripped) && j + 1 < lines.length && TABLE_HEADER_SEP_RE.test(lines[j + 1])) break;
      paragraph.push(nstripped);
      j++;
    }
    out.push(`<p>${processInline(paragraph.join(' '))}</p>`);
    i = j;
  }

  closeList();
  closeBlockquote();

  return out.join('\n');
}
