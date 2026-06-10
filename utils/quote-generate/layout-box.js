// utils/quote-generate/layout-box.js
//
// Tiny DOM/CSS-style box-model layout for the quote composer.
//
// Parents derive their size from children + padding + gap, children are
// positioned by flow (column/row) — nothing is placed with hand-tuned
// absolute offsets.
//
// Text canvases from drawMultilineText are metric-exact: their height is
// (lines-1)*lineHeight + ascent + descent — a constant of the font, never
// of the glyphs drawn. So a leaf takes every canvas at face value; the only
// special case is the 1×1 stub returned for empty text, which is dropped so
// it doesn't occupy a slot in the flow.

const { createCanvas } = require('canvas')

const ZERO_PAD = { t: 0, r: 0, b: 0, l: 0 }

function normPad (pad) {
  if (!pad) return ZERO_PAD
  if (typeof pad === 'number') return { t: pad, r: pad, b: pad, l: pad }
  return { t: pad.t || 0, r: pad.r || 0, b: pad.b || 0, l: pad.l || 0 }
}

/**
 * A canvas leaf, taken at its metric size. Empty-text stubs (1×1) are not
 * elements and resolve to null. `w`/`h` force a paint size (media scaling),
 * `paint` overrides drawing entirely.
 */
function leaf (canvas, opts = {}) {
  if (!canvas) return null
  if (canvas.width <= 1 && canvas.height <= 1) return null
  let w = opts.w !== undefined ? opts.w : canvas.width
  if (opts.maxW && w > opts.maxW) w = opts.maxW // overflow renders as a fade
  return {
    kind: 'leaf',
    canvas,
    srcY: 0,
    srcH: canvas.height,
    w,
    h: opts.h !== undefined ? opts.h : canvas.height,
    bleed: !!opts.bleed,
    paint: opts.paint || null
  }
}

/**
 * A container. dir: 'col' | 'row'; gap between children; pad inside;
 * align: 'start' | 'center' (cross axis); justify: 'start' | 'between'
 * (row main axis); bg/fg: painters called with (ctx, node) before/after
 * children; minW: minimum outer width.
 */
function box (opts = {}) {
  return {
    kind: 'box',
    dir: opts.dir || 'col',
    gap: opts.gap || 0,
    pad: normPad(opts.pad),
    align: opts.align || 'start',
    justify: opts.justify || 'start',
    stretch: !!opts.stretch,
    bg: opts.bg || null,
    fg: opts.fg || null,
    minW: opts.minW || 0,
    maxW: opts.maxW || 0,
    children: (opts.children || []).filter(Boolean)
  }
}

// Vertical flow gap before a column child: the box gap by default, or the
// child's own `mt` (margin-top) when set — text nodes carry metric slack
// above their cap line, so they ask for mt 0 and supply the air themselves.
function gapBefore (box, child, index) {
  if (index === 0) return 0
  return child.mt !== undefined ? child.mt : box.gap
}

/** Bottom-up natural sizing: parent = children + gaps + padding. */
function measure (n) {
  if (n.kind === 'leaf') return n
  let w = 0
  let h = 0
  for (const c of n.children) measure(c)
  if (n.dir === 'col') {
    // A `bleed` child ignores the horizontal padding (full-width media).
    let outerW = 0
    for (let i = 0; i < n.children.length; i++) {
      const c = n.children[i]
      const cw = c.bleed ? c.w : c.w + n.pad.l + n.pad.r
      if (cw > outerW) outerW = cw
      h += gapBefore(n, c, i) + c.h
    }
    n.w = outerW
  } else {
    for (const c of n.children) {
      if (c.h > h) h = c.h
      w += c.w
    }
    w += n.gap * Math.max(0, n.children.length - 1)
    n.w = w + n.pad.l + n.pad.r
  }
  // Whole-pixel sizes: fractional widths (scaled media) would otherwise be
  // truncated by createCanvas in bg painters, clipping the backdrop by 1px.
  n.w = Math.ceil(n.w)
  n.h = Math.ceil(h + n.pad.t + n.pad.b)
  if (n.w < n.minW) n.w = n.minW
  // A capped box keeps its children's natural sizes; overflowing leaves
  // are resolved at place/render time (justify-between squeeze → fade).
  if (n.maxW && n.w > n.maxW) n.w = n.maxW
  return n
}

