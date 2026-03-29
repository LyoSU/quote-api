// utils/quote-generate/text-renderer.js

const { createCanvas, loadImage } = require('canvas')
const EmojiDbLib = require('emoji-db')
const sharp = require('sharp')
const loadImageFromUrl = require('../image-load-url')
const emojiImageByBrand = require('../emoji-image')
const {
  BREAK_REGEX, SPACE_REGEX, CJK_REGEX, RTL_REGEX, NEUTRAL_REGEX,
  ENTITY_TYPES_MONOSPACE, ENTITY_TYPES_MENTION
} = require('./constants')
const { hexToRgb, normalizeColor } = require('./color')

const emojiDb = new EmojiDbLib({ useDefaultDb: true })

// Module-level emoji image cache — persists across calls
const emojiImageCache = new Map()

function getLineDirection (words, startIndex) {
  for (let index = startIndex; index < words.length; index++) {
    if (words[index].word.match(RTL_REGEX)) {
      return 'rtl'
    } else if (!words[index].word.match(NEUTRAL_REGEX)) {
      return 'ltr'
    }
  }
  return 'ltr'
}

async function drawMultilineText (text, entities, fontSize, fontColor, textX, textY, maxWidth, maxHeight, emojiBrand, telegram) {
  emojiBrand = emojiBrand || 'apple'
  if (maxWidth > 10000) maxWidth = 10000
  if (maxHeight > 10000) maxHeight = 10000

  const emojiImageJson = emojiImageByBrand[emojiBrand]

  let fallbackEmojiBrand = 'apple'
  if (emojiBrand === 'blob') fallbackEmojiBrand = 'google'
  const fallbackEmojiImageJson = emojiImageByBrand[fallbackEmojiBrand]

  const canvas = createCanvas(maxWidth + fontSize, maxHeight + fontSize)
  const canvasCtx = canvas.getContext('2d')

  text = text.replace(/і/g, 'i')
  const chars = text.split('')

  const lineHeight = 4 * (fontSize * 0.3)
  const styledChar = []

  const emojis = emojiDb.searchFromText({ input: text, fixCodePoints: true })

  // Load emojis using module-level cache
  const localEmojiMap = new Map()
  const emojiLoadPromises = []

  for (let emojiIndex = 0; emojiIndex < emojis.length; emojiIndex++) {
    const emoji = emojis[emojiIndex]
    const cacheKey = `${emojiBrand}:${emoji.found}`

    if (emojiImageCache.has(cacheKey)) {
      localEmojiMap.set(emoji.found, emojiImageCache.get(cacheKey))
    } else if (!localEmojiMap.has(emoji.found)) {
      emojiLoadPromises.push(
        (async () => {
          const emojiImageBase = emojiImageJson[emoji.found]
          let image = null
          if (emojiImageBase) {
            try {
              image = await loadImage(Buffer.from(emojiImageBase, 'base64'))
            } catch (error) {
              try {
                image = await loadImage(Buffer.from(fallbackEmojiImageJson[emoji.found], 'base64'))
              } catch (fallbackError) { /* skip */ }
            }
          } else {
            try {
              image = await loadImage(Buffer.from(fallbackEmojiImageJson[emoji.found], 'base64'))
            } catch (error) { /* skip */ }
          }
          if (image) {
            emojiImageCache.set(cacheKey, image)
            localEmojiMap.set(emoji.found, image)
          }
        })()
      )
    }
  }

  await Promise.all(emojiLoadPromises)

  for (let charIndex = 0; charIndex < chars.length; charIndex++) {
    styledChar[charIndex] = {
      char: chars[charIndex],
      style: []
    }
    if (entities && typeof entities === 'string') styledChar[charIndex].style.push(entities)
  }

  if (entities && typeof entities === 'object') {
    for (let entityIndex = 0; entityIndex < entities.length; entityIndex++) {
      const entity = entities[entityIndex]
      const style = []

      if (ENTITY_TYPES_MONOSPACE.includes(entity.type)) {
        style.push('monospace')
      } else if (ENTITY_TYPES_MENTION.includes(entity.type)) {
        style.push('mention')
      } else {
        style.push(entity.type)
      }

      if (entity.type === 'custom_emoji') {
        styledChar[entity.offset].customEmojiId = entity.custom_emoji_id
      }

      for (let charIndex = entity.offset; charIndex < entity.offset + entity.length; charIndex++) {
        styledChar[charIndex].style = styledChar[charIndex].style.concat(style)
      }
    }
  }

  for (let emojiIndex = 0; emojiIndex < emojis.length; emojiIndex++) {
    const emoji = emojis[emojiIndex]
    for (let charIndex = emoji.offset; charIndex < emoji.offset + emoji.length; charIndex++) {
      styledChar[charIndex].emoji = {
        index: emojiIndex,
        code: emoji.found
      }
    }
  }

  const styledWords = []
  let stringNum = 0

  for (let index = 0; index < styledChar.length; index++) {
    const charStyle = styledChar[index]
    const lastChar = styledChar[index - 1]

    if (
      lastChar && (
        (
          (charStyle.emoji && !lastChar.emoji) ||
          (!charStyle.emoji && lastChar.emoji) ||
          (charStyle.emoji && lastChar.emoji && charStyle.emoji.index !== lastChar.emoji.index)
        ) ||
        (
          (charStyle.char.match(BREAK_REGEX)) ||
          (charStyle.char.match(SPACE_REGEX) && !lastChar.char.match(SPACE_REGEX)) ||
          (lastChar.char.match(SPACE_REGEX) && !charStyle.char.match(SPACE_REGEX)) ||
          (charStyle.style && lastChar.style && charStyle.style.toString() !== lastChar.style.toString())
        ) || (
          charStyle.char.match(CJK_REGEX) ||
          lastChar.char.match(CJK_REGEX)
        )
      )
    ) {
      stringNum++
    }

    if (!styledWords[stringNum]) {
      styledWords[stringNum] = { word: charStyle.char }
      if (charStyle.style) styledWords[stringNum].style = charStyle.style
      if (charStyle.emoji) styledWords[stringNum].emoji = charStyle.emoji
      if (charStyle.customEmojiId) styledWords[stringNum].customEmojiId = charStyle.customEmojiId
    } else {
      styledWords[stringNum].word += charStyle.char
    }
  }

  let lineX = textX
  let lineY = textY
  let textWidth = 0

  // Load custom emoji — skip API call if none needed
  const customEmojiIds = []
  for (let index = 0; index < styledWords.length; index++) {
    if (styledWords[index].customEmojiId) {
      customEmojiIds.push(styledWords[index].customEmojiId)
    }
  }

  const customEmojiStickers = {}

  if (customEmojiIds.length > 0 && telegram) {
    const getCustomEmojiStickers = await telegram.callApi('getCustomEmojiStickers', {
      custom_emoji_ids: customEmojiIds
    }).catch(() => {})

    if (getCustomEmojiStickers) {
      const loadPromises = []
      for (let index = 0; index < getCustomEmojiStickers.length; index++) {
        const sticker = getCustomEmojiStickers[index]
        loadPromises.push((async () => {
          if (!sticker.thumb || !sticker.thumb.file_id) return
          const fileLink = await telegram.getFileLink(sticker.thumb.file_id).catch(() => {})
          if (fileLink) {
            const load = await loadImageFromUrl(fileLink).catch(() => {})
            if (load) {
              const sharpPng = await sharp(load).png({ lossless: true, force: true }).toBuffer()
              customEmojiStickers[sticker.custom_emoji_id] = await loadImage(sharpPng).catch(() => {})
            }
          }
        })())
      }
      await Promise.all(loadPromises).catch(() => {})
    }
  }

  let breakWrite = false
  let lineDirection = getLineDirection(styledWords, 0)

  let currentFont = null
  let currentFillStyle = null

  for (let index = 0; index < styledWords.length; index++) {
    const styledWord = styledWords[index]

    let emojiImage
    if (styledWord.emoji) {
      if (styledWord.customEmojiId && customEmojiStickers[styledWord.customEmojiId]) {
        emojiImage = customEmojiStickers[styledWord.customEmojiId]
      } else {
        emojiImage = localEmojiMap.get(styledWord.emoji.code)
      }
    }

    let fontType = ''
    let fontName = 'NotoSans'
    let fillStyle = fontColor

    if (styledWord.style.includes('bold')) fontType += 'bold '
    if (styledWord.style.includes('italic')) fontType += 'italic '
    if (styledWord.style.includes('monospace')) {
      fontName = 'NotoSansMono'
      fillStyle = '#5887a7'
    }
    if (styledWord.style.includes('mention')) fillStyle = '#6ab7ec'
    if (styledWord.style.includes('spoiler')) {
      const rgb = hexToRgb(normalizeColor(fontColor))
      fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.15)`
    }

    const newFont = `${fontType} ${fontSize}px ${fontName}`
    if (currentFont !== newFont) {
      canvasCtx.font = newFont
      currentFont = newFont
    }
    if (currentFillStyle !== fillStyle) {
      canvasCtx.fillStyle = fillStyle
      currentFillStyle = fillStyle
    }

    let wordToMeasure = styledWord.word
    const maxWordWidth = maxWidth - fontSize * 3

    if (wordToMeasure.length > 50) {
      while (canvasCtx.measureText(wordToMeasure).width > maxWordWidth && wordToMeasure.length > 0) {
        wordToMeasure = wordToMeasure.substr(0, wordToMeasure.length - 1)
      }
      if (wordToMeasure.length < styledWord.word.length) {
        styledWord.word = wordToMeasure + '\u2026'
      }
    } else if (canvasCtx.measureText(wordToMeasure).width > maxWordWidth) {
      while (canvasCtx.measureText(wordToMeasure).width > maxWordWidth && wordToMeasure.length > 0) {
        wordToMeasure = wordToMeasure.substr(0, wordToMeasure.length - 1)
      }
      styledWord.word = wordToMeasure + '\u2026'
    }

    let lineWidth
    const wordWidth = canvasCtx.measureText(styledWord.word).width

    if (styledWord.emoji) lineWidth = lineX + fontSize
    else lineWidth = lineX + wordWidth

    if (styledWord.word.match(BREAK_REGEX) || (lineWidth > maxWidth - fontSize * 2 && wordWidth < maxWidth)) {
      if (styledWord.word.match(SPACE_REGEX) && !styledWord.word.match(BREAK_REGEX)) styledWord.word = ''
      if ((styledWord.word.match(SPACE_REGEX) || !styledWord.word.match(BREAK_REGEX)) && lineY + lineHeight > maxHeight) {
        while (lineWidth > maxWidth - fontSize * 2) {
          styledWord.word = styledWord.word.substr(0, styledWord.word.length - 1)
          lineWidth = lineX + canvasCtx.measureText(styledWord.word).width
          if (styledWord.word.length <= 0) break
        }
        styledWord.word += '\u2026'
        lineWidth = lineX + canvasCtx.measureText(styledWord.word).width
        breakWrite = true
      } else {
        if (styledWord.emoji) lineWidth = textX + fontSize + (fontSize * 0.2)
        else lineWidth = textX + canvasCtx.measureText(styledWord.word).width

        lineX = textX
        lineY += lineHeight
        if (index < styledWords.length - 1) {
          const nextLineDirection = getLineDirection(styledWords, index + 1)
          if (lineDirection !== nextLineDirection) textWidth = maxWidth - fontSize * 2
          lineDirection = nextLineDirection
        }
      }
    }

    if (styledWord.emoji) lineWidth += (fontSize * 0.2)
    if (lineWidth > textWidth) textWidth = lineWidth
    if (textWidth > maxWidth) textWidth = maxWidth

    const wordX = (lineDirection === 'rtl') ? maxWidth - lineX - wordWidth - fontSize * 2 : lineX

    if (emojiImage) {
      canvasCtx.drawImage(emojiImage, wordX, lineY - fontSize + (fontSize * 0.15), fontSize + (fontSize * 0.22), fontSize + (fontSize * 0.22))
    } else {
      canvasCtx.fillText(styledWord.word, wordX, lineY)
      if (styledWord.style.includes('strikethrough')) canvasCtx.fillRect(wordX, lineY - fontSize / 2.8, canvasCtx.measureText(styledWord.word).width, fontSize * 0.1)
      if (styledWord.style.includes('underline')) canvasCtx.fillRect(wordX, lineY + 2, canvasCtx.measureText(styledWord.word).width, fontSize * 0.1)
    }

    lineX = lineWidth
    if (breakWrite) break
  }

  const canvasResize = createCanvas(textWidth, lineY + fontSize)
  const canvasResizeCtx = canvasResize.getContext('2d')

  const dx = (lineDirection === 'rtl') ? textWidth - maxWidth + fontSize * 2 : 0
  canvasResizeCtx.drawImage(canvas, dx, 0)

  return canvasResize
}

module.exports = { drawMultilineText, getLineDirection }
