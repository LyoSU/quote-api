// utils/quote-generate/text-render.js
// Render phase: draw laid-out text to a canvas.
// Sync, no I/O. Takes a TextLayout + PreparedText and produces a canvas.

const { createCanvas } = require('canvas')
const { hexToRgb, normalizeColor } = require('./color')
const { capHeight, setOptical } = require('./canvas-utils')

// Theme of the bubble the text sits on, read from the text color itself:
// dark text → light bubble. Link / monospace colors are picked per theme so
// they keep ≥ 4.5:1 contrast (the old fixed #6ab7ec was 2.2:1 on white).
function rgbOf (color) {
  const c = normalizeColor(color)
  if (typeof c === 'string' && c[0] === '#') return hexToRgb(c)
  const m = String(c).match(/(\d+(?:\.\d+)?)/g)
  return m && m.length >= 3 ? [Number(m[0]), Number(m[1]), Number(m[2])] : [255, 255, 255]
}

const THEME = {
  light: { mention: '#1a73c4', monospace: '#3b6c93' }, // on a light bubble
  dark: { mention: '#6ab7ec', monospace: '#8fb9d9' } // on a dark bubble
}

// Spoiler text: a sticker can't be tapped to reveal it, so it stays readable —
// just visibly muted (a faint tint of the text color).
const SPOILER_ALPHA = 0.15

/**
 * Render laid-out text to a canvas. Segment x positions are already in
 * visual (bidi) order; an RTL paragraph's lines are right-aligned.
 */
