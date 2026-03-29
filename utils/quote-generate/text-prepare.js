// utils/quote-generate/text-prepare.js
// Prepare phase: tokenize text, load emoji, measure segments.
// Called once per text block. Returns PreparedText for layout/render phases.
//
// NOTE: text.split('') and entity offsets both use UTF-16 code units,
// consistent with Telegram API and JS string indexing. Do not refactor
// to Array.from(text) (codepoint split) without updating all offset logic.

const { createCanvas, loadImage } = require('canvas')
const sharp = require('sharp')
const loadImageFromUrl = require('../image-load-url')
const emojiDb = require('../emoji-db')
const { loadBrand } = require('../emoji-image')
const {
  BREAK_REGEX, SPACE_REGEX, CJK_REGEX,
  ENTITY_TYPES_MONOSPACE, ENTITY_TYPES_MENTION,
  EMOJI_SCALE, LEFT_STICKY_PUNCTUATION, KINSOKU_START, KINSOKU_END
} = require('./constants')

// Shared segmenters (singletons, like pretext)
const wordSegmenter = new Intl.Segmenter('en', { granularity: 'word' })
const graphemeSegmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })

// Shared measurement canvas (singleton, like pretext)
let measureCanvas = null
let measureCtx = null

function getMeasureCtx () {
  if (!measureCtx) {
    measureCanvas = createCanvas(1, 1)
    measureCtx = measureCanvas.getContext('2d')
  }
  return measureCtx
}

// Module-level emoji image cache — persists across calls
const emojiImageCache = new Map()

// Resolve the font string for a set of styles
function resolveFont (styles, fontSize) {
  let fontType = ''
  let fontName = 'NotoSans'

  if (styles.includes('bold')) fontType += 'bold '
  if (styles.includes('italic')) fontType += 'italic '
  if (styles.includes('monospace')) fontName = 'NotoSansMono'

  return `${fontType}${fontSize}px ${fontName}`
}

// Parse entities into per-character style/emoji data
function buildStyledChars (text, entities) {
  const chars = text.split('')
  const styledChars = chars.map(char => ({ char, styles: [] }))

  // Apply string-type entities (e.g. 'bold' passed as string)
  if (entities && typeof entities === 'string') {
    for (const sc of styledChars) sc.styles.push(entities)
  }

  // Apply entity array
  if (Array.isArray(entities)) {
    for (const entity of entities) {
      const style = ENTITY_TYPES_MONOSPACE.includes(entity.type)
        ? 'monospace'
        : ENTITY_TYPES_MENTION.includes(entity.type)
          ? 'mention'
          : entity.type

      if (entity.type === 'custom_emoji') {
        styledChars[entity.offset].customEmojiId = entity.custom_emoji_id
      }

      for (let i = entity.offset; i < entity.offset + entity.length; i++) {
        if (styledChars[i]) styledChars[i].styles.push(style)
      }
    }
  }

  return styledChars
}

// Detect and map emoji positions onto styled chars
function mapEmojis (text, styledChars) {
  const emojis = emojiDb.searchFromText({ input: text, fixCodePoints: true })
  for (let eIdx = 0; eIdx < emojis.length; eIdx++) {
    const emoji = emojis[eIdx]
    for (let i = emoji.offset; i < emoji.offset + emoji.length; i++) {
      if (styledChars[i]) {
        styledChars[i].emoji = { index: eIdx, code: emoji.found }
      }
    }
  }
  return emojis
}

// Load emoji images (with module-level cache + in-flight dedup)
const emojiLoadingPromises = new Map()

