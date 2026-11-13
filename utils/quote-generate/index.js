// utils/quote-generate/index.js

const fs = require('fs')
const path = require('path')
const { registerFont, loadImage, createCanvas } = require('canvas')
const { Telegram } = require('telegraf')
const loadImageFromUrl = require('../image-load-url')
const emojiDb = require('../emoji-db')

const { drawMultilineText } = require('./text-renderer')
const { drawAvatar } = require('./avatar')
const { downloadMediaImage } = require('./media')
const { drawAlbum, MAX_ITEMS } = require('./album')
const { drawQuote, drawTag, headerReserve } = require('./composer')
const { applySpoiler } = require('./spoiler')
const { drawLabel } = require('./canvas-utils')
const { fontMetrics, loadCustomEmojiImage } = require('./text-prepare')
const { resolveAccent, peerColorIndex } = require('./accent-colors')
const { loadIcons, drawVoiceRow, drawDocumentRow, drawAudioRow, formatDuration } = require('./attachments')
const { lightOrDark, colorLuminance, ensureContrast } = require('./color')
const { NAME_COLORS_LIGHT, NAME_COLORS_DARK } = require('./constants')
const { getStyle } = require('./styles')
const { drawCard, drawTopicLine, drawStoryRing } = require('./cards')
const { drawRich } = require('./rich')

async function loadFonts () {
  const fontsDir = path.resolve(__dirname, '../../assets/fonts/')

  let files
  try {
    files = await fs.promises.readdir(fontsDir)
  } catch (err) {
    console.warn('Could not read fonts directory:', err.message)
    return
  }

  for (const file of files) {
    if (file.startsWith('.')) continue
    try {
      // "NotoSans-BoldItalic.ttf" → family NotoSans, weight bold, style italic.
      // Files without a recognized suffix register as plain family names.
      let family = file.replace(/\.[^/.]+$/, '')
      const desc = { }
      const m = family.match(/^(.*?)-(Regular|Bold|Italic|BoldItalic)$/)
      if (m) {
        family = m[1]
        if (m[2].includes('Bold')) desc.weight = 'bold'
        if (m[2].includes('Italic')) desc.style = 'italic'
      }
      registerFont(path.join(fontsDir, file), { family, ...desc })
    } catch (error) {
      console.warn(`${file} is not a font file`)
    }
  }
  console.log('Fonts loaded')
}

class QuoteGenerate {
  constructor (botToken) {
    // Self-hosted Bot API server (getFile + file downloads served cloud-style).
    // Without the env the behavior is unchanged (Telegram cloud).
    this.telegram = new Telegram(botToken, process.env.BOT_API_ROOT ? { apiRoot: process.env.BOT_API_ROOT } : undefined)
  }

