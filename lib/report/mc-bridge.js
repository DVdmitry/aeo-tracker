/**
 * AEO Mission Control bridge — UI block in the HTML report that lets the
 * customer copy a privacy-stripped metadata payload to clipboard with a single
 * click, then jump to webappski.com/portal/aeo-mission-control to receive a
 * personalised plan.
 *
 * Adapted from designer source `inject/bridge.{css,html,js}` with these fixes:
 *   - Inherits report CSS variables (--bg, --ink, --accent, etc.) instead of
 *     re-declaring its own palette. Fonts piggy-back on the report's Inter +
 *     JetBrains Mono load.
 *   - CLI command in expand modal uses `aeo-tracker init --queries=10
 *     --add-queries` (additive basket — preserves Q1-Q3 trends).
 *   - Stale modal references `aeo-tracker run && aeo-tracker report --html`
 *     (the --html flag is what produces this very HTML).
 *   - Removed `role="document"` from <dialog> (anti-pattern; <dialog> is
 *     already semantic dialog).
 *   - Portal link points to /en/portal/aeo-mission-control (EN-only v1; locale
 *     prefix added explicitly because portal routes live under /:lang/...).
 *   - No demo Tweaks panel — production reads real data.
 *
 * Exports: bridgeCss, bridgeMarkup(state), bridgeJs(metadataJson)
 *
 * @module mc-bridge
 */

/**
 * CSS injected into the report's existing <style> block.
 * Uses report design tokens (--bg, --accent, --ink-*, etc.) where possible —
 * falls back gracefully if a token is missing.
 */