async function loadEmojiImages (emojis, emojiBrand) {
  const emojiImageJson = loadBrand(emojiBrand || 'apple')
  let fallbackBrand = 'apple'
  if (emojiBrand === 'blob') fallbackBrand = 'google'
  const fallbackJson = loadBrand(fallbackBrand)

  const localMap = new Map()
  const promises = []

  for (const emoji of emojis) {
    const cacheKey = `${emojiBrand}:${emoji.found}`

    if (emojiImageCache.has(cacheKey)) {
      localMap.set(emoji.found, emojiImageCache.get(cacheKey))
    } else if (emojiLoadingPromises.has(cacheKey)) {
      // Deduplicate concurrent loads for the same emoji
      promises.push(emojiLoadingPromises.get(cacheKey).then(img => {
        if (img) localMap.set(emoji.found, img)
      }))
    } else if (!localMap.has(emoji.found)) {
      const p = (async () => {
        const base = emojiImageJson[emoji.found]
        let image = null

        if (base) {
          try {
            image = await loadImage(Buffer.from(base, 'base64'))
          } catch (e) {
            try { image = await loadImage(Buffer.from(fallbackJson[emoji.found], 'base64')) } catch (e2) { /* skip */ }
          }
        } else {
          try { image = await loadImage(Buffer.from(fallbackJson[emoji.found], 'base64')) } catch (e) { /* skip */ }
        }

        if (image) {
          emojiImageCache.set(cacheKey, image)
          localMap.set(emoji.found, image)
        }
        return image
      })()
      emojiLoadingPromises.set(cacheKey, p)
      promises.push(p.finally(() => emojiLoadingPromises.delete(cacheKey)))
    }
  }

  await Promise.all(promises)
  return localMap
}

// Load custom emoji stickers via Telegram API
async function loadCustomEmojis (customEmojiIds, telegram) {
  const result = {}
  if (customEmojiIds.length === 0 || !telegram) return result

  const stickers = await telegram.callApi('getCustomEmojiStickers', {
    custom_emoji_ids: customEmojiIds
  }).catch(() => null)

  if (!stickers) return result

  const promises = stickers.map(async sticker => {
    if (!sticker.thumb || !sticker.thumb.file_id) return
    const fileLink = await telegram.getFileLink(sticker.thumb.file_id).catch(() => null)
    if (!fileLink) return
    const data = await loadImageFromUrl(fileLink).catch(() => null)
    if (!data) return
    const png = await sharp(data).png({ lossless: true, force: true }).toBuffer()
    result[sticker.custom_emoji_id] = await loadImage(png).catch(() => null)
  })

  await Promise.all(promises).catch(() => {})
  return result
}

// Tokenize styled chars into raw segments using Intl.Segmenter
function tokenize (text, styledChars, fontSize, emojiMap, customEmojiMap) {
  const segments = []
  const emojiSize = fontSize * EMOJI_SCALE

  // Use Intl.Segmenter for word boundaries
  const wordSegs = [...wordSegmenter.segment(text)]

  for (const wordSeg of wordSegs) {
    const start = wordSeg.index
    const end = start + wordSeg.segment.length

    // Further split each word segment by: style boundaries, emoji boundaries, explicit breaks
    let subStart = start
    for (let i = start; i < end; i++) {
      const cur = styledChars[i]
      const prev = i > subStart ? styledChars[i - 1] : null

      // Break chars always split unconditionally (even at segment start)
      const isBreak = cur.char.match(BREAK_REGEX)

      const needsSplit = isBreak || (prev && (
        // Emoji boundary
        (cur.emoji && !prev.emoji) ||
        (!cur.emoji && prev.emoji) ||
        (cur.emoji && prev.emoji && cur.emoji.index !== prev.emoji.index) ||
        // Style change
        (cur.styles.toString() !== prev.styles.toString())
      ))

      if (needsSplit) {
        if (i > subStart) {
          pushSegment(segments, styledChars, subStart, i, fontSize, emojiSize, emojiMap, customEmojiMap)
        }
        subStart = i
      }
    }

    // Push remaining
    if (subStart < end) {
      pushSegment(segments, styledChars, subStart, end, fontSize, emojiSize, emojiMap, customEmojiMap)
    }
  }

  return segments
}