  async generate (backgroundColorOne, backgroundColorTwo, message, width, height, scale, emojiBrand) {
    await loadIcons() // warm white icon sprites (no-op after first call)
    const style = getStyle(message.style) // unknown / missing → glass
    scale = scale || 2
    if (!Number.isFinite(scale) || scale < 1) scale = 1
    if (scale > 20) scale = 20
    // `width` is the width of the WHOLE quote (avatar column + bubble + shadow
    // margin), so a 512 request really fits a 512px sticker at 1:1. Everything
    // below works with the content width: what is left inside the bubble.
    const outerWidth = Math.max(1, (width || 512) * scale)
    const chrome = (style.avatar + style.avatarGap + 2 * style.space.inset.x + style.shadowPad) * scale
    width = Math.max(160 * scale, outerWidth - chrome)
    height = Math.max(1, (height || 512) * scale)
    const maxLines = Math.max(1, Math.min(style.maxLines, Number(message.maxLines) || style.maxLines))

    const backStyle = lightOrDark(backgroundColorOne)
    const nameColorArray = backStyle === 'light' ? NAME_COLORS_LIGHT : NAME_COLORS_DARK
    const bubbleColors = [backgroundColorOne, backgroundColorTwo]

    // Telegram accent color (from.accentColorId) wins over the id-derived one.
    // Either way the color is kept as is unless it truly fails on this bubble.
    const lightBubble = backStyle === 'light'
    const senderAccent = resolveAccent(message.from && message.from.accentColorId, lightBubble)
    const nameColor = ensureContrast(
      senderAccent ? senderAccent[0] : nameColorArray[peerColorIndex(message.from && message.from.id)],
      bubbleColors, style.nameContrast
    )

    // Name is noticeably smaller than the message text (like Telegram), so
    // the eye lands on the content first.
    const nameSize = style.fonts.name * scale
    const themeText = backStyle === 'light' ? '#000' : '#fff'

    // What shares the header row with the name is rendered first: the name is
    // laid out into the width that is left, so it only ever ends with "…"
    // when the bubble is already as wide as it can get.
    const viaBotCanvas = message.viaBot
      ? drawLabel(`via @${String(message.viaBot).replace(/^@/, '')}`, style.fonts.micro * scale, nameColor, { alpha: 0.8 })
      : null
    const tagCanvas = message.senderTag
      ? drawTag(String(message.senderTag), message.senderTagRole || 'member', style, (v) => v * scale, themeText)
      : null
    const nameWidth = Math.max(40 * scale, width - headerReserve(style, scale, viaBotCanvas, tagCanvas))

    let nameCanvas
    if (message.from && message.from.name !== false && (message.from.name || message.from.first_name || message.from.last_name)) {
      let name = message.from.name || `${message.from.first_name || ''} ${message.from.last_name || ''}`.trim()
      if (!name) name = 'User'

      const nameEntities = [{
        type: 'bold',
        offset: 0,
        length: name.length
      }]

      // Emoji status: a placeholder emoji carries the custom-emoji entity. It
      // is appended only once the image is in hand — when the lookup fails
      // there is simply no status (the old code left a 🤡 next to the name).
      let hasStatus = false
      if (message.from.emoji_status) {
        const statusId = String(message.from.emoji_status)
        const statusImage = await loadCustomEmojiImage(statusId, this.telegram).catch(() => null)
        if (statusImage) {
          name += ' ' + STATUS_PLACEHOLDER
          nameEntities.push({
            type: 'custom_emoji',
            offset: name.length - STATUS_PLACEHOLDER.length,
            length: STATUS_PLACEHOLDER.length,
            custom_emoji_id: statusId
          })
          hasStatus = true
        }
      }

      try {
        nameCanvas = await drawMultilineText(
          name, nameEntities, nameSize, nameColor,
          0, nameSize, nameWidth, nameSize, emojiBrand, this.telegram
        )
        // A name too long for the row would lose the status with its tail:
        // cut the name alone and put the status back after the "…".
        if (hasStatus && nameCanvas.truncated) {
          const plain = name.slice(0, -(STATUS_PLACEHOLDER.length + 1))
          const status = await drawMultilineText(
            STATUS_PLACEHOLDER, [{ type: 'custom_emoji', offset: 0, length: STATUS_PLACEHOLDER.length, custom_emoji_id: String(message.from.emoji_status) }],
            nameSize, nameColor, 0, nameSize, nameWidth, nameSize, emojiBrand, this.telegram
          )
          const gap = Math.round(nameSize * 0.25)
          const cut = await drawMultilineText(
            plain, [{ type: 'bold', offset: 0, length: plain.length }], nameSize, nameColor,
            0, nameSize, Math.max(40 * scale, nameWidth - status.width - gap), nameSize, emojiBrand, this.telegram
          )
          nameCanvas = joinRow(cut, status, gap)
        }
        // Gradient accent on the name (base → lightened). Skipped when any
        // emoji image is in the canvas — source-in would tint it into a
        // flat silhouette (emoji status or regular emoji in the name).
        const nameHasEmoji = emojiDb.searchFromText({ input: name, fixCodePoints: true }).length > 0
        // The far end moves away from the bubble color, never toward it.
        if (style.nameGradient && !hasStatus && !nameHasEmoji) {
          nameCanvas = gradientTint(nameCanvas, nameColor, colorLuminance(nameColor, lightBubble ? -0.14 : 0.25))
        }
      } catch (error) {
        console.error('Failed to render name:', error.message, error.stack)
        // Retry without entities (drop emoji status etc)
        try {
          const plainName = hasStatus ? name.slice(0, -(STATUS_PLACEHOLDER.length + 1)) : name
          nameCanvas = await drawMultilineText(
            plainName, [{ type: 'bold', offset: 0, length: plainName.length }],
            nameSize, nameColor, 0, nameSize, nameWidth, nameSize, emojiBrand, this.telegram
          )
        } catch (_) { /* name is optional — continue without it */ }
      }
    }

    const fontSize = 24 * scale
    const hasAlbum = Array.isArray(message.album) && message.album.length > 0
    let textColor = backStyle === 'light' ? '#000' : '#fff'

    // Checklist / gift / giveaway / story → an in-bubble card (cards.js). It
    // replaces the bot's plain-text fallback; only a gift's own message stays.
    const card = await drawCard(message, { scale, style, accent: nameColor, textColor, width, telegram: this.telegram, emojiBrand })
    if (card) message = { ...message, text: card.text, entities: card.entities }

    // 1–3 emoji and nothing else: Telegram shows them big, without a bubble
    // (like a sticker) — rendered as sticker-like media.
    let bigEmoji = null
    if (message.text && !card && !message.rich && !message.media && !hasAlbum && !message.voice && !message.document && !message.audio && !message.forward) {
      const raw = String(message.text).trim()
      const found = raw ? emojiDb.searchFromText({ input: raw, fixCodePoints: true }) : []
      if (found.length >= 1 && found.length <= 3 && found.map((e) => e.emoji).join('') === raw.replace(/\s+/g, '')) {
        try {
          bigEmoji = await drawMultilineText(
            raw, [], fontSize * 4, textColor,
            0, fontSize * 4, width, fontSize * 5, emojiBrand, this.telegram
          )
        } catch (error) {
          console.warn('Failed to render big emoji:', error.message)
        }
      }
    }

    let mediaCanvas = null
    let mediaType = null
    let maxMediaSize = null

    if (bigEmoji) {
      mediaCanvas = bigEmoji
      mediaType = 'sticker'
      maxMediaSize = Math.max(bigEmoji.width, bigEmoji.height)
    } else if (hasAlbum) {
      // Several photos/videos sent together: one mosaic canvas (see album.js).
      maxMediaSize = outerWidth * 2 / 3
      try {
        mediaCanvas = await drawAlbum(message.album.slice(0, MAX_ITEMS), {
          maxWidth: maxMediaSize, scale, style, telegram: this.telegram, download: downloadMediaImage, spoiler: !!message.hasMediaSpoiler
        })
        if (mediaCanvas) mediaType = 'album'
        else console.warn('Failed to download album, skipping')
      } catch (error) {
        console.warn('Error building album:', error.message)
      }
    } else if (message.media) {
      let media, type
      let crop = !!message.mediaCrop

      if (message.media.url) {
        type = 'url'
        media = message.media.url
      } else {
        type = 'id'
        media = pickPhotoSize(message.media, outerWidth * 2 / 3)
      }

      // Media caps at ⅔ of the quote width (like Telegram photos). The caption
      // wraps to the media, never the other way round.
      maxMediaSize = outerWidth * 2 / 3

      if (media && media.is_animated) {
        if (media.thumb) {
          media = media.thumb
          maxMediaSize = maxMediaSize / 2
        } else {
          media = null
        }
      }

      try {
        mediaCanvas = await downloadMediaImage(media, maxMediaSize, type, crop, this.telegram)
        if (mediaCanvas && message.hasMediaSpoiler) {
          // "Tap to reveal" media: veil it so nothing is recognizable.
          mediaCanvas = await applySpoiler(mediaCanvas, scale)
        }
        if (mediaCanvas) {
          mediaType = message.mediaType
        } else {
          console.warn('Failed to download media image, skipping')
        }
      } catch (error) {
        console.warn('Error downloading media image:', error.message)
      }
    }

    // Caption width follows the media it sits under (same fit as the composer),
    // with a floor so a narrow portrait doesn't squeeze the text into a column.
    let textWidth = width
    if (mediaCanvas && !bigEmoji && mediaType !== 'sticker' && mediaType !== 'video_note') {
      let shown = mediaCanvas.width * (maxMediaSize / mediaCanvas.height)
      if (shown >= maxMediaSize) shown = maxMediaSize
      textWidth = Math.min(width, Math.max(shown - 2 * style.space.inset.x * scale, style.minCaption * scale))
    }
    // Text inside an accent block (quote) or a code block is narrower by the
    // block's own padding, so the bubble never outgrows the quote width.
    const blk = style.block
    const quoteWidth = textWidth - (blk.padL + blk.padRIcon) * scale
    const codeSize = style.fonts.code * scale
    const codeWidth = textWidth - 2 * style.code.padX * scale

    let textCanvas
    let textBlocks = null
    // Rich Message blocks (rich.js) replace the plain text; on failure the
    // flattened fallback in message.text renders as usual.
    if (message.rich && !bigEmoji) {
      textCanvas = await drawRich(message.rich, { style, scale, textColor, accent: nameColor, light: backStyle === 'light', maxWidth: width, emojiBrand, telegram: this.telegram })
        .catch((error) => { console.error('Failed to render rich message:', error.message); return null })
    }
    if (message.text && !bigEmoji && !textCanvas) {
      const text = typeof message.text === 'string' ? message.text : String(message.text)
      try {
        // Blockquote entities split the text into plain/quote runs, each
        // rendered separately so the composer can give quotes the accent
        // block treatment.
        const parts = splitBlocks(text, message.entities)
        if (parts) {
          textBlocks = []
          let linesLeft = maxLines // the cap spans all runs of the message
          for (const part of parts) {
            if (linesLeft <= 0) break
            const size = part.code ? codeSize : fontSize
            const wrap = part.code ? codeWidth : (part.quote || message.isQuote) ? quoteWidth : textWidth
            const canvas = await drawMultilineText(
              part.text, part.entities, size, textColor,
              0, size, wrap, Math.min(height - size, maxTextHeight(size, linesLeft)), emojiBrand, this.telegram
            )
            textBlocks.push({ canvas, quote: part.quote, code: part.code })
            linesLeft -= countLines(canvas, size)
          }
          textCanvas = textBlocks[0] && textBlocks[0].canvas
        } else {
          textCanvas = await drawMultilineText(
            text, message.entities, fontSize, textColor,
            0, fontSize, message.isQuote ? quoteWidth : textWidth, Math.min(height - fontSize, maxTextHeight(fontSize, maxLines)), emojiBrand, this.telegram
          )
        }
      } catch (error) {
        console.error('Failed to render message text:', error.message, error.stack)
        // Retry without entities (plain text fallback)
        try {
          textBlocks = null
          textCanvas = await drawMultilineText(
            text, [], fontSize, textColor,
            0, fontSize, message.isQuote ? quoteWidth : textWidth, Math.min(height - fontSize, maxTextHeight(fontSize, maxLines)), emojiBrand, this.telegram
          )
        } catch (retryError) {
          console.error('Failed to render plain text fallback:', retryError.message)
          return null
        }
      }
    }

    let avatarCanvas
    if (message.avatar && message.from) {
      try {
        avatarCanvas = await drawAvatar(message.from, this.telegram)
      } catch (error) {
        console.warn('Error drawing avatar:', error.message)
        avatarCanvas = null
      }
    }

    let replyData = null
    const replyHasMedia = !!(message.replyMessage && message.replyMessage.media &&
      (message.replyMessage.media.fileId || message.replyMessage.media.kind))
    if (message.replyMessage && message.replyMessage.name && (message.replyMessage.text || replyHasMedia)) {
      try {
        const chatId = message.replyMessage.chatId || 0
        const replyAccent = resolveAccent(message.replyMessage.accentColorId, lightBubble)
        const replyNameColor = ensureContrast(
          replyAccent ? replyAccent[0] : nameColorArray[peerColorIndex(chatId)],
          bubbleColors, style.nameContrast
        )
        // The chip lives inside the bubble: its texts get what is left after
        // the chip padding and the media thumbnail.
        const replyHasThumb = !!(message.replyMessage.media && (message.replyMessage.media.fileId || message.replyMessage.media.kind === 'story'))
        const replyWidth = width - (blk.padL + blk.padR) * scale -
          (replyHasThumb ? (style.replyThumb + blk.thumbGap) * scale : 0) -
          (bigEmoji || message.mediaType === 'sticker' || message.mediaType === 'video_note' ? 2 * style.space.chip * scale : 0)

        const replyName = typeof message.replyMessage.name === 'string' ? message.replyMessage.name : String(message.replyMessage.name)
        const replyText = message.replyMessage.text
          ? (typeof message.replyMessage.text === 'string' ? message.replyMessage.text : String(message.replyMessage.text))
          : ''

        const replyNameFontSize = style.fonts.replyName * scale
        const replyNameCanvas = await drawMultilineText(
          replyName, 'bold', replyNameFontSize, replyNameColor,
          0, replyNameFontSize, replyWidth, replyNameFontSize, emojiBrand, this.telegram
        )

        const replyTextFontSize = style.fonts.replyText * scale
        // A reply to a text-less message (photo/sticker/…) has no text line:
        // the block is the name plus the media thumbnail.
        const replyTextCanvas = replyText
          ? await drawMultilineText(
            replyText, message.replyMessage.entities || [],
            replyTextFontSize, textColor,
            0, replyTextFontSize, replyWidth, replyTextFontSize, emojiBrand, this.telegram
          )
          : null

        if (replyNameCanvas && (replyTextCanvas || replyHasMedia)) {
          replyData = {
            name: replyNameCanvas,
            nameColor: replyNameColor,
            // 2–3 color accents draw the striped line; single colors stay solid
            stripe: replyAccent && replyAccent.length > 1 ? replyAccent : null,
            text: replyTextCanvas
          }

          // Profile background emoji → faint pattern in the chip (glass only).
          const bgEmojiId = message.replyMessage.backgroundEmojiId
          if (style.block.emojiPattern && style.replyStyle === 'block' && bgEmojiId) {
            replyData.patternEmoji = await loadCustomEmojiImage(String(bgEmojiId), this.telegram).catch(() => null)
          }

          // Thumbnail of the replied media (photo/video/sticker…), like the
          // modern Telegram reply preview. Best-effort — silently skipped.
          const replyMedia = message.replyMessage.media
          if (replyMedia && replyMedia.fileId) {
            try {
              const fileUrl = await this.telegram.getFileLink(replyMedia.fileId)
              const buffer = await loadImageFromUrl(fileUrl)
              replyData.thumb = await loadImage(buffer)
            } catch (error) {
              console.warn('Failed to load reply thumb:', error.message)
            }
          }
          // Story reply: no preview in the Bot API — a story ring stands in.
          if (replyMedia && replyMedia.kind === 'story' && !replyData.thumb) replyData.thumb = drawStoryRing(style.replyThumb * scale, replyNameColor, scale)
        }
      } catch (error) {
        console.error('Failed to render reply:', error.message, error.stack)
        replyData = null
      }
    }

    // Row-style attachments (rendered inside the bubble, like Telegram).
    let attachment = null
    const attachMaxW = Math.min(width, outerWidth * 2 / 3)
    if (message.voice && typeof message.voice === 'object') {
      attachment = drawVoiceRow(
        message.voice.waveform, message.voice.duration,
        nameColor, textColor, scale, attachMaxW
      )
    } else if (message.document) {
      attachment = drawDocumentRow(message.document, nameColor, textColor, scale, attachMaxW)
    } else if (message.audio) {
      let audioThumb = null
      const thumbId = message.audio.thumb && (message.audio.thumb.file_id || message.audio.thumb)
      if (thumbId) {
        try {
          const fileUrl = typeof thumbId === 'string' && thumbId.startsWith('http')
            ? thumbId
            : await this.telegram.getFileLink(thumbId)
          audioThumb = await loadImage(await loadImageFromUrl(fileUrl))
        } catch (error) {
          console.warn('Failed to load audio thumb:', error.message)
        }
      }
      attachment = drawAudioRow(message.audio, nameColor, textColor, scale, attachMaxW, audioThumb)
    }
    if (!attachment && card) attachment = card.canvas

    // Video/GIF media badges, painted over the media by the composer.
    let mediaBadge = null
    if (mediaCanvas && mediaType !== 'album') {
      if (message.mediaType === 'video') {
        mediaBadge = { play: true, label: message.mediaDuration != null ? formatDuration(message.mediaDuration) : null }
      } else if (message.mediaType === 'gif' || message.mediaType === 'animation') {
        mediaBadge = { label: 'GIF' }
      }
    }

    // Forward label
    const isForward = !!message.forward
    const forwardLabel = isForward ? (message.forward.label || 'Forwarded message') : null

    // Nothing to render — skip this message
    if (!textCanvas && !nameCanvas && !mediaCanvas && !replyData && !attachment) {
      return null
    }

    return drawQuote({
      scale,
      background: { colorOne: backgroundColorOne, colorTwo: backgroundColorTwo, textColor },
      avatar: avatarCanvas,
      reply: replyData,
      name: nameCanvas,
      text: textCanvas,
      textBlocks,
      media: mediaCanvas ? { canvas: mediaCanvas, type: mediaType, maxSize: maxMediaSize, badge: mediaBadge } : null,
      attachment: attachment ? { canvas: attachment } : null,
      isForward,
      forwardLabel,
      nameColor,
      tag: tagCanvas,
      maxWidth: width,
      viaBot: viaBotCanvas,
      topic: nameCanvas ? await drawTopicLine(message.topic, { scale, style, textColor, accent: nameColor, telegram: this.telegram, emojiBrand }) : null,
      groupPos: message.groupPos || 'single',
      isQuote: !!message.isQuote,
      style
    })
  }
}

