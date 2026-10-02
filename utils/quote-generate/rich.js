// utils/quote-generate/rich.js
//
// Telegram Rich Messages (Bot API 10.1+) inside the quote bubble. The bot
// normalizes `Message.rich_message` into a small closed set of blocks
// (`message.rich = { blocks, rtl }`, see quote-bot rich-types.ts); this module
// lays them out vertically and returns ONE text-like canvas that the composer
// takes in place of the plain message text.
//
// Nothing here is a new text engine: every run of text goes through the
// regular prepare → shrink-wrap → render pipeline (entities, emoji, custom
// emoji, RTL lines), and the blocks are arranged with the layout-box model,
// so all distances are between VISIBLE bounds (cap line → baseline), exactly
// like the rest of the bubble. Spacing, sizes and alphas are the `rich`
// tokens of the style preset (styles.js).
//
// A sticker is small: content is cut to the style's line budget at a block
// boundary (or inside a paragraph/list/table/code with ≥2 lines of room),
// ending with "…" like long plain text.

const { createCanvas } = require('canvas')
const { prepareText, fontMetrics } = require('./text-prepare')
const { shrinkWrap } = require('./text-layout')
const { renderText } = require('./text-render')
const { leaf, box, measure, place, render } = require('./layout-box')
const { drawRoundRect, drawQuoteIcon, drawLabel, setOptical, capHeight } = require('./canvas-utils')
const { hexToRgb, normalizeColor } = require('./color')

const ELLIPSIS = '…'
const NUMERIC_RE = /^[\d\s.,:%+\-−$€£₴₽]+$/
// Input caps — the bot already trims, these guard the HTTP API itself.
const MAX = { blocks: 64, items: 32, rows: 16, cells: 8, text: 4000 }
const KINDS = new Set(['paragraph', 'heading', 'list', 'quote', 'pre', 'math', 'divider', 'table', 'details', 'thinking', 'footer', 'label'])
const BOXED = new Set(['table', 'pre', 'math', 'quote', 'details', 'thinking'])

// ---- Input sanitizing -----------------------------------------------------

const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, MAX.text)

// Entities must index into the text (text-prepare assumes in-range offsets).
function ents (list, text) {
  if (!Array.isArray(list)) return []
  return list.filter((e) => e && typeof e.type === 'string' &&
    Number.isInteger(e.offset) && Number.isInteger(e.length) &&
    e.offset >= 0 && e.length > 0 && e.offset < text.length)
}

function richText (o) {
  const text = str(o && o.text)
  return { text, entities: ents(o && o.entities, text) }
}

function sanitize (rich) {
  if (!rich || !Array.isArray(rich.blocks)) return []
  const out = []
  for (const b of rich.blocks.slice(0, MAX.blocks)) {
    if (!b || !KINDS.has(b.type)) continue
    const n = { type: b.type, ...richText(b) }
    if (b.type === 'heading') n.level = Math.min(6, Math.max(1, Number(b.level) || 1))
    if (b.type === 'quote') {
      n.pull = !!b.pull
      if (b.credit) n.credit = richText(b.credit)
    }
    if (b.type === 'pre') n.language = str(b.language).slice(0, 24)
    if (b.type === 'list') {
      n.items = (Array.isArray(b.items) ? b.items : []).slice(0, MAX.items).map((it) => ({
        ...richText(it),
        depth: Math.max(0, Number(it && it.depth) || 0),
        marker: it && it.marker ? str(it.marker).slice(0, 8) : null,
        check: it && typeof it.check === 'boolean' ? it.check : null
      }))
      n.more = Math.max(0, Number(b.more) || 0)
      if (!n.items.length) continue
    }
    if (b.type === 'table') {
      n.rows = (Array.isArray(b.rows) ? b.rows : []).slice(0, MAX.rows)
        .filter(Array.isArray)
        .map((row) => row.slice(0, MAX.cells).map((c) => ({
          ...richText(c),
          header: !!(c && c.header),
          align: c && ['left', 'center', 'right'].includes(c.align) ? c.align : null,
          span: Math.min(MAX.cells, Math.max(1, Number(c && c.span) || 1))
        })))
        .filter((row) => row.length > 0)
      n.more = Math.max(0, Number(b.more) || 0)
      n.compact = !!b.compact
      n.striped = !!b.striped
      if (b.caption) n.caption = richText(b.caption)
      if (!n.rows.length) continue
    }
    const empty = !n.text.trim() && !['divider', 'list', 'table'].includes(n.type)
    if (!empty) out.push(n)
  }
  return out
}