// Create a segment from a range of styled chars
function pushSegment (segments, styledChars, start, end, fontSize, emojiSize, emojiMap, customEmojiMap) {
  const first = styledChars[start]
  let text = ''
  for (let i = start; i < end; i++) text += styledChars[i].char

  // Determine segment kind
  let kind = 'text'
  if (text.match(BREAK_REGEX)) kind = 'break'
  else if (text.match(SPACE_REGEX) && !text.match(/\S/)) kind = 'space'
  else if (first.emoji) kind = 'emoji'

  // Resolve emoji image
  let emojiImage = null
  const emojiCode = first.emoji ? first.emoji.code : null
  const customEmojiId = first.customEmojiId || null

  if (first.emoji) {
    if (customEmojiId && customEmojiMap[customEmojiId]) {
      emojiImage = customEmojiMap[customEmojiId]
    } else {
      emojiImage = emojiMap.get(first.emoji.code) || null
    }
    kind = 'emoji'
  }

  segments.push({
    text,
    kind,
    styles: [...first.styles],
    font: resolveFont(first.styles, fontSize),
    emojiImage,
    emojiCode,
    customEmojiId,
    width: 0 // measured later
  })
}

// Split CJK segments into individual graphemes for per-character wrapping.
// Handles mixed CJK+non-CJK segments by splitting at CJK boundaries.
function splitCJKSegments (segments, fontSize) {
  const result = []

  for (const seg of segments) {
    if (seg.kind !== 'text' || !seg.text.match(CJK_REGEX)) {
      result.push(seg)
      continue
    }

    const graphemes = [...graphemeSegmenter.segment(seg.text)]
    if (graphemes.length <= 1) {
      result.push(seg)
      continue
    }

    // Split at CJK/non-CJK boundaries and make each CJK char a separate segment
    let runStart = 0
    let runIsCJK = !!graphemes[0].segment.match(CJK_REGEX)

    for (let g = 1; g <= graphemes.length; g++) {
      const curIsCJK = g < graphemes.length ? !!graphemes[g].segment.match(CJK_REGEX) : !runIsCJK

      if (curIsCJK !== runIsCJK || g === graphemes.length) {
        if (runIsCJK) {
          // Each CJK grapheme gets its own segment
          for (let j = runStart; j < g; j++) {
            result.push({
              text: graphemes[j].segment,
              kind: 'text',
              styles: [...seg.styles],
              font: seg.font,
              emojiImage: null,
              emojiCode: null,
              customEmojiId: null,
              width: 0
            })
          }
        } else {
          // Non-CJK run stays together
          let runText = ''
          for (let j = runStart; j < g; j++) runText += graphemes[j].segment
          result.push({
            text: runText,
            kind: 'text',
            styles: [...seg.styles],
            font: seg.font,
            emojiImage: null,
            emojiCode: null,
            customEmojiId: null,
            width: 0
          })
        }
        runStart = g
        runIsCJK = curIsCJK
      }
    }
  }

  return result
}

// Merge trailing punctuation into preceding text segment (from pretext)
function mergePunctuation (segments) {
  const result = []

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]

    // Check if this segment is left-sticky punctuation that should merge with previous
    if (
      seg.kind === 'text' &&
      seg.text.length === 1 &&
      LEFT_STICKY_PUNCTUATION.has(seg.text) &&
      result.length > 0
    ) {
      const prev = result[result.length - 1]
      if (prev.kind === 'text' && prev.styles.toString() === seg.styles.toString()) {
        prev.text += seg.text
        prev.width = 0 // re-measure later
        prev._graphemeWidths = null // invalidate cache
        continue
      }
    }

    result.push(seg)
  }

  return result
}