function renderText (layout, prepared, fontColor) {
  const { lines, width, height } = layout
  const { segments, fontSize, emojiSize } = prepared

  if (lines.length === 0 || width === 0) {
    return createCanvas(1, 1)
  }

  // Create exact-size canvas — no oversized buffer
  const canvasWidth = Math.max(1, Math.ceil(width))
  const canvasHeight = Math.max(1, Math.ceil(height))
  const canvas = createCanvas(canvasWidth, canvasHeight)
  const ctx = canvas.getContext('2d')

  const rgb = rgbOf(fontColor)
  const lightBubble = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) < 128
  const theme = lightBubble ? THEME.light : THEME.dark
  const ruleH = Math.max(1, Math.round(fontSize * 0.07))

  let currentFont = null
  let currentFillStyle = null
  const setFill = (style) => {
    if (currentFillStyle !== style) {
      ctx.fillStyle = style
      currentFillStyle = style
    }
  }

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]
    const rtl = line.direction === 'rtl'
    // RTL: the line ends at the right edge; a truncation ellipsis sits at its
    // reading end — left of the text.
    const offsetX = rtl ? width - (line.contentWidth || 0) : 0

    for (const layoutSeg of line.segments) {
      const seg = segments[layoutSeg.index]
      if (!seg) continue

      const drawX = offsetX + layoutSeg.x
      const drawY = line.y

      // Resolve fill style for this segment
      let fillStyle = fontColor
      const spoiler = seg.styles.includes('spoiler')
      if (spoiler) fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${SPOILER_ALPHA})`
      else if (seg.styles.includes('monospace')) fillStyle = theme.monospace
      else if (seg.styles.includes('mention')) fillStyle = theme.mention

      if (seg.kind === 'emoji' && seg.emojiImage) {
        // Draw emoji image at consistent size
        if (spoiler) ctx.globalAlpha = 0.3
        ctx.drawImage(
          seg.emojiImage,
          drawX,
          drawY - fontSize + (fontSize * 0.15),
          emojiSize,
          emojiSize
        )
        if (spoiler) ctx.globalAlpha = 1
      } else if (seg.kind === 'break') {
        continue
      } else if (seg.kind !== 'space') {
        if (currentFont !== seg.font) {
          ctx.font = seg.font
          currentFont = seg.font
        }
        setFill(fillStyle)

        // Determine text to draw (handle grapheme splits from overflow-wrap)
        let drawText = seg.text
        if (layoutSeg.graphemeStart !== undefined || layoutSeg.graphemeEnd !== undefined) {
          if (prepared.computeGraphemeWidths) {
            const gData = prepared.computeGraphemeWidths(seg)
            if (gData) {
              const start = layoutSeg.graphemeStart !== undefined ? layoutSeg.graphemeStart : 0
              const end = layoutSeg.graphemeEnd !== undefined ? layoutSeg.graphemeEnd : gData.texts.length
              drawText = gData.texts.slice(start, end).join('')
            }
          }
        }
        // A direction-less piece (a lone bracket, a dash) inside a
        // right-to-left run: the RLM makes the shaper mirror it.
        if (layoutSeg.level % 2 === 1 && !STRONG.test(drawText)) drawText = '‏' + drawText

        ctx.fillText(drawText, drawX, drawY)
      }

      // Decorations run under spaces too, so a phrase reads as one rule.
      if (seg.styles.includes('strikethrough') || seg.styles.includes('underline')) {
        setFill(fillStyle)
        if (seg.styles.includes('strikethrough')) ctx.fillRect(drawX, Math.round(drawY - fontSize * 0.3), layoutSeg.width, ruleH)
        if (seg.styles.includes('underline')) ctx.fillRect(drawX, Math.round(drawY + fontSize * 0.12), layoutSeg.width, ruleH)
      }
    }

    // Handle truncation ellipsis on last line
    if (lineIdx === lines.length - 1 && line.truncated) {
      const ellipsis = '…'
      setFill(fontColor)
      const eWidth = line.ellipsisWidth || ctx.measureText(ellipsis).width
      const ellipsisX = rtl ? offsetX - eWidth : (line.contentWidth || 0)
      ctx.fillText(ellipsis, Math.max(0, ellipsisX), line.y)
    }
  }

  // The composer right-aligns a right-to-left block inside a wider bubble.
  canvas.rtl = lines[0].direction === 'rtl'
  return setOptical(canvas, ...opticalInsets(ctx, layout, prepared))
}

const STRONG = /\p{L}|\p{Nd}/u

// Scripts whose glyphs rise well above the Latin cap line (Arabic, Indic,
// Thai, CJK…): their first-line top is the measured ink, not the cap height.
const TALL_SCRIPT = /[\u0590-\u1dff\u2e80-\uffef]/

/**
 * Hidden slack [above the first line's optical top, below the last line's
 * baseline]. Top = cap height of the first line (or the measured ink for
 * tall scripts, or the emoji image when the line is emoji only); bottom =
 * the last baseline — descenders hang into the padding.
 */
function opticalInsets (ctx, layout, prepared) {
  const { lines, height } = layout
  const { segments, fontSize, emojiSize } = prepared
  const first = lines[0]
  const last = lines[lines.length - 1]
  const bold = segments.some((sg) => sg.kind === 'text' && sg.styles.includes('bold'))

  const topOf = (line) => {
    const items = line.segments.map((ls) => segments[ls.index]).filter((sg) => sg && sg.kind !== 'space' && sg.kind !== 'break')
    if (items.length > 0 && items.every((sg) => sg.kind === 'emoji')) return fontSize * 0.85
    let top = capHeight(fontSize, bold)
    for (const sg of items) {
      if (sg.kind === 'text' && TALL_SCRIPT.test(sg.text)) {
        ctx.font = sg.font
        top = Math.max(top, ctx.measureText(sg.text).actualBoundingBoxAscent || 0)
      }
    }
    return top
  }
  const emojiOnlyBottom = last.segments.length > 0 &&
    last.segments.every((ls) => segments[ls.index] && segments[ls.index].kind === 'emoji')
    ? emojiSize - fontSize * 0.85
    : 0
  return [first.y - topOf(first), Math.ceil(height) - last.y - emojiOnlyBottom]
}

module.exports = { renderText }