export const bridgeCss = `
  /* ============================================================
     AEO Mission Control bridge section + dialog
     ============================================================ */
  .mc-bridge {
    margin: 16px 0 36px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--bg-raised);
    overflow: hidden;
  }

  /* Stale-data ribbon (shown only when last run > 30 days) */
  .mc-bridge-stale {
    display: none;
    align-items: center;
    gap: 12px;
    padding: 12px 22px;
    background: color-mix(in srgb, var(--neg) 8%, var(--bg-subtle));
    border-bottom: 1px solid var(--border);
    color: var(--neg);
    font-size: 13px;
    line-height: 1.5;
  }
  .mc-bridge-stale[data-show="true"] { display: flex; }
  .mc-bridge-stale strong { font-weight: 600; }
  .mc-bridge-stale-rerun {
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, monospace);
    font-size: 12px;
    background: var(--bg-raised);
    padding: 2px 7px;
    border-radius: 4px;
    border: 1px solid var(--border);
    margin-left: auto;
    color: var(--ink-2);
    white-space: nowrap;
  }

  .mc-bridge-body {
    display: grid;
    grid-template-columns: 1fr 280px;
    gap: 32px;
    padding: 24px 28px;
    align-items: start;
  }
  .mc-bridge-main { min-width: 0; }
  .mc-bridge-kicker {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 0 8px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--ink-3);
    font-weight: 600;
  }
  .mc-step-num {
    background: var(--accent);
    color: #fff;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    letter-spacing: 0.06em;
  }
  .mc-bridge-title {
    margin: 0 0 8px;
    font-size: 19px;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--ink);
  }
  .mc-bridge-lede {
    margin: 0 0 14px;
    font-size: 13.5px;
    line-height: 1.55;
    color: var(--ink-2);
    max-width: 64ch;
  }
  .mc-bridge-lede em { font-style: italic; color: var(--ink); }
  .mc-bridge-link {
    color: var(--accent-ink);
    font-weight: 600;
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--accent-ink) 35%, transparent);
    text-underline-offset: 2px;
  }
  .mc-bridge-link:hover { text-decoration-color: var(--accent-ink); }

  /* Compact variant — for the hero promote-row, height matched to sponsor card.
     Hides the chips list, payload preview aside, expanded-hint block, the
     stale ribbon, and "Why does this matter?" expander. Selectors are double-
     classed (.mc-bridge.mc-bridge-compact) to outweigh the [data-show="true"]
     reveal rules below in the cascade — same specificity loses to source order
     otherwise. The action row (button + pill) stays; the dialog and toast
     (rendered after </section>) stay (modal+toast must exist in DOM
     regardless of which variant is shown). */
  .mc-bridge.mc-bridge-compact .mc-bridge-includes,
  .mc-bridge.mc-bridge-compact .mc-bridge-side,
  .mc-bridge.mc-bridge-compact .mc-bridge-hint,
  .mc-bridge.mc-bridge-compact .mc-bridge-tip,
  .mc-bridge.mc-bridge-compact .mc-bridge-stale { display: none !important; }
  .mc-bridge.mc-bridge-compact .mc-bridge-body {
    grid-template-columns: 1fr;
    /* Zero own padding — outer .promote-card.bridge already pads 24/26, and
       doubling that creates a visibly inset content block vs the sponsor card
       next to it. */
    padding: 0;
    gap: 0;
  }
  .mc-bridge.mc-bridge-compact .mc-bridge-action {
    display: flex; flex-wrap: wrap; gap: 12px; align-items: center;
    margin-top: auto;
  }

  .mc-bridge-includes {
    list-style: none;
    padding: 0;
    margin: 0 0 18px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px 8px;
  }
  .mc-bridge-includes li {
    font-size: 12px;
    color: var(--ink-3);
    background: var(--bg-subtle);
    border: 1px solid var(--border);
    padding: 3px 9px;
    border-radius: 4px;
    font-family: var(--font-mono, ui-monospace, monospace);
  }

  .mc-bridge-action {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
  }

  .mc-btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 11px 18px;
    background: var(--accent);
    color: #fff;
    border: 1px solid var(--accent);
    border-radius: 8px;
    font-size: 13.5px;
    font-weight: 600;
    cursor: pointer;
    transition: filter 0.15s ease;
    font-family: inherit;
  }
  .mc-btn-primary:hover { filter: brightness(0.92); }
  .mc-btn-primary:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
  .mc-btn-primary:active { transform: translateY(1px); }
  .mc-btn-primary:disabled,
  .mc-btn-primary[disabled] {
    background: color-mix(in srgb, var(--ink-3) 85%, var(--ink-4));
    color: color-mix(in srgb, var(--bg-raised) 85%, transparent);
    cursor: not-allowed;
    opacity: 0.7;
  }
  .mc-btn-primary:disabled:hover,
  .mc-btn-primary[disabled]:hover { filter: none; transform: none; }

  /* Tooltip wrapper. Sits inline-block next to button so the tooltip can be
     absolutely positioned above it. Hover/focus reveals the tooltip ONLY when
     the wrapper is marked data-disabled="true" (set by bridge.js when conditions
     prevent generation). */
  .mc-btn-wrap {
    position: relative;
    display: inline-flex;
  }
  .mc-disabled-tooltip {
    position: absolute;
    bottom: calc(100% + 10px);
    left: 50%;
    transform: translateX(-50%) translateY(4px);
    min-width: 300px;
    max-width: 380px;
    padding: 12px 14px;
    background: var(--ink);
    color: var(--bg);
    border-radius: 8px;
    font-family: var(--font-sans, var(--sans, system-ui, sans-serif));
    font-size: 12.5px;
    line-height: 1.5;
    text-align: left;
    box-shadow: 0 8px 24px -6px rgba(0,0,0,0.32), 0 2px 6px -1px rgba(0,0,0,0.12);
    opacity: 0;
    pointer-events: none;
    transition: opacity 140ms ease, transform 140ms ease;
    z-index: 20;
    white-space: normal;
  }
  .mc-disabled-tooltip::after {
    content: "";
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    width: 0; height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 6px solid var(--ink);
  }
  .mc-disabled-tooltip strong {
    display: block;
    font-weight: 600;
    margin-bottom: 4px;
    color: color-mix(in srgb, var(--bg) 95%, var(--accent));
  }
  .mc-disabled-tooltip code {
    display: inline-block;
    margin-top: 6px;
    padding: 2px 6px;
    background: color-mix(in srgb, var(--bg) 14%, transparent);
    color: var(--bg);
    border-radius: 3px;
    font-family: var(--mono, ui-monospace, monospace);
    font-size: 11.5px;
    user-select: all;
  }
  .mc-disabled-tooltip ol {
    margin: 6px 0 0; padding: 0 0 0 18px;
  }
  .mc-disabled-tooltip ol li { margin-bottom: 4px; }
  /* Show tooltip only when the button is actually disabled. */
  .mc-btn-wrap[data-disabled="true"]:hover .mc-disabled-tooltip,
  .mc-btn-wrap[data-disabled="true"]:focus-within .mc-disabled-tooltip {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
    pointer-events: auto;
  }
  @media (prefers-reduced-motion: reduce) {
    .mc-disabled-tooltip { transition: none; }
  }
  /* Mobile: tooltip width capped to viewport */
  @media (max-width: 720px) {
    .mc-disabled-tooltip { min-width: auto; max-width: calc(100vw - 32px); }
  }

  .mc-qbadge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 9px;
    border-radius: 5px;
    font-size: 12px;
    font-weight: 500;
    font-family: var(--font-mono, ui-monospace, monospace);
    border: 1px solid currentColor;
  }
  .mc-qbadge[data-tone="pos"]  { color: var(--pos);  background: color-mix(in srgb, var(--pos) 8%, transparent); }
  .mc-qbadge[data-tone="warn"] { color: var(--warn, #B88019); background: color-mix(in srgb, var(--warn, #B88019) 10%, transparent); }
  .mc-qbadge[data-tone="neg"]  { color: var(--neg);  background: color-mix(in srgb, var(--neg) 8%, transparent); }
  .mc-qbadge-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }
  .mc-qbadge-num { font-weight: 600; }

  .mc-bridge-tip {
    position: relative;
    background: none;
    border: 0;
    padding: 4px 0;
    color: var(--ink-3);
    font-size: 12px;
    cursor: help;
    text-decoration: underline dotted;
    text-underline-offset: 3px;
    font-family: inherit;
  }
  .mc-bridge-tip:hover { color: var(--ink); }
  .mc-bridge-tip-popover {
    display: none;
    position: absolute;
    bottom: calc(100% + 8px);
    left: 0;
    width: 280px;
    background: var(--bg-raised);
    border: 1px solid var(--border-strong);
    border-radius: 8px;
    padding: 12px 14px;
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--ink-2);
    box-shadow: 0 6px 20px rgba(0,0,0,0.08);
    z-index: 10;
    text-align: left;
    text-decoration: none;
  }
  .mc-bridge-tip:hover .mc-bridge-tip-popover,
  .mc-bridge-tip:focus-visible .mc-bridge-tip-popover { display: block; }
  .mc-bridge-tip-popover em { color: var(--ink); font-style: italic; }

  /* Inline expand-hint (only when queries < 7) */
  .mc-bridge-hint {
    display: none;
    margin-top: 14px;
    padding: 12px 14px;
    background: color-mix(in srgb, var(--neg) 6%, var(--bg-subtle));
    border: 1px solid color-mix(in srgb, var(--neg) 25%, transparent);
    border-radius: 8px;
    font-size: 13px;
    color: var(--ink-2);
    line-height: 1.5;
  }
  .mc-bridge-hint[data-show="true"] { display: block; }
  .mc-bridge-hint strong { color: var(--neg); }
  .mc-hint-cmd {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 10px;
  }
  .mc-hint-cmd code {
    flex: 1;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 12px;
    color: var(--ink);
    background: none;
    padding: 0;
  }
  .mc-hint-cmd-copy {
    background: var(--bg-subtle);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 3px 9px;
    font-size: 11px;
    color: var(--ink-2);
    cursor: pointer;
    font-family: inherit;
  }
  .mc-hint-cmd-copy:hover { background: var(--accent-soft, #F1DFC0); color: var(--accent-ink, #7A4A12); }
  .mc-hint-cmd-copy.copied { background: var(--pos); color: #fff; border-color: var(--pos); }

  /* Right-side preview */
  .mc-bridge-side {
    background: var(--bg-subtle);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px 16px;
  }
  .mc-bridge-side h4 {
    margin: 0 0 10px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--ink-3);
    font-weight: 600;
  }
  .mc-json-peek {
    display: block;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 11px;
    line-height: 1.55;
    color: var(--ink-2);
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 10px 12px;
    overflow: auto;
    max-height: 200px;
    white-space: pre;
  }
  .mc-json-peek .mc-k { color: var(--accent-ink, #7A4A12); }
  .mc-json-peek .mc-s { color: var(--pos); }
  .mc-json-peek .mc-n { color: var(--ink); }
  .mc-bridge-side small {
    display: block;
    margin-top: 10px;
    font-size: 11.5px;
    color: var(--ink-3);
    line-height: 1.45;
  }

  /* ============================================================
     Dialog (single <dialog> with 5 states via data-state)
     ============================================================ */
  .mc-dialog {
    border: 0;
    padding: 0;
    background: transparent;
    max-width: 540px;
    width: calc(100vw - 32px);
  }
  .mc-dialog::backdrop {
    background: color-mix(in srgb, var(--ink) 50%, transparent);
    backdrop-filter: blur(2px);
  }

  .mc-dialog-card {
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 14px;
    box-shadow: 0 12px 40px -8px rgba(0,0,0,0.22), 0 4px 12px -4px rgba(0,0,0,0.10);
    overflow: hidden;
    animation: mcDialogIn 140ms ease-out;
  }
  @keyframes mcDialogIn {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .mc-dialog-card { animation: none; }
  }

  /* Hide all state-blocks by default; CSS unhides only those matching the
     current data-state on .mc-dialog-card. */
  .mc-state-block { display: none; }
  .mc-foot-group { display: none; }
  .mc-dialog-card[data-state="success"]  .mc-state-success,
  .mc-dialog-card[data-state="limited"]  .mc-state-limited,
  .mc-dialog-card[data-state="expand"]   .mc-state-expand,
  .mc-dialog-card[data-state="stale"]    .mc-state-stale,
  .mc-dialog-card[data-state="fallback"] .mc-state-fallback {
    display: block;
  }
  .mc-dialog-card[data-state="success"]  .mc-foot-group.mc-state-success,
  .mc-dialog-card[data-state="limited"]  .mc-foot-group.mc-state-limited,
  .mc-dialog-card[data-state="expand"]   .mc-foot-group.mc-state-expand,
  .mc-dialog-card[data-state="stale"]    .mc-foot-group.mc-state-stale,
  .mc-dialog-card[data-state="fallback"] .mc-foot-group.mc-state-fallback {
    display: flex;
  }

  /* Inline state-block variants used inside <h2> / <span> contexts */
  h2 .mc-state-block,
  span.mc-state-block { display: none; }
  .mc-dialog-card[data-state="success"]  h2 .mc-state-success,
  .mc-dialog-card[data-state="limited"]  h2 .mc-state-limited,
  .mc-dialog-card[data-state="expand"]   h2 .mc-state-expand,
  .mc-dialog-card[data-state="stale"]    h2 .mc-state-stale,
  .mc-dialog-card[data-state="fallback"] h2 .mc-state-fallback {
    display: inline;
  }
  .mc-dialog-card[data-state="success"]  .mc-head-icon .mc-state-success,
  .mc-dialog-card[data-state="limited"]  .mc-head-icon .mc-state-limited,
  .mc-dialog-card[data-state="expand"]   .mc-head-icon .mc-state-expand,
  .mc-dialog-card[data-state="stale"]    .mc-head-icon .mc-state-stale,
  .mc-dialog-card[data-state="fallback"] .mc-head-icon .mc-state-fallback {
    display: inline-flex;
  }

  .mc-head {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 18px 20px;
    border-bottom: 1px solid var(--border);
  }
  .mc-head-icon {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--accent-soft, #F1DFC0);
    color: var(--accent-ink, #7A4A12);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .mc-dialog-card[data-state="limited"] .mc-head-icon,
  .mc-dialog-card[data-state="stale"] .mc-head-icon {
    background: color-mix(in srgb, var(--warn, #B88019) 16%, var(--bg));
    color: var(--warn, #B88019);
  }
  .mc-dialog-card[data-state="expand"] .mc-head-icon {
    background: color-mix(in srgb, var(--neg) 14%, var(--bg));
    color: var(--neg);
  }
  .mc-head h2 {
    flex: 1;
    margin: 0;
    font-size: 16px;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--ink);
  }
  .mc-close {
    background: none;
    border: 0;
    padding: 6px;
    color: var(--ink-3);
    cursor: pointer;
    border-radius: 6px;
    line-height: 0;
  }
  .mc-close:hover { background: var(--bg-subtle); color: var(--ink); }
  .mc-close:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

  .mc-body {
    padding: 18px 20px;
    font-size: 13.5px;
    line-height: 1.6;
    color: var(--ink-2);
  }
  .mc-body p { margin: 0 0 12px; }
  .mc-body p:last-child { margin-bottom: 0; }
  .mc-body strong { color: var(--ink); font-weight: 600; }

  .mc-stats {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    margin-top: 10px;
  }
  .mc-stat {
    background: var(--bg-subtle);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 14px;
  }
  .mc-stat-label {
    display: block;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--ink-3);
    font-weight: 600;
  }
  .mc-stat-value {
    display: block;
    margin-top: 4px;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 18px;
    font-weight: 600;
    color: var(--ink);
  }
  .mc-stat-value.pos { color: var(--pos); }

  .mc-cmd {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--bg-subtle);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 12px;
    margin: 12px 0;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 12.5px;
  }
  .mc-cmd-prompt { color: var(--ink-4); }
  .mc-cmd code {
    flex: 1;
    color: var(--ink);
    background: none;
    padding: 0;
  }
  .mc-cmd-copy {
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 3px 9px;
    font-size: 11px;
    color: var(--ink-2);
    cursor: pointer;
    font-family: inherit;
  }
  .mc-cmd-copy:hover { background: var(--accent-soft, #F1DFC0); color: var(--accent-ink, #7A4A12); }
  .mc-cmd-copy.copied { background: var(--pos); color: #fff; border-color: var(--pos); }

  .mc-why {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }
  .mc-why-toggle {
    background: none;
    border: 0;
    color: var(--ink-3);
    font-size: 12.5px;
    cursor: pointer;
    padding: 0;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: inherit;
  }
  .mc-why-toggle:hover { color: var(--ink); }
  .mc-why-toggle .mc-chev { transition: transform 0.15s ease; }
  .mc-why[data-open="true"] .mc-chev { transform: rotate(90deg); }
  .mc-why-body {
    display: none;
    margin-top: 10px;
    padding: 10px 14px;
    background: var(--bg-subtle);
    border-radius: 6px;
    font-size: 12.5px;
    color: var(--ink-3);
    line-height: 1.55;
  }
  .mc-why[data-open="true"] .mc-why-body { display: block; }

  .mc-fallback-ta {
    width: 100%;
    min-height: 220px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-subtle);
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 11.5px;
    line-height: 1.5;
    color: var(--ink-2);
    resize: vertical;
    box-sizing: border-box;
  }

  .mc-footnote {
    display: block;
    padding: 0 20px 14px;
    font-size: 11.5px;
    color: var(--ink-3);
    text-align: center;
  }

  .mc-foot {
    display: flex;
    padding: 14px 20px;
    border-top: 1px solid var(--border);
    background: var(--bg-subtle);
  }
  .mc-foot-group {
    display: flex;
    width: 100%;
    align-items: center;
    gap: 10px;
    justify-content: flex-end;
  }
  .mc-foot-left { margin-right: auto; }

  .mc-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border-radius: 7px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    text-decoration: none;
    font-family: inherit;
    border: 1px solid transparent;
    transition: filter 0.15s ease, background 0.15s ease;
  }
  .mc-btn-ghost {
    background: transparent;
    color: var(--ink-2);
    border-color: var(--border);
  }
  .mc-btn-ghost:hover { background: var(--bg-raised); color: var(--ink); }
  .mc-btn-link {
    background: transparent;
    color: var(--ink-3);
    border: 0;
    padding: 8px 6px;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .mc-btn-link:hover { color: var(--ink); }
  .mc-btn-solid {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
  }
  .mc-btn-solid:hover { filter: brightness(0.92); }
  .mc-btn:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }

  @media (max-width: 720px) {
    .mc-bridge-body {
      grid-template-columns: 1fr;
      gap: 18px;
      padding: 18px 20px;
    }
    .mc-stats { grid-template-columns: 1fr; }
  }

  /* ─── Toast (success path) ─────────────────────────────────────
     Top-center pill that confirms clipboard copy. Auto-dismisses
     after 3.5s. Replaces the full modal dialog for the happy path —
     non-success states (limited / stale / fallback) still get the
     dialog because they need user action / explanation. */
  .mc-toast {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%) translateY(-12px);
    z-index: 1000;
    display: flex; align-items: center; gap: 12px;
    min-width: 280px; max-width: calc(100vw - 32px);
    padding: 12px 16px 12px 14px;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-left: 3px solid var(--good);
    border-radius: 10px;
    box-shadow: 0 12px 32px -8px rgba(0,0,0,0.18), 0 4px 10px -2px rgba(0,0,0,0.08);
    font-family: var(--sans, -apple-system, system-ui, sans-serif);
    font-size: 13.5px; color: var(--ink);
    opacity: 0; pointer-events: none;
    transition: opacity 180ms ease, transform 180ms ease;
  }
  .mc-toast[data-show="true"] {
    opacity: 1; pointer-events: auto;
    transform: translateX(-50%) translateY(0);
  }
  .mc-toast-icon {
    flex-shrink: 0;
    width: 32px; height: 32px;
    padding: 7px;
    border-radius: 50%;
    background: var(--good-soft, color-mix(in srgb, var(--good) 18%, var(--bg-raised)));
    color: var(--good);
  }
  .mc-toast-body {
    display: flex; flex-direction: column; gap: 2px; min-width: 0;
  }
  .mc-toast-body strong { font-weight: 600; color: var(--ink); }
  .mc-toast-body span { font-size: 12px; color: var(--ink-3); }
  .mc-toast-close {
    appearance: none; background: none; border: 0;
    width: 24px; height: 24px; padding: 0;
    cursor: pointer;
    color: var(--ink-3); font-size: 18px; line-height: 1;
    border-radius: 4px;
    transition: background 80ms ease, color 80ms ease;
  }
  .mc-toast-close:hover { background: var(--bg-subtle); color: var(--ink); }
  @media (prefers-reduced-motion: reduce) {
    .mc-toast { transition: none; }
  }
`;