// Apply kinsoku rules: merge prohibited line-start chars with preceding,
// and prohibited line-end chars with following.
// Creates new segment objects instead of mutating input array.
function applyKinsoku (segments) {
  const result = []

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]

    // Merge kinsoku-start chars into preceding segment
    if (
      seg.kind === 'text' &&
      seg.text.length === 1 &&
      KINSOKU_START.has(seg.text) &&
      result.length > 0
    ) {
      const prev = result[result.length - 1]
      if (prev.kind === 'text' && prev.styles.toString() === seg.styles.toString()) {
        prev.text += seg.text
        prev.width = 0
        prev._graphemeWidths = null
        continue
      }
    }

    // Merge kinsoku-end chars with following segment — create new merged segment
    if (
      seg.kind === 'text' &&
      seg.text.length === 1 &&
      KINSOKU_END.has(seg.text) &&
      i + 1 < segments.length
    ) {
      const next = segments[i + 1]
      if (next.kind === 'text' && seg.styles.toString() === next.styles.toString()) {
        // Create a new segment with the merged text, don't mutate input
        segments[i + 1] = {
          text: seg.text + next.text,
          kind: next.kind,
          styles: [...next.styles],
          font: next.font,
          emojiImage: next.emojiImage,
          emojiCode: next.emojiCode,
          customEmojiId: next.customEmojiId,
          width: 0,
          _graphemeWidths: null
        }
        continue
      }
    }

    result.push(seg)
  }

  return result
}

// Measure all segments using canvas measureText
function measureSegments (segments, fontSize) {
  const ctx = getMeasureCtx()
  const emojiSize = fontSize * EMOJI_SCALE
  let currentFont = null

  for (const seg of segments) {
    if (seg.kind === 'emoji') {
      seg.width = emojiSize
      continue
    }
    if (seg.kind === 'break') {
      seg.width = 0
      continue
    }

    // Set correct font before measuring
    if (currentFont !== seg.font) {
      ctx.font = seg.font
      currentFont = seg.font
    }

    seg.width = ctx.measureText(seg.text).width
  }
}

// Compute per-grapheme widths for overflow-wrap (lazy, only when needed)
function computeGraphemeWidths (segment) {
  if (segment._graphemeWidths) return segment._graphemeWidths

  const ctx = getMeasureCtx()
  ctx.font = segment.font

  const graphemes = [...graphemeSegmenter.segment(segment.text)]
  const widths = graphemes.map(g => ctx.measureText(g.segment).width)
  const texts = graphemes.map(g => g.segment)

  segment._graphemeWidths = { widths, texts }
  return segment._graphemeWidths
}

/**
 * Prepare text for layout. Handles all async I/O (emoji loading, Telegram API).
 * Returns a PreparedText object that can be passed to layoutText/renderText.
 */
async function prepareText (text, entities, fontSize, emojiBrand, telegram) {
  if (!text) {
    return {
      segments: [],
      fontSize,
      lineHeight: fontSize * 1.2,
      emojiSize: fontSize * EMOJI_SCALE
    }
  }

  // Normalize Ukrainian і → Latin i (existing behavior)
  text = text.replace(/і/g, 'i')

  // 1. Build per-character style data
  const styledChars = buildStyledChars(text, entities)

  // 2. Detect and map emojis
  const emojis = mapEmojis(text, styledChars)

  // 3. Load emoji images (async I/O)
  const emojiMap = await loadEmojiImages(emojis, emojiBrand)

  // 4. Collect and load custom emoji (async I/O)
  const customEmojiIds = []
  for (const sc of styledChars) {
    if (sc.customEmojiId) customEmojiIds.push(sc.customEmojiId)
  }
  const customEmojiMap = await loadCustomEmojis(customEmojiIds, telegram)

  // 5. Tokenize via Intl.Segmenter
  let segments = tokenize(text, styledChars, fontSize, emojiMap, customEmojiMap)

  // 6. Split CJK segments into per-grapheme segments
  segments = splitCJKSegments(segments, fontSize)

  // 7. Merge trailing punctuation (from pretext)
  segments = mergePunctuation(segments)

  // 8. Apply kinsoku rules (from pretext)
  segments = applyKinsoku(segments)

  // 9. Measure all segments with correct fonts
  measureSegments(segments, fontSize)

  return {
    segments,
    fontSize,
    lineHeight: fontSize * 1.2,
    emojiSize: fontSize * EMOJI_SCALE,
    computeGraphemeWidths
  }
}

module.exports = { prepareText, graphemeSegmenter, getMeasureCtx }