/**
 * Recolors every opaque pixel of a text canvas with a horizontal gradient
 * (source-in compositing keeps the glyph alpha, replaces the color).
 */
// Height budget for `lines` lines of text: the layout cuts (with "…") when the
// next line's baseline would pass it, so aim between line N and N+1.
function maxTextHeight (fontSize, lines) {
  return fontMetrics(fontSize).ascent + (lines - 0.5) * fontSize * 1.2
}

// Line count of a rendered text canvas (metric height → lines).
function countLines (canvas, fontSize) {
  if (canvas.width <= 1 && canvas.height <= 1) return 0
  const { ascent, descent } = fontMetrics(fontSize)
  return Math.round((canvas.height - ascent - descent) / (fontSize * 1.2)) + 1
}

// Two one-line text canvases side by side (same font size → same metric box).
function joinRow (a, b, gap) {
  const out = createCanvas(Math.ceil(a.width + gap + b.width), Math.max(a.height, b.height))
  const ctx = out.getContext('2d')
  ctx.drawImage(a, 0, 0)
  ctx.drawImage(b, a.width + gap, 0)
  if (a.optical) out.optical = a.optical
  return out
}

function gradientTint (canvas, colorFrom, colorTo) {
  if (!canvas || canvas.width < 2) return canvas
  const ctx = canvas.getContext('2d')
  const grad = ctx.createLinearGradient(0, 0, canvas.width, 0)
  grad.addColorStop(0, colorFrom)
  grad.addColorStop(1, colorTo)
  ctx.save()
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.restore()
  return canvas
}