// ---- Renderer -------------------------------------------------------------

/**
 * @param {object} rich  message.rich ({ blocks, rtl })
 * @param {object} o     { style, scale, textColor, accent, light, maxWidth (px),
 *                         emojiBrand, telegram }
 * @returns {Promise<Canvas|null>} text-like canvas with `optical` insets, or
 *   null when there is nothing to draw (caller falls back to message.text).
 */
async function drawRich (rich, o) {
  const blocks = sanitize(rich)
  if (!blocks.length) return null

  const P = o.style
  const R = P.rich
  const s = (v) => v * o.scale
  const rtl = !!(rich && rich.rtl)
  const textColor = o.textColor
  const accent = o.accent || textColor
  const body = s(24)
  const small = s(R.small)
  const micro = s(P.fonts.micro)
  const maxW = Math.floor(Math.min(o.maxWidth, s(R.measure)))
  const lineH = (size) => size * 1.2
  const lineGap = Math.round(lineH(body) - capHeight(body))
  const tint = (a) => rgba(textColor, a)

  // ---- text primitives ----------------------------------------------------

  // How many lines of `size` text fit into `room` px of visible height
  // (cap line of the first → baseline of the last).
  const linesFit = (room, size) => room < capHeight(size) ? 0 : Math.floor((room - capHeight(size)) / lineH(size)) + 1

  // One text run through the regular pipeline. lines = max line count
  // (Infinity = no cap). Returns { canvas, cut } — cut when the layout
  // truncated with "…".
  async function txt (text, entities, size, width, lines = Infinity, color = textColor) {
    const prepared = await prepareText(text, entities, size, o.emojiBrand, o.telegram)
    if (!prepared.segments.length) return null
    const maxH = Number.isFinite(lines) ? fontMetrics(size).ascent + (lines - 0.5) * lineH(size) : 0
    const layout = shrinkWrap(prepared, Math.max(1, width), maxH)
    return { canvas: renderText(layout, prepared, color), cut: !!layout.truncated }
  }

  // "клієнтами.…" reads as a typo: trailing punctuation yields to the ellipsis.
  const withEllipsis = (t) => {
    const text = t.text.replace(/[\s.,;:!?…]+$/, '')
    return { text: text + ELLIPSIS, entities: ents(t.entities, text) }
  }
  const bold = (t) => ({ text: t.text, entities: [{ type: 'bold', offset: 0, length: t.text.length }, ...t.entities] })
  const italic = (t) => ({ text: t.text, entities: [{ type: 'italic', offset: 0, length: t.text.length }, ...t.entities] })

  // A leaf drawn at an alpha (muted text keeps the pipeline's own color logic).
  function faded (canvas, alpha, opts) {
    const n = leaf(canvas, opts)
    if (n && alpha < 1) {
      n.paint = (ctx, nn) => {
        ctx.save()
        ctx.globalAlpha = alpha
        ctx.drawImage(nn.canvas, nn.x, nn.y - nn.trimT)
        ctx.restore()
      }
    }
    return n
  }

  // Text block (paragraph, heading, footer, label): partial fill when ≥2
  // lines of room, else it doesn't fit (null).
  async function textBlock (t, size, room, ellipsize, { alpha = 1, width = maxW } = {}) {
    const fit = linesFit(room, size)
    if (fit < 1) return null
    const r = await txt(ellipsize ? withEllipsis(t).text : t.text, t.entities, size, width, fit)
    if (!r) return { node: null, cut: false }
    if (r.cut && fit < 2) return null
    return { node: faded(r.canvas, alpha, { role: 'text' }), cut: r.cut }
  }

  // ---- shapes ---------------------------------------------------------------

  // Rounded container fill (table, code, pills): the theme text color at a
  // low alpha, so it reads on dark, light and custom backgrounds alike.
  const fillPainter = (alpha) => (ctx, n) => {
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.drawImage(drawRoundRect(textColor, n.w, n.h, s(R.radius), 0), n.x, n.y)
    ctx.restore()
  }

  // Bullet: a dot (depth 0) or a ring (deeper), optically centered on the
  // x-height of the first line. Canvas = cap line → baseline.
  function bulletCanvas (depth) {
    const cap = capHeight(body)
    const xh = xHeight(body)
    const d = Math.round(body * 0.26)
    const c = createCanvas(Math.max(1, d), Math.max(1, Math.round(cap)))
    const ctx = c.getContext('2d')
    ctx.fillStyle = accent
    ctx.strokeStyle = accent
    ctx.globalAlpha = R.list.bullet
    const cy = cap - xh / 2
    ctx.beginPath()
    if (depth === 0) {
      ctx.arc(d / 2, cy, d / 2, 0, Math.PI * 2)
      ctx.fill()
    } else {
      const lw = Math.max(1, d * 0.2)
      ctx.lineWidth = lw
      ctx.arc(d / 2, cy, d / 2 - lw / 2, 0, Math.PI * 2)
      ctx.stroke()
    }
    return setOptical(c, 0, 0)
  }

  // Task-list checkbox, cap-height square sitting on the baseline.
  function checkCanvas (checked) {
    const side = Math.round(capHeight(body) * 1.1)
    const c = createCanvas(side, side)
    const ctx = c.getContext('2d')
    const r = side * 0.24
    const lw = Math.max(1, side * 0.1)
    if (checked) {
      ctx.drawImage(drawRoundRect(accent, side, side, r, 0), 0, 0)
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = lw * 1.2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(side * 0.26, side * 0.52)
      ctx.lineTo(side * 0.44, side * 0.7)
      ctx.lineTo(side * 0.76, side * 0.32)
      ctx.stroke()
    } else {
      ctx.globalAlpha = P.microAlpha
      ctx.strokeStyle = textColor
      ctx.lineWidth = lw
      roundRectPath(ctx, lw / 2, lw / 2, side - lw, side - lw, r)
      ctx.stroke()
    }
    // the box overshoots the cap line a little; keep its bottom on the baseline
    return setOptical(c, 0, 0)
  }

  // Disclosure chevron ("›", mirrored in RTL), cap-height tall.
  function chevronCanvas (color, alpha) {
    const h = Math.round(capHeight(body))
    const w = Math.round(h * 0.6)
    const c = createCanvas(w, h)
    const ctx = c.getContext('2d')
    ctx.globalAlpha = alpha
    ctx.strokeStyle = color
    ctx.lineWidth = Math.max(1, h * 0.16)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const x0 = rtl ? w * 0.75 : w * 0.25
    const x1 = rtl ? w * 0.25 : w * 0.75
    ctx.beginPath()
    ctx.moveTo(x0, h * 0.12)
    ctx.lineTo(x1, h * 0.5)
    ctx.lineTo(x0, h * 0.88)
    ctx.stroke()
    return setOptical(c, 0, 0)
  }

  // ---- blocks ---------------------------------------------------------------

  // The existing blockquote look (composer accentBlock): tinted rounded
  // block + accent bar (glass) or a bare bar (classic), ❝ in the corner.
  function quoteBox (children) {
    const b = P.block
    const padIcon = s(b.padRIcon)
    const padSide = s(b.padL)
    return box({
      gap: s(b.gap),
      pad: { t: s(b.padY), r: rtl ? padSide : padIcon, b: s(b.padY), l: rtl ? padIcon : padSide },
      bg: (ctx, n) => {
        const barX = rtl ? n.x + n.w - s(b.bar) : n.x
        const iconX = rtl ? n.x + s(b.iconInset) : n.x + n.w - s(b.icon) - s(b.iconInset)
        if (P.replyStyle === 'line') {
          ctx.drawImage(drawRoundRect(accent, Math.ceil(s(b.bar)), n.h, s(b.bar) / 2), barX, n.y)
        } else {
          const solid = drawRoundRect(accent, n.w, n.h, s(b.radius), 0)
          ctx.save()
          ctx.globalAlpha = b.tint
          ctx.drawImage(solid, n.x, n.y)
          ctx.restore()
          ctx.drawImage(solid, barX - n.x, 0, s(b.bar), n.h, barX, n.y, s(b.bar), n.h)
        }
        ctx.drawImage(drawQuoteIcon(s(b.icon), accent, 1), iconX, n.y + s(b.iconInset))
      },
      children
    })
  }

  async function buildQuote (bl, room, ellipsize) {
    const b = P.block
    if (bl.pull) return buildPull(bl, room, ellipsize)
    const padY = 2 * s(b.padY)
    const innerW = maxW - s(b.padL) - s(b.padRIcon)
    let credit = null
    if (bl.credit && bl.credit.text) {
      const c = await txt('— ' + bl.credit.text, shift(bl.credit.entities, 2), micro, innerW, 1)
      credit = c && faded(c.canvas, P.microAlpha, { role: 'text' })
    }
    const creditH = credit ? credit.h + s(b.gap) : 0
    const r = await textBlock(bl, body, room - padY - creditH, ellipsize, { width: innerW })
    if (!r || !r.node) return r
    return { node: quoteBox([r.node, r.cut ? null : credit]), cut: r.cut }
  }

  // Pull quote: no bar or tint; italic, centered, a large accent “ hanging
  // in the top-left padding (adds no height).
  async function buildPull (bl, room, ellipsize) {
    const padX = s(P.block.padRIcon)
    const r = await textBlock(italic(bl), body, room, ellipsize, { width: maxW - 2 * padX })
    if (!r || !r.node) return r
    const mark = s(R.pull.mark)
    const node = box({
      align: 'center',
      stretch: true,
      pad: { t: 0, r: padX, b: 0, l: padX },
      gap: s(P.block.gap),
      bg: (ctx, n) => {
        ctx.save()
        ctx.globalAlpha = R.pull.alpha
        ctx.fillStyle = accent
        ctx.font = `bold ${mark}px NotoSans`
        ctx.textBaseline = 'alphabetic'
        const glyph = rtl ? '”' : '“'
        const gw = ctx.measureText(glyph).width
        // the mark's ink top sits level with the first line's cap line
        const top = ctx.measureText(glyph).actualBoundingBoxAscent || mark * 0.7
        ctx.fillText(glyph, rtl ? n.x + n.w - gw : n.x, n.y + top)
        ctx.restore()
      },
      children: [r.node]
    })
    return { node, cut: r.cut }
  }

  // Code block / math: tinted container, small monospace, ≤ maxLines lines.
  async function buildCode (bl, room, ellipsize, math) {
    const padX = s(R.pill.padX)
    const padY = s(P.block.padY)
    let label = null
    if (!math && bl.language) label = drawLabel(bl.language, micro, textColor, { alpha: P.microAlpha })
    const labelW = label ? label.width + s(P.space.inline) : 0
    const fitRoom = linesFit(room - 2 * padY, small)
    if (fitRoom < 1) return null
    const lines = Math.min(R.code.maxLines, fitRoom)
    const text = ellipsize ? withEllipsis(bl).text : bl.text
    const r = await txt(text, [{ type: 'pre', offset: 0, length: text.length }], small, maxW - 2 * padX - labelW, lines)
    if (!r) return { node: null, cut: false }
    const cut = r.cut && fitRoom < R.code.maxLines
    if (cut && fitRoom < 2) return null
    const node = box({
      stretch: true,
      align: math ? 'center' : 'start',
      pad: { t: padY, r: padX, b: padY, l: padX },
      bg: (ctx, n) => {
        fillPainter(R.code.fill)(ctx, n)
        if (label) {
          // top-right, cap line level with the first code line's cap line
          const lx = rtl ? n.x + padX : n.x + n.w - padX - label.width
          ctx.drawImage(label, lx, n.y + padY - label.optical.t)
        }
      },
      children: [leaf(r.canvas, { role: 'text' })]
    })
    return { node, cut }
  }

  // Lists: markers on a per-depth gutter (widest marker + inline gap),
  // wrapped lines hang at the gutter; depth indents by list.indent.
  async function buildList (bl, room, ellipsize) {
    const maxDepth = R.list.maxDepth - 1
    const items = bl.items.map((it) => ({ ...it, depth: Math.min(it.depth, maxDepth) }))
    // marker canvases + gutter width per depth
    const gutters = []
    const markers = items.map((it) => {
      let c
      if (it.check !== null) c = checkCanvas(it.check)
      else if (it.marker) c = drawLabel(it.marker, body, textColor)
      else c = bulletCanvas(it.depth)
      gutters[it.depth] = Math.max(gutters[it.depth] || 0, c.width)
      return c
    })
    const inline = s(P.space.inline)
    const gapItem = Math.round(lineH(body) - capHeight(body)) + s(R.gap.item)

    const renderItem = async (it, i, lines, ell) => {
      const slot = it.depth * s(R.list.indent) + gutters[it.depth]
      const t = ell ? withEllipsis(it) : it
      const r = await txt(t.text || ' ', t.entities, body, maxW - slot - inline, lines)
      if (!r) return null
      const m = markers[i]
      const numeric = !!it.marker && it.check === null
      const markLeaf = leaf(m, { w: slot })
      markLeaf.paint = (ctx, n) => {
        ctx.save()
        if (numeric) ctx.globalAlpha = P.microAlpha
        // numbers right-aligned on the gutter ("9." and "10." share the dot)
        const x = rtl ? n.x : n.x + n.w - n.canvas.width
        ctx.drawImage(n.canvas, x, n.y - n.trimT)
        ctx.restore()
      }
      const node = box({ dir: 'row', gap: inline, role: 'text', children: [markLeaf, leaf(r.canvas, { role: 'text' })] })
      measure(node)
      return { node, cut: r.cut }
    }

    const rows = []
    let used = 0
    let cut = false
    for (let i = 0; i < items.length; i++) {
      const gap = rows.length ? gapItem : 0
      const left = room - used - gap
      const fit = linesFit(left, body)
      const r = fit >= 1 ? await renderItem(items[i], i, fit, false) : null
      if (!r || (r.cut && fit < 2)) {
        cut = true
        break
      }
      r.node.mt = gap
      rows.push({ ...r, i, gap, left })
      used += gap + r.node.h
      if (r.cut) { cut = true; break }
    }
    if (!rows.length) return null
    // An item was dropped (budget) or the bot capped the list: the last
    // visible item ends with "…".
    const last = rows[rows.length - 1]
    if (!last.cut && (cut || ellipsize || bl.more > 0)) {
      const r = await renderItem(items[last.i], last.i, linesFit(last.left, body), true)
      if (r) {
        r.node.mt = last.gap
        rows[rows.length - 1] = { ...r, i: last.i }
      }
    }
    return { node: box({ dir: 'col', role: 'text', children: rows.map((r) => r.node) }), cut }
  }

  // Table: compact grid, small text, header row bold on a stronger tint,
  // horizontal hairlines only, cells ellipsized to one line.
  async function buildTable (bl, room, ellipsize) {
    const T = R.table
    const pad = bl.compact ? T.compact : T.pad
    const px = s(pad.x)
    const py = s(pad.y)
    const rule = Math.max(1, Math.round(o.scale))
    // header rows: leading rows made of header cells
    let headN = 0
    while (headN < bl.rows.length && bl.rows[headN].every((c) => c.header)) headN++
    if (headN === bl.rows.length) headN = Math.min(1, headN) // header-only table: treat as body below 1st
    let cols = Math.max(...bl.rows.map((r) => r.reduce((n, c) => n + c.span, 0)))
    const overflowCols = cols > T.maxCols
    cols = Math.min(cols, T.maxCols)
    // normalized grid rows: [{ t, header, align, col, span }]
    const grid = bl.rows.map((row, ri) => {
      const out = []
      let col = 0
      for (const c of row) {
        if (col >= cols) break
        const isLastVisible = overflowCols && col === cols - 1
        const cell = isLastVisible ? { text: ELLIPSIS, entities: [] } : c
        const span = isLastVisible ? 1 : Math.min(c.span, cols - col)
        const header = ri < headN || c.header
        const numeric = NUMERIC_RE.test(cell.text.trim()) && cell.text.trim() !== ''
        let align = c.align || (numeric ? 'right' : 'left')
        if (isLastVisible) align = 'left'
        out.push({ t: header ? bold(cell) : cell, header, align, col, span, explicit: !!c.align })
        col += span
        if (isLastVisible) break
      }
      return out
    })
    // a header sits over its column: numeric columns right-align it too
    for (let col = 0; col < cols; col++) {
      const bodyCells = grid.slice(headN).map((r) => r.find((c) => c.col === col && c.span === 1)).filter((c) => c && c.t.text.trim())
      if (!bodyCells.length || !bodyCells.every((c) => c.align === 'right')) continue
      for (const row of grid.slice(0, headN)) for (const c of row) if (c.col === col && c.span === 1 && !c.explicit) c.align = 'right'
    }
    // natural widths (one line, no cap)
    for (const row of grid) {
      for (const c of row) {
        c.r = c.t.text.trim() ? await txt(c.t.text, c.t.entities, small, 10000, 1) : null
        c.nat = c.r ? c.r.canvas.width : 0
      }
    }
    const colW = Array(cols).fill(0)
    for (const row of grid) for (const c of row) if (c.span === 1) colW[c.col] = Math.max(colW[c.col], c.nat + 2 * px)
    for (let i = 0; i < cols; i++) colW[i] = Math.max(colW[i], s(T.minCol) / 2)
    // overflow: cap the widest columns first (water-fill), floor minCol
    const avail = maxW
    if (colW.reduce((a, b) => a + b, 0) > avail) {
      const minCol = s(T.minCol)
      let lo = minCol
      let hi = Math.max(...colW)
      for (let k = 0; k < 30; k++) {
        const mid = (lo + hi) / 2
        const sum = colW.reduce((a, w) => a + Math.min(w, Math.max(mid, Math.min(w, minCol))), 0)
        if (sum > avail) hi = mid
        else lo = mid
      }
      for (let i = 0; i < cols; i++) colW[i] = Math.floor(Math.min(colW[i], Math.max(lo, Math.min(colW[i], minCol))))
    }
    // re-render cells that overflow their column (span-aware) → "…"
    for (const row of grid) {
      for (const c of row) {
        const w = colW.slice(c.col, c.col + c.span).reduce((a, b) => a + b, 0) - 2 * px
        c.w = w
        if (c.r && c.nat > w) c.r = await txt(c.t.text, c.t.entities, small, w, 1)
      }
    }
    // rows: visible band (cap → baseline) + padding
    const band = Math.round(capHeight(small, true))
    const rowH = band + 2 * py
    const microBand = Math.round(capHeight(micro))
    const moreH = microBand + 2 * py
    const head = grid.slice(0, headN)
    let bodyRows = grid.slice(headN)
    const hiddenBefore = bl.more || 0
    // what fits: header + ≥1 body row (+ the "+N" row when cutting)
    const fitRows = (n, more) => head.length * rowH + n * rowH + (more ? moreH : 0)
    let shown = Math.min(bodyRows.length, T.maxRows)
    let cut = false
    while (shown > 0 && fitRows(shown, shown < bodyRows.length || hiddenBefore) > room) {
      shown--
      cut = true
    }
    if (shown < 1 && bodyRows.length > 0) return null
    if (bodyRows.length === 0 && fitRows(0, false) > room) return null
    const hidden = bodyRows.length - shown + hiddenBefore
    bodyRows = bodyRows.slice(0, shown)
    const moreText = hidden > 0 ? `+${hidden}` : (ellipsize ? ELLIPSIS : null)
    const moreCanvas = moreText ? drawLabel(moreText, micro, textColor, { alpha: P.microAlpha }) : null

    const W = colW.reduce((a, b) => a + b, 0)
    const rows = [...head, ...bodyRows]
    const H = rows.length * rowH + (moreCanvas ? moreH : 0)
    const canvas = createCanvas(Math.max(1, Math.ceil(W)), Math.max(1, Math.ceil(H)))
    const ctx = canvas.getContext('2d')
    const radius = s(R.radius)
    ctx.save()
    roundRectPath(ctx, 0, 0, W, H, radius)
    ctx.clip()
    ctx.fillStyle = tint(T.fill)
    ctx.fillRect(0, 0, W, H)
    if (head.length) {
      ctx.fillStyle = tint(T.head)
      ctx.fillRect(0, 0, W, head.length * rowH)
    }
    if (bl.striped) {
      ctx.fillStyle = tint(T.fill * 0.6)
      bodyRows.forEach((_, i) => { if (i % 2 === 1) ctx.fillRect(0, (head.length + i) * rowH, W, rowH) })
    }
    ctx.fillStyle = tint(T.rule)
    for (let i = 1; i < rows.length + (moreCanvas ? 1 : 0); i++) {
      if (i === head.length && head.length) continue // the header tint already separates it
      ctx.fillRect(0, Math.round(i * rowH - rule / 2), W, rule)
    }
    const colX = (col) => {
      const x = colW.slice(0, col).reduce((a, b) => a + b, 0)
      return x
    }
    rows.forEach((row, ri) => {
      const top = ri * rowH
      for (const c of row) {
        if (!c.r) continue
        const cv = c.r.canvas
        const x0 = colX(c.col) + px
        let x = x0
        let align = c.align
        if (rtl) align = align === 'left' ? 'right' : align === 'right' ? 'left' : align
        if (align === 'right') x = x0 + c.w - cv.width
        else if (align === 'center') x = x0 + (c.w - cv.width) / 2
        const cx = rtl ? W - x - cv.width : x
        ctx.save()
        ctx.beginPath()
        ctx.rect(rtl ? W - x0 - c.w : x0, top, c.w, rowH)
        ctx.clip()
        ctx.drawImage(cv, Math.round(cx), Math.round(top + py - (cv.optical ? cv.optical.t : 0)))
        ctx.restore()
      }
    })
    if (moreCanvas) {
      const top = rows.length * rowH
      const mx = rtl ? W - px - moreCanvas.width : px
      ctx.drawImage(moreCanvas, mx, Math.round(top + py - moreCanvas.optical.t))
    }
    ctx.restore()
    const tableLeaf = leaf(setOptical(canvas, 0, 0))
    let node = tableLeaf
    if (bl.caption && bl.caption.text && !cut) {
      const c = await txt(bl.caption.text, bl.caption.entities, micro, W, 1)
      if (c) {
        const capLeaf = faded(c.canvas, P.microAlpha, { role: 'text' })
        node = box({ dir: 'col', gap: s(R.gap.after), children: [tableLeaf, capLeaf] })
        measure(node)
        if (node.h > room) node = tableLeaf
      }
    }
    return { node, cut }
  }

  // Collapsed details / thinking: a one-row pill across the content width.
  async function buildPill (bl, room, thinking) {
    const padX = s(R.pill.padX)
    const padY = s(R.pill.padY)
    const inline = s(P.space.inline)
    const chevron = thinking ? chevronCanvas(textColor, P.microAlpha) : chevronCanvas(accent, 1)
    const size = thinking ? small : body
    const t = thinking ? { text: '💭 ' + bl.text, entities: shift(bl.entities, 3) } : bl
    const r = await txt(t.text, t.entities, size, maxW - 2 * padX - chevron.width - inline, 1)
    if (!r) return { node: null, cut: false }
    const label = thinking ? faded(r.canvas, P.microAlpha, { role: 'text' }) : leaf(r.canvas, { role: 'text' })
    const chev = leaf(chevron)
    // details: chevron leads; thinking: quiet label, chevron trails
    const row = thinking
      ? box({ dir: 'row', justify: 'between', align: 'center', stretch: true, gap: inline, children: [label, chev] })
      : box({ dir: 'row', align: 'center', gap: inline, children: [chev, label] })
    const node = box({
      stretch: true,
      pad: { t: padY, r: padX, b: padY, l: padX },
      bg: fillPainter(R.pill.fill),
      children: [row]
    })
    measure(node)
    if (node.h > room) return null
    return { node, cut: false }
  }

  // Divider: a hairline across the content width.
  function buildDivider (room) {
    const lw = Math.max(1, Math.round(o.scale))
    if (lw > room) return null
    const alpha = o.light ? R.hairline.light : R.hairline.dark
    const node = {
      kind: 'leaf',
      canvas: createCanvas(2, 2),
      srcY: 0,
      srcH: 2,
      trimT: 0,
      role: 'block',
      w: 1,
      h: lw,
      bleed: false,
      stretch: true,
      paint: (ctx, n) => {
        ctx.save()
        ctx.fillStyle = tint(alpha)
        ctx.fillRect(n.x, n.y, n.w, n.h)
        ctx.restore()
      }
    }
    return { node, cut: false }
  }

  async function build (bl, room, ellipsize) {
    switch (bl.type) {
      case 'paragraph': return textBlock(bl, body, room, ellipsize)
      case 'heading': {
        const size = s(bl.level === 1 ? R.heading[0] : R.heading[1])
        const r = await textBlock(bold(bl), size, room, false)
        return r && r.cut ? null : r // never a half heading
      }
      case 'footer': return textBlock(bl, micro, room, ellipsize, { alpha: P.microAlpha })
      case 'label': return textBlock(bl, small, room, ellipsize)
      case 'list': return buildList(bl, room, ellipsize)
      case 'quote': return buildQuote(bl, room, ellipsize)
      case 'pre': return buildCode(bl, room, ellipsize, false)
      case 'math': return buildCode(bl, room, ellipsize, true)
      case 'table': return buildTable(bl, room, ellipsize)
      case 'details': return buildPill(bl, room, false)
      case 'thinking': return buildPill(bl, room, true)
      case 'divider': return buildDivider(room)
    }
    return null
  }

  // Vertical rhythm: proximity — a heading sits closer to what follows it
  // than to what precedes it; boxed blocks keep a full stack gap.
  // Text ↔ text gaps are ADDED to the natural line gap (baseline → next cap
  // line ≈ 12 at 24px, the composer's stackTight): a 4px item gap measured
  // from bare visible bounds would sit tighter than a soft line break.
  // Boxes (table, code, quote, pills) and dividers carry their own padding,
  // so their gap is absolute, like the composer's stack.
  const G = R.gap
  function gapBetween (a, b) {
    if (a.type === 'divider' || b.type === 'divider') return s(G.divider)
    if (BOXED.has(a.type) || BOXED.has(b.type)) return b.type === 'heading' ? s(G.before) : s(G.block)
    if (b.type === 'heading') return lineGap + s(G.before)
    if (a.type === 'heading') return lineGap + s(G.after)
    if (b.type === 'footer') return s(G.block)
    return lineGap + s(G.para)
  }

  // ---- flow with the height budget ---------------------------------------

  const budget = (P.maxLines - 1) * lineH(body) + capHeight(body)
  const placed = []
  let used = 0
  let stopped = false
  for (const bl of blocks) {
    const prev = placed[placed.length - 1]
    const gap = prev ? gapBetween(prev.block, bl) : 0
    const room = budget - used - gap
    const r = room > 0 ? await build(bl, room, false) : null
    if (!r) { stopped = true; break }
    if (!r.node) continue
    measure(r.node)
    r.node.mt = gap
    placed.push({ block: bl, node: r.node, room, gap })
    used += gap + r.node.h
    if (r.cut) break
  }
  if (stopped) {
    // Never end on a heading or a divider; the last block gets the "…".
    while (placed.length && (placed[placed.length - 1].block.type === 'heading' || placed[placed.length - 1].block.type === 'divider')) placed.pop()
    const last = placed[placed.length - 1]
    if (last && ['paragraph', 'list', 'quote', 'pre', 'math', 'table', 'footer', 'label'].includes(last.block.type)) {
      const r = await build(last.block, last.room, true)
      if (r && r.node) {
        measure(r.node)
        r.node.mt = last.gap
        last.node = r.node
      }
    }
  }
  if (!placed.length) return null

  // Code wants room (long lines would wrap): the bubble then takes the max
  // width. A table keeps its natural width — forcing it wide left a narrow
  // table floating in an empty bubble.
  const wide = placed.some((p) => p.block.type === 'pre')
  const root = box({ dir: 'col', minW: wide ? maxW : 0, children: placed.map((p) => p.node) })
  measure(root)
  // Margin so ascenders/descenders past the optical box are not clipped;
  // trimmed again by the composer through `optical`.
  const M = Math.ceil(body)
  place(root, 0, M)
  if (rtl) mirror(root, root.x, root.w)
  const canvas = createCanvas(Math.max(1, root.w), Math.max(1, root.h + 2 * M))
  render(canvas.getContext('2d'), root)
  canvas.rich = true
  return setOptical(canvas, M, M)
}

// ---- helpers ----------------------------------------------------------------

function rgba (color, alpha) {
  const [r, g, b] = hexToRgb(normalizeColor(color))
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function shift (entities, d) {
  return (entities || []).map((e) => ({ ...e, offset: e.offset + d }))
}

const xCache = new Map()
function xHeight (size) {
  let v = xCache.get(size)
  if (v === undefined) {
    const ctx = createCanvas(1, 1).getContext('2d')
    ctx.font = `${size}px NotoSans`
    v = ctx.measureText('x').actualBoundingBoxAscent || size * 0.53
    xCache.set(size, v)
  }
  return v
}

function roundRectPath (ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// RTL: mirror every placed node horizontally inside the root box. Text
// canvases mirror their own lines (text-render), painters read `rtl`.
function mirror (n, x0, w) {
  for (const c of n.children || []) {
    c.x = Math.round(x0 + w - (c.x - x0) - c.w)
    mirror(c, x0, w)
  }
}

module.exports = { drawRich, sanitize }
