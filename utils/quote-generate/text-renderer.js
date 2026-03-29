// utils/quote-generate/text-renderer.js
// Thin wrapper composing prepare → shrink-wrap → render phases.
// Same API as before — zero changes needed in callers.

const { prepareText } = require('./text-prepare')
const { shrinkWrap, getLineDirection } = require('./text-layout')
const { renderText } = require('./text-render')

/**
 * Draw multiline text with entity styling, emoji, and automatic layout.
 * Uses prepare/layout/render split for shrink-wrapped, balanced output.
 *
 * @param {string} text - Text to render
 * @param {Array|string} entities - Telegram entities or style string
 * @param {number} fontSize - Font size in pixels
 * @param {string} fontColor - CSS color
 * @param {number} textX - X offset (kept for API compat, unused in new architecture)
 * @param {number} textY - Y offset (kept for API compat, unused in new architecture)
 * @param {number} maxWidth - Maximum width
 * @param {number} maxHeight - Maximum height
 * @param {string} emojiBrand - Emoji brand
 * @param {object} telegram - Telegraf instance
 * @returns {Canvas}
 */
async function drawMultilineText (text, entities, fontSize, fontColor, textX, textY, maxWidth, maxHeight, emojiBrand, telegram) {
  const prepared = await prepareText(text, entities, fontSize, emojiBrand, telegram)

  if (prepared.segments.length === 0) {
    const { createCanvas } = require('canvas')
    return createCanvas(1, 1)
  }

  // Use shrink-wrap for multi-line text, plain layout for single-line
  const layout = shrinkWrap(prepared, maxWidth, maxHeight)

  return renderText(layout, prepared, fontColor)
}

module.exports = { drawMultilineText, getLineDirection }