// Placeholder emoji that carries the emoji-status entity (one UTF-16 unit).
const STATUS_PLACEHOLDER = '\u2B50'

// Photo sizes arrive smallest → largest. Take the smallest one that still
// covers the slot (the 1280px original is wasted on a ~680px slot); entries
// without dimensions fall back to the largest.
function pickPhotoSize (list, need) {
  if (!Array.isArray(list)) return list || null // a bare file id / PhotoSize
  if (list.length === 0) return null
  if (list.length === 1) return list[0]
  const sized = list.filter((m) => m && Number(m.width) > 0 && Number(m.height) > 0)
  if (sized.length !== list.length) return list[list.length - 1]
  const sorted = sized.slice().sort((a, b) => a.width * a.height - b.width * b.height)
  return sorted.find((m) => Math.max(m.width, m.height) >= need) || sorted[sorted.length - 1]
}

const BLOCK_TYPES = { blockquote: 'quote', expandable_blockquote: 'quote', pre: 'code' }

/**
 * Splits text into plain / quote / code runs around blockquote and `pre`
 * entities. Returns null when there are none (the common case — render as a
 * single canvas). Entity offsets are UTF-16 code units, which is exactly how
 * JS slices.
 */
function splitBlocks (text, entities) {
  if (!Array.isArray(entities)) return null
  const blocks = entities
    .filter((e) => e && BLOCK_TYPES[e.type] && Number.isInteger(e.offset) && e.length > 0 && e.offset < text.length)
    .sort((a, b) => a.offset - b.offset)
  if (blocks.length === 0) return null

  const sliceEntities = (start, end) => entities
    .filter((e) => e && !BLOCK_TYPES[e.type] && Number.isInteger(e.offset) && Number.isInteger(e.length))
    .filter((e) => e.offset < end && e.offset + e.length > start)
    .map((e) => {
      const from = Math.max(e.offset, start)
      const to = Math.min(e.offset + e.length, end)
      return { ...e, offset: from - start, length: to - from }
    })

  const parts = []
  let pos = 0
  for (const q of blocks) {
    if (q.offset < pos) continue // overlapping blocks — keep the first
    if (q.offset > pos) {
      const raw = text.slice(pos, q.offset)
      const lead = raw.length - raw.replace(/^\n+/, '').length
      const plain = raw.slice(lead).replace(/\n+$/, '')
      if (plain.trim()) parts.push({ text: plain, entities: sliceEntities(pos + lead, pos + lead + plain.length), quote: false })
    }
    const end = Math.min(text.length, q.offset + q.length)
    if (BLOCK_TYPES[q.type] === 'code') {
      // A code block keeps its indentation; only the blank edges go.
      const raw = text.slice(q.offset, end)
      const lead = raw.length - raw.replace(/^\n+/, '').length
      const code = raw.slice(lead).replace(/\s+$/, '')
      if (code) parts.push({ text: code, entities: [{ type: 'pre', offset: 0, length: code.length }], quote: false, code: true })
    } else {
      parts.push({ text: text.slice(q.offset, end), entities: sliceEntities(q.offset, end), quote: true })
    }
    pos = end
  }
  if (pos < text.length) {
    const raw = text.slice(pos)
    const lead = raw.length - raw.replace(/^\n+/, '').length
    const tail = raw.slice(lead)
    if (tail.trim()) parts.push({ text: tail, entities: sliceEntities(pos + lead, text.length), quote: false })
  }
  return parts.length > 0 ? parts : null
}

module.exports = QuoteGenerate
module.exports.loadFonts = loadFonts
module.exports.gradientTint = gradientTint
