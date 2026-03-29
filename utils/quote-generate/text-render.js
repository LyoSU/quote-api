// utils/quote-generate/text-render.js
// Render phase: draw laid-out text to a canvas.
// Sync, no I/O. Takes a TextLayout + PreparedText and produces a canvas.

const { createCanvas } = require('canvas')
const { hexToRgb, normalizeColor } = require('./color')

/**
 * Render laid-out text to a canvas.
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

  let currentFont = null
  let currentFillStyle = null

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]

    for (const layoutSeg of line.segments) {
      const seg = segments[layoutSeg.index]
      if (!seg) continue

      // Resolve fill style for this segment
      let fillStyle = fontColor
      if (seg.styles.includes('monospace')) fillStyle = '#5887a7'
      else if (seg.styles.includes('mention')) fillStyle = '#6ab7ec'
      else if (seg.styles.includes('spoiler')) {
        const rgb = hexToRgb(normalizeColor(fontColor))
        fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.15)`
      }

      // Set context state (only when changed)
      if (currentFont !== seg.font) {
        ctx.font = seg.font
        currentFont = seg.font
      }
      if (currentFillStyle !== fillStyle) {
        ctx.fillStyle = fillStyle
        currentFillStyle = fillStyle
      }

      // Compute x position (RTL mirrors relative to canvas width for right-alignment)
      let drawX = layoutSeg.x
      if (line.direction === 'rtl') {
        const segWidth = seg.kind === 'emoji' ? emojiSize : layoutSeg.width
        drawX = width - layoutSeg.x - segWidth
      }

      const drawY = line.y

      if (seg.kind === 'emoji' && seg.emojiImage) {
        // Draw emoji image at consistent size
        ctx.drawImage(
          seg.emojiImage,
          drawX,
          drawY - fontSize + (fontSize * 0.15),
          emojiSize,
          emojiSize
        )
      } else if (seg.kind === 'space' || seg.kind === 'break') {
        // Don't draw whitespace
      } else {
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

        ctx.fillText(drawText, drawX, drawY)

        // Strikethrough decoration
        if (seg.styles.includes('strikethrough')) {
          const textWidth = ctx.measureText(drawText).width
          ctx.fillRect(drawX, drawY - fontSize / 2.8, textWidth, fontSize * 0.1)
        }

        // Underline decoration
        if (seg.styles.includes('underline')) {
          const textWidth = ctx.measureText(drawText).width
          ctx.fillRect(drawX, drawY + 2, textWidth, fontSize * 0.1)
        }
      }
    }

    // Handle truncation ellipsis on last line
    if (lineIdx === lines.length - 1 && line.truncated) {
      const ellipsis = '\u2026'
      if (currentFillStyle !== fontColor) {
        ctx.fillStyle = fontColor
        currentFillStyle = fontColor
      }

      const lastSeg = line.segments[line.segments.length - 1]
      if (lastSeg) {
        let ellipsisX = lastSeg.x + lastSeg.width
        // Apply RTL mirror to ellipsis position
        if (line.direction === 'rtl') {
          const eWidth = ctx.measureText(ellipsis).width
          ellipsisX = width - lastSeg.x - lastSeg.width - eWidth
        }
        ctx.fillText(ellipsis, ellipsisX, line.y)
      }
    }
  }

  return canvas
}

module.exports = { renderText }
