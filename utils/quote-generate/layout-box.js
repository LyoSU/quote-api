// utils/quote-generate/layout-box.js
//
// Tiny DOM/CSS-style box-model layout for the quote composer.
//
// Parents derive their size from children + padding + gap, children are
// positioned by flow (column/row) — nothing is placed with hand-tuned
// absolute offsets.
//
// The one non-CSS trick: text canvases from drawMultilineText carry
// invisible vertical slack (a reserved line below the last baseline), so a
// text leaf reports its INK height (visible pixel rows) and is painted via
// a source-crop. Children honestly report their real size once, at intake;
// everything above is a pure box model.

const { inkBounds } = require('./canvas-utils')

const ZERO_PAD = { t: 0, r: 0, b: 0, l: 0 }

function normPad (pad) {
  if (!pad) return ZERO_PAD
  if (typeof pad === 'number') return { t: pad, r: pad, b: pad, l: pad }
  return { t: pad.t || 0, r: pad.r || 0, b: pad.b || 0, l: pad.l || 0 }
}

/**
 * A canvas leaf. By default the vertical ink bounds become the reported
 * height (trim). Pass `trim: false` for canvases whose full size is real
 * (media, avatars). `w`/`h` force a paint size (media scaling), `paint`
 * overrides drawing entirely.
 */
function leaf (canvas, opts = {}) {
  if (!canvas) return null
  const trim = opts.trim !== false
  const ink = trim ? inkBounds(canvas) : null
  const srcY = ink ? ink.top : 0
  const srcH = ink ? ink.bottom - ink.top + 1 : canvas.height
  return {
    kind: 'leaf',
    canvas,
    srcY,
    srcH,
    w: opts.w !== undefined ? opts.w : canvas.width,
    h: opts.h !== undefined ? opts.h : srcH,
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
    children: (opts.children || []).filter(Boolean)
  }
}

/** Bottom-up natural sizing: parent = children + gaps + padding. */
function measure (n) {
  if (n.kind === 'leaf') return n
  let w = 0
  let h = 0
  for (const c of n.children) measure(c)
  if (n.dir === 'col') {
    for (const c of n.children) {
      if (c.w > w) w = c.w
      h += c.h
    }
    h += n.gap * Math.max(0, n.children.length - 1)
  } else {
    for (const c of n.children) {
      if (c.h > h) h = c.h
      w += c.w
    }
    w += n.gap * Math.max(0, n.children.length - 1)
  }
  n.w = w + n.pad.l + n.pad.r
  n.h = h + n.pad.t + n.pad.b
  if (n.w < n.minW) n.w = n.minW
  return n
}

/** Top-down placement. Children flagged `stretch` fill the inner width. */
function place (n, x, y, stretchW) {
  if (stretchW !== undefined && n.stretch) n.w = stretchW
  n.x = x
  n.y = y
  if (n.kind === 'leaf') return
  const innerW = n.w - n.pad.l - n.pad.r
  if (n.dir === 'col') {
    let cy = y + n.pad.t
    for (const c of n.children) {
      let cx = x + n.pad.l
      if (n.align === 'center' && c.w < innerW) cx += (innerW - c.w) / 2
      place(c, cx, cy, innerW)
      cy += c.h + n.gap
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
    } else {
      // Clip to the laid-out box so an overflowing child (e.g. a long name
      // sharing a row with a tag) is cut instead of overlapping its sibling.
      ctx.save()
      ctx.beginPath()
      ctx.rect(n.x, n.y, n.w, n.h)
      ctx.clip()
      ctx.drawImage(n.canvas, 0, n.srcY, n.canvas.width, n.srcH, n.x, n.y, n.canvas.width, n.srcH)
      ctx.restore()
    }
  } else {
    for (const c of n.children) render(ctx, c)
  }
  if (n.fg) n.fg(ctx, n)
}

module.exports = { leaf, box, measure, place, render }