/**
 * Bridge HTML markup — the section + the dialog as one self-contained string.
 * The dialog is positioned at the end so it can portal-render outside the
 * section's stacking context.
 *
 * @param {Object} state
 * @param {string} state.brand
 * @param {string} state.domain
 * @param {number} state.queryCount
 * @param {number} state.runDateIso  e.g. "2026-05-04"
 * @returns {string} HTML
 */
export function bridgeMarkup(state) {
  const queries = Number(state.queryCount) || 0;
  const tone = queries < 7 ? 'neg' : queries < 10 ? 'warn' : 'pos';
  const showHint = queries < 7;
  // 'compact' (hero promote-row, ~280px height) hides the chips list, the
  // payload preview aside, and the «Why does this matter?» expander.
  // 'full' (default, footer reprise / standalone) keeps everything.
  const variant = state.variant === 'compact' ? 'compact' : 'full';

  return `
  <article class="promote-card bridge mc-bridge mc-bridge-${variant}" id="mc-bridge">
    <div class="mc-bridge-stale" id="mc-bridge-stale" role="status">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>
      </svg>
      <span><strong>Heads up — your last tracker run was <span id="mc-stale-days">0</span> days ago.</strong> AI engines change their answers weekly. Re-run before generating a plan so the metadata reflects today's reality.</span>
      <span class="mc-bridge-stale-rerun">aeo-tracker run</span>
    </div>

    <div class="mc-bridge-body">
      <div class="mc-bridge-main">
        <p class="mc-bridge-kicker">
          <span class="mc-step-num">Next step</span>
          <span>Turn the report into a checklist</span>
        </p>
        <h2 class="mc-bridge-title">Get mentioned by ChatGPT, Gemini, and Claude</h2>
        <p class="mc-bridge-lede">Right now AI engines cite your competitors instead of you — this report showed which ones, where, and why. <strong>The plan turns the gap into a checklist</strong>: 5–10 concrete tasks (~30&nbsp;min each), in the order that works. Examples: <em>write a page comparing you vs Competitor&nbsp;X, ask this blog to add you to its top-10 list, fix this on your site so AI engines can read it</em>.<br/><br/><strong>How it works.</strong> Click the button → you copy stats from this run to your clipboard — visibility scores, who AI cited instead of you, top citation domains. <strong>That's it — no emails, no private content, just numbers from the report.</strong> Open the JSON and check before sending. Then paste it into <strong>Mission Control</strong>, our portal — the <strong>Webappski team</strong> reads it and emails you the checklist. You do the steps yourself; we just hand you the to-do list.<br/><br/><strong>Mission Control is currently in development &amp; testing</strong> — <a href="https://webappski.com/en/aeo-mission-control" class="mc-bridge-link">see the live demo</a> for a real plan example, and join the waitlist to get yours first.</p>

        <ul class="mc-bridge-includes" aria-label="What gets copied">
          <li>brand &amp; domain</li>
          <li>visibility per engine</li>
          <li>top competitors</li>
          <li>citation gaps</li>
          <li>topic clusters</li>
          <li>crawlability + authority</li>
        </ul>

        <div class="mc-bridge-action">
          <span class="mc-btn-wrap" id="mc-btn-wrap">
            <button class="mc-btn-primary" id="mc-btn-generate" type="button" aria-haspopup="dialog" aria-describedby="mc-btn-tooltip">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="8" y="3" width="8" height="4" rx="1"></rect>
                <path d="M8 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"></path>
                <path d="M9 13h7"></path>
                <path d="m13 10 3 3-3 3"></path>
              </svg>
              Copy planner prompt
            </button>
            <!-- Tooltip — only shown when the button is disabled (queryCount<10 or daysSinceRun>30).
                 Populated by bridge.js bootstrap based on which conditions failed. Hidden by
                 default; CSS shows it on .mc-btn-wrap[data-disabled="true"]:hover/:focus-within. -->
            <span class="mc-disabled-tooltip" id="mc-btn-tooltip" role="tooltip" aria-hidden="true"></span>
          </span>

          <span class="mc-qbadge" id="mc-qbadge" data-tone="${tone}" aria-live="polite">
            <span class="mc-qbadge-dot"></span>
            <span><span class="mc-qbadge-num" id="mc-qbadge-num">${queries}</span> queries this run</span>
          </span>

          <button class="mc-bridge-tip" type="button">
            Why does this matter?
            <span class="mc-bridge-tip-popover" role="tooltip">
              The metadata is a structured snapshot of this run — your visibility scores, competitor list, and the queries that fired — so a planner LLM can write recommendations grounded in <em>your</em> data, not generic AEO advice.
            </span>
          </button>
        </div>

        <div class="mc-bridge-hint" id="mc-bridge-hint" data-show="${showHint ? 'true' : 'false'}" role="status">
          <strong>Limited grounding.</strong> Only <span id="mc-hint-q-count">${queries}</span> queries fired this run — a planner needs at least 10 to spot real patterns. Expand your basket without losing existing trends:
          <div class="mc-hint-cmd">
            <code id="mc-hint-cmd-text">aeo-tracker init --queries=10 --add-queries</code>
            <button class="mc-hint-cmd-copy" type="button" data-copy-target="mc-hint-cmd-text">Copy</button>
          </div>
        </div>
      </div>

      <aside class="mc-bridge-side" aria-label="Preview of generated metadata">
        <h4>Preview · payload contents</h4>
        <code class="mc-json-peek"><span class="mc-k">"schemaVersion"</span>: <span class="mc-s">"1.0"</span>,
<span class="mc-k">"brand"</span>: <span class="mc-s">${jsonEsc(state.brand || '')}</span>,
<span class="mc-k">"domain"</span>: <span class="mc-s">${jsonEsc(state.domain || '')}</span>,
<span class="mc-k">"aggregates"</span>: { … },
<span class="mc-k">"perEngine"</span>: [ … ],
<span class="mc-k">"perCell"</span>: [ … ],
<span class="mc-k">"topCompetitors"</span>: [ … ],
<span class="mc-k">"crawl"</span>: { … },
<span class="mc-k">"authority"</span>: { … },
<span class="mc-k">"topics"</span>: [ … ]</code>
        <small>Pasted into AEO Mission Control (<a href="https://webappski.com/en/aeo-mission-control" target="_blank" rel="noopener">see live demo</a>), this becomes a day-by-day plan with engine-specific tasks. ~6 KB JSON, no PII.</small>
      </aside>
    </div>
  </article>

  <dialog class="mc-dialog" id="mc-dialog" aria-labelledby="mc-title">
    <div class="mc-dialog-card" data-state="success">
      <header class="mc-head">
        <div class="mc-head-icon" aria-hidden="true">
          <svg class="mc-state-block mc-state-success" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"></path></svg>
          <svg class="mc-state-block mc-state-limited" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 21h20L12 3z"></path><path d="M12 10v5"></path><path d="M12 18v.01"></path></svg>
          <svg class="mc-state-block mc-state-stale" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>
          <svg class="mc-state-block mc-state-expand" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8V3h5"></path><path d="M21 8V3h-5"></path><path d="M3 16v5h5"></path><path d="M21 16v5h-5"></path></svg>
          <svg class="mc-state-block mc-state-fallback" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="3" width="8" height="4" rx="1"></rect><path d="M8 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"></path></svg>
        </div>
        <h2 id="mc-title">
          <span class="mc-state-block mc-state-success">Metadata copied</span>
          <span class="mc-state-block mc-state-limited">Limited grounding — continue?</span>
          <span class="mc-state-block mc-state-expand">Expand your basket first</span>
          <span class="mc-state-block mc-state-stale">This run is older than 30 days</span>
          <span class="mc-state-block mc-state-fallback">Copy this metadata manually</span>
        </h2>
        <button class="mc-close" type="button" aria-label="Close" id="mc-dialog-close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12"></path><path d="M18 6 6 18"></path></svg>
        </button>
      </header>

      <div class="mc-body">
        <div class="mc-state-block mc-state-success">
          <p>~6 KB of structured run data is on your clipboard. Open AEO Mission Control and paste it into the planner.</p>
          <div class="mc-stats">
            <div class="mc-stat">
              <span class="mc-stat-label">Queries this run</span>
              <span class="mc-stat-value pos" id="mc-success-q">0</span>
            </div>
            <div class="mc-stat">
              <span class="mc-stat-label">Run age</span>
              <span class="mc-stat-value" id="mc-success-age">today</span>
            </div>
          </div>
        </div>

        <div class="mc-state-block mc-state-limited">
          <p>You ran <strong><span id="mc-limited-q">0</span> queries</strong> — enough to draft a plan, but the planner can only spot patterns the queries actually probed. Below 10 you'll see "low confidence" tags on most recommendations.</p>
          <p style="color: var(--ink-3); font-size: 12.5px;">Recommended: expand basket additively first. Takes ~30 seconds.</p>
          <div class="mc-cmd">
            <span class="mc-cmd-prompt">$</span>
            <code>aeo-tracker init --queries=10 --add-queries</code>
            <button class="mc-cmd-copy" type="button" data-copy-text="aeo-tracker init --queries=10 --add-queries">Copy</button>
          </div>
        </div>

        <div class="mc-state-block mc-state-expand">
          <p>You ran <strong><span id="mc-expand-q">0</span> queries</strong>. A planner trained on this little signal will pattern-match generic AEO advice instead of <em>your</em> reality — defeating the point of running aeo-tracker locally.</p>
          <p>Expand to at least 10 queries (additive — preserves your existing trends):</p>
          <div class="mc-cmd">
            <span class="mc-cmd-prompt">$</span>
            <code>aeo-tracker init --queries=10 --add-queries</code>
            <button class="mc-cmd-copy" type="button" data-copy-text="aeo-tracker init --queries=10 --add-queries">Copy</button>
          </div>
          <div class="mc-why" id="mc-why">
            <button class="mc-why-toggle" type="button" id="mc-why-toggle" aria-expanded="false" aria-controls="mc-why-body">
              <svg class="mc-chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"></path></svg>
              Why does query count matter?
            </button>
            <div class="mc-why-body" id="mc-why-body">
              Each query is one prompt fired at every configured AI engine. With 3 queries × 4 engines you have 12 data points. Statistical noise dominates below 40 — you'll see swings of ±20% between identical runs. 10 queries gets you to ~40 data points, the floor where competitor frequency starts ranking reliably.
            </div>
          </div>
        </div>

        <div class="mc-state-block mc-state-stale">
          <p>Your last tracker run was <strong><span id="mc-stale-days-2">0</span> days ago</strong>. AI engines update their training data and grounding sources continuously — recommendations from stale runs typically cite competitors that have shifted ranks 2-3 positions.</p>
          <div class="mc-cmd">
            <span class="mc-cmd-prompt">$</span>
            <code>aeo-tracker run &amp;&amp; aeo-tracker report --html</code>
            <button class="mc-cmd-copy" type="button" data-copy-text="aeo-tracker run && aeo-tracker report --html">Copy</button>
          </div>
        </div>

        <div class="mc-state-block mc-state-fallback">
          <p>Your browser blocked the automatic copy (this happens in Safari and strict-CSP environments). Select this text manually with <strong>⌘A → ⌘C</strong> and paste into AEO Mission Control:</p>
          <textarea class="mc-fallback-ta" id="mc-fallback-ta" readonly spellcheck="false" aria-label="Metadata JSON"></textarea>
        </div>
      </div>

      <small class="mc-footnote mc-state-block mc-state-success">Paste destination → webappski.com/en/portal/aeo-mission-control</small>

      <footer class="mc-foot">
        <div class="mc-foot-group mc-state-success">
          <button class="mc-btn mc-btn-ghost" type="button" data-mc-close>Got it</button>
          <a class="mc-btn mc-btn-solid" href="https://webappski.com/en/portal/aeo-mission-control" target="_blank" rel="noopener" data-mc-close>
            Open Mission Control
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7"></path><path d="M8 7h9v9"></path></svg>
          </a>
        </div>
        <div class="mc-foot-group mc-state-limited">
          <button class="mc-btn mc-btn-link mc-foot-left" type="button" id="mc-limited-continue">Continue with limited plan</button>
          <button class="mc-btn mc-btn-solid" type="button" data-mc-close>Got it, I'll expand</button>
        </div>
        <div class="mc-foot-group mc-state-expand">
          <button class="mc-btn mc-btn-link mc-foot-left" type="button" id="mc-expand-anyway">Generate limited plan anyway</button>
          <button class="mc-btn mc-btn-solid" type="button" data-mc-close>Got it, I'll expand</button>
        </div>
        <div class="mc-foot-group mc-state-stale">
          <button class="mc-btn mc-btn-link mc-foot-left" type="button" id="mc-stale-anyway">Use stale data anyway</button>
          <button class="mc-btn mc-btn-solid" type="button" data-mc-close>I'll re-run first</button>
        </div>
        <div class="mc-foot-group mc-state-fallback">
          <button class="mc-btn mc-btn-ghost" type="button" id="mc-fallback-selectall">Select all</button>
          <button class="mc-btn mc-btn-solid" type="button" data-mc-close>Close</button>
        </div>
      </footer>
    </div>
  </dialog>

  <!-- Top-center toast for the success path (clipboard copy confirmation).
       The full dialog still opens for non-success states (limited / expand /
       stale / fallback) which need richer UX. -->
  <div class="mc-toast" id="mc-toast" role="status" aria-live="polite" aria-atomic="true">
    <svg class="mc-toast-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M5 12l5 5L20 7"></path>
    </svg>
    <div class="mc-toast-body">
      <strong>Planner prompt copied.</strong>
      <span>~<span id="mc-toast-size">6</span> KB · paste into AEO Mission Control.</span>
    </div>
    <button class="mc-toast-close" type="button" id="mc-toast-close" aria-label="Dismiss">×</button>
  </div>
  `;
}