/**
 * Top-down placement. Children flagged `stretch` fill the inner width.
 * Coordinates are snapped to whole pixels — drawing a text canvas at a
 * fractional position (e.g. after centering) makes the glyphs blurry.
 */
function place (n, x, y, stretchW) {
  if (stretchW !== undefined && n.stretch) n.w = stretchW
  n.x = Math.round(x)
  n.y = Math.round(y)
  x = n.x
  y = n.y
  if (n.kind === 'leaf') return
  const innerW = n.w - n.pad.l - n.pad.r
  if (n.dir === 'col') {
    let cy = y + n.pad.t
    for (let i = 0; i < n.children.length; i++) {
      const c = n.children[i]
      let cx = x + n.pad.l
      if (c.bleed) cx = x + Math.max(0, (n.w - c.w) / 2) // full-width child, centered
      else if (n.align === 'center' && c.w < innerW) cx += (innerW - c.w) / 2
      cy += gapBefore(n, c, i)
      place(c, cx, cy, innerW)
      cy += c.h
    }
  } else {
    const crossY = (c) => n.align === 'center'
      ? y + n.pad.t + (n.h - n.pad.t - n.pad.b - c.h) / 2
      : y + n.pad.t
    if (n.justify === 'between' && n.children.length === 2) {
      const [a, b] = n.children
      // Never let the leading child run into the trailing one (gap = min gap).
      const availA = innerW - b.w - n.gap
      if (a.w > availA) a.w = Math.max(0, availA)
      place(a, x + n.pad.l, crossY(a))
      place(b, x + n.w - n.pad.r - b.w, crossY(b))
      return
    }
    let cx = x + n.pad.l
    for (const c of n.children) {
      place(c, cx, crossY(c))
      cx += c.w + n.gap
    }
  }
}

/** Paint: bg → children (clipped to their box) → fg. */
function render (ctx, n) {
  if (n.bg) n.bg(ctx, n)
  if (n.kind === 'leaf') {
    if (n.paint) {
      n.paint(ctx, n)
    } else if (n.canvas.width > n.w + 1) {
      // Overflowing leaf (e.g. a long name sharing a row with a tag):
      // fade the trailing edge out instead of a hard mid-glyph cut.
      ctx.drawImage(fadeOverflow(n), n.x, n.y)
    } else {
      ctx.drawImage(n.canvas, 0, n.srcY, n.canvas.width, n.srcH, n.x, n.y, n.canvas.width, n.srcH)
    }
  } else {
    for (const c of n.children) render(ctx, c)
  }
  if (n.fg) n.fg(ctx, n)
}

/**
 * Crops a leaf's canvas to its assigned width and dissolves the trailing
 * ~one-glyph stretch to transparent, so truncation reads as a graceful
 * fade rather than a sliced character.
 */
function fadeOverflow (n) {
  const w = Math.max(1, Math.round(n.w))
  const out = createCanvas(w, n.srcH)
  const ctx = out.getContext('2d')
  ctx.drawImage(n.canvas, 0, n.srcY, w, n.srcH, 0, 0, w, n.srcH)

  // Fade width ≈ the line height (about one character), capped to the box.
  const fadeW = Math.min(w, Math.round(n.srcH * 0.9))
  const grad = ctx.createLinearGradient(w - fadeW, 0, w, 0)
  grad.addColorStop(0, 'rgba(0, 0, 0, 0)')
  grad.addColorStop(1, 'rgba(0, 0, 0, 1)')
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = grad
  ctx.fillRect(w - fadeW, 0, fadeW, n.srcH)
  return out
}

module.exports = { leaf, box, measure, place, render }