/**
 * Bootstrap JS — embeds the metadata payload directly so clipboard copy is
 * instant (no fetch). Vanilla JS, native <dialog>, no external deps.
 *
 * @param {Object} metadata           the full metadata object (will be JSON.stringify'd)
 * @param {Object} state
 * @param {number} state.queryCount
 * @param {number} state.daysSinceRun
 * @returns {string} JS source for inclusion in <script>
 */
export function bridgeJs(metadata, state) {
  const metadataJson = JSON.stringify(metadata, null, 2)
    // Escape closing </script> for safe embedding.
    .replace(/<\/script>/gi, '<\\/script>');

  return `
(function(){
  'use strict';
  var STATE = {
    queryCount: ${Number(state.queryCount) || 0},
    daysSinceRun: ${Number(state.daysSinceRun) || 0},
    metadataJson: ${JSON.stringify(metadataJson)}
  };

  var dlg = document.getElementById('mc-dialog');
  if (!dlg) return; // bridge not present (--no-mc-block)
  var card = dlg.querySelector('.mc-dialog-card');
  var btnGenerate = document.getElementById('mc-btn-generate');
  var btnClose = document.getElementById('mc-dialog-close');
  var bridgeStale = document.getElementById('mc-bridge-stale');
  var staleDaysSpan = document.getElementById('mc-stale-days');
  var staleDays2 = document.getElementById('mc-stale-days-2');
  var bridgeHint = document.getElementById('mc-bridge-hint');
  var fallbackTA = document.getElementById('mc-fallback-ta');

  // Init persistent UI based on state
  if (STATE.daysSinceRun > 30) {
    if (bridgeStale) bridgeStale.dataset.show = 'true';
    if (staleDaysSpan) staleDaysSpan.textContent = STATE.daysSinceRun;
    if (staleDays2) staleDays2.textContent = STATE.daysSinceRun;
  }
  if (STATE.queryCount < 7 && bridgeHint) bridgeHint.dataset.show = 'true';

  function decideState() {
    if (STATE.daysSinceRun > 30) return 'stale';
    if (STATE.queryCount < 7)    return 'expand';
    if (STATE.queryCount < 10)   return 'limited';
    return 'success';
  }

  function populateForState(s) {
    if (s === 'success') {
      var q = document.getElementById('mc-success-q');
      var age = document.getElementById('mc-success-age');
      if (q) q.textContent = STATE.queryCount;
      if (age) age.textContent = STATE.daysSinceRun === 0 ? 'today'
        : STATE.daysSinceRun === 1 ? '1 day ago'
        : STATE.daysSinceRun + ' days ago';
    } else if (s === 'limited') {
      var ql = document.getElementById('mc-limited-q');
      if (ql) ql.textContent = STATE.queryCount;
    } else if (s === 'expand') {
      var qe = document.getElementById('mc-expand-q');
      if (qe) qe.textContent = STATE.queryCount;
    } else if (s === 'fallback') {
      if (fallbackTA) {
        fallbackTA.value = STATE.metadataJson;
        requestAnimationFrame(function(){
          fallbackTA.focus();
          fallbackTA.setSelectionRange(0, fallbackTA.value.length);
          fallbackTA.scrollTop = 0;
        });
      }
    }
  }

  var lastFocus = null;
  function openDialog(s) {
    card.dataset.state = s;
    populateForState(s);
    lastFocus = document.activeElement;
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
    requestAnimationFrame(function(){
      var t = card.querySelector('[data-mc-close], .mc-btn-solid, .mc-close');
      if (t) t.focus();
    });
  }
  function closeDialog() {
    if (dlg.open) dlg.close();
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
    var copied = card.querySelectorAll('.mc-cmd-copy.copied, .mc-hint-cmd-copy.copied');
    for (var i = 0; i < copied.length; i++) { copied[i].classList.remove('copied'); copied[i].textContent = 'Copy'; }
    var why = document.getElementById('mc-why');
    if (why) why.dataset.open = 'false';
    var wt = document.getElementById('mc-why-toggle');
    if (wt) wt.setAttribute('aria-expanded', 'false');
  }

  function copyText(text) {
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      return Promise.reject(new Error('no-clipboard-api'));
    }
    return navigator.clipboard.writeText(text);
  }

  // Toast helpers — success path shows a top-center pill instead of a full
  // modal dialog. Non-success states (limited/expand/stale/fallback) still
  // open the modal because they need user input/explanation.
  var toastEl = document.getElementById('mc-toast');
  var toastSize = document.getElementById('mc-toast-size');
  var toastClose = document.getElementById('mc-toast-close');
  var toastTimer = null;
  function showToast() {
    if (!toastEl) return;
    if (toastSize && STATE.metadataJson) {
      var kb = Math.max(1, Math.round(STATE.metadataJson.length / 1024));
      toastSize.textContent = String(kb);
    }
    toastEl.dataset.show = 'true';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 3500);
  }
  function hideToast() {
    if (!toastEl) return;
    toastEl.dataset.show = 'false';
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
  }
  if (toastClose) toastClose.addEventListener('click', hideToast);

  // Pre-flight gate — disable the primary button when the run can't produce a
  // useful planner prompt (queryCount<10 or daysSinceRun>30). Tooltip on
  // hover/focus tells the user WHICH condition failed and the exact CLI
  // command to fix it. Front-loads the explanation that v0.4 only surfaced
  // AFTER click via a modal.
  // All disable-state targets — bridge primary button + every secondary
  // [data-mc-trigger] CTA (footer-reprise CTA today; future ones land here
  // for free). Each gets its own .mc-btn-wrap parent + .mc-disabled-tooltip
  // sibling so hover/focus tooltip works in any context.
  var btnWraps = Array.prototype.slice.call(document.querySelectorAll('.mc-btn-wrap'));
  var tooltipEls = Array.prototype.slice.call(document.querySelectorAll('.mc-disabled-tooltip'));
  var copyButtons = [btnGenerate].concat(
    Array.prototype.slice.call(document.querySelectorAll('[data-mc-trigger]'))
  ).filter(Boolean);
  function evaluateBlockers() {
    var reasons = [];
    if (STATE.queryCount < 10) {
      reasons.push({
        title: 'Need 10+ queries to plan',
        body: 'You have ' + STATE.queryCount + '. The planner LLM needs ≥10 queries to spot stable patterns — anything less and single-cell signals look like trends.',
        cmd: 'aeo-tracker init --queries=10 --add-queries',
      });
    }
    if (STATE.daysSinceRun > 30) {
      reasons.push({
        title: 'Last run is ' + STATE.daysSinceRun + ' days old',
        body: 'AI engines change weekly. Plans built from old data target gaps that may already be filled — re-run before generating.',
        cmd: 'aeo-tracker run',
      });
    }
    return reasons;
  }
  function buildTooltipHtml(reasons) {
    function escHtml(s) {
      return String(s).replace(/[&<>]/g, function(ch) { return ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : '&gt;'; });
    }
    function reasonBlock(r) {
      return '<strong>' + escHtml(r.title) + '</strong>'
        + escHtml(r.body)
        + '<br/><code>' + escHtml(r.cmd) + '</code>';
    }
    if (reasons.length === 1) return reasonBlock(reasons[0]);
    return '<strong>Two issues to fix before planning</strong>'
      + '<ol>' + reasons.map(function(r) {
          return '<li>' + escHtml(r.title) + ' — <code>' + escHtml(r.cmd) + '</code></li>';
        }).join('') + '</ol>';
  }
  function applyBlockerState() {
    var reasons = evaluateBlockers();
    var blocked = reasons.length > 0;
    btnWraps.forEach(function(w) { w.dataset.disabled = blocked ? 'true' : 'false'; });
    copyButtons.forEach(function(b) { try { b.disabled = blocked; } catch (_) {} });
    if (!blocked) {
      tooltipEls.forEach(function(t) { t.setAttribute('aria-hidden', 'true'); });
      return;
    }
    var html = buildTooltipHtml(reasons);
    tooltipEls.forEach(function(t) {
      t.setAttribute('aria-hidden', 'false');
      t.innerHTML = html;
    });
  }
  applyBlockerState();

  // Single click handler reused by primary button (hero promote-row) AND any
  // [data-mc-trigger] elements (e.g. footer-reprise CTA). They all funnel
  // through the same gate + copy + toast flow.
  function triggerCopy() {
    if (btnGenerate && btnGenerate.disabled) return;
    var target = decideState();
    if (target === 'success') {
      copyText(STATE.metadataJson).then(function(){ showToast(); })
                                  .catch(function(){ openDialog('fallback'); });
    } else {
      openDialog(target);
    }
  }
  if (btnGenerate) btnGenerate.addEventListener('click', triggerCopy);
  document.querySelectorAll('[data-mc-trigger]').forEach(function (el) {
    el.addEventListener('click', function(e) { e.preventDefault(); triggerCopy(); });
  });

  if (btnClose) btnClose.addEventListener('click', closeDialog);
  card.addEventListener('click', function(e){
    if (e.target.matches && e.target.matches('[data-mc-close]')) closeDialog();
  });
  dlg.addEventListener('click', function(e){
    if (e.target === dlg) closeDialog();
  });

  // "Why?" expander
  var whyToggle = document.getElementById('mc-why-toggle');
  if (whyToggle) {
    whyToggle.addEventListener('click', function(){
      var why = document.getElementById('mc-why');
      var open = why.dataset.open === 'true';
      why.dataset.open = open ? 'false' : 'true';
      whyToggle.setAttribute('aria-expanded', open ? 'false' : 'true');
    });
  }

  // Continue / anyway → success path (with fallback)
  function anywayHandler() {
    copyText(STATE.metadataJson).then(function(){
      card.dataset.state = 'success';
      populateForState('success');
    }).catch(function(){
      card.dataset.state = 'fallback';
      populateForState('fallback');
    });
  }
  ['mc-limited-continue','mc-expand-anyway','mc-stale-anyway'].forEach(function(id){
    var btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', anywayHandler);
  });

  // CLI copy buttons
  document.body.addEventListener('click', function(e){
    var btn = e.target.closest && e.target.closest('[data-copy-target], [data-copy-text]');
    if (!btn) return;
    var text = '';
    if (btn.dataset.copyTarget) {
      var el = document.getElementById(btn.dataset.copyTarget);
      text = el ? el.textContent.trim() : '';
    } else {
      text = btn.dataset.copyText;
    }
    copyText(text).catch(function(){
      // fallback for ancient browsers — hidden textarea
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly','');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch(_) {}
      document.body.removeChild(ta);
    }).finally(function(){
      var orig = btn.textContent;
      btn.textContent = 'Copied';
      btn.classList.add('copied');
      setTimeout(function(){ btn.textContent = orig; btn.classList.remove('copied'); }, 1400);
    });
  });

  // Fallback select-all
  var sa = document.getElementById('mc-fallback-selectall');
  if (sa && fallbackTA) {
    sa.addEventListener('click', function(){
      fallbackTA.focus();
      fallbackTA.select();
    });
  }
})();
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers

function jsonEsc(s) {
  return JSON.stringify(String(s));
}
