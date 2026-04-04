// utils/quote-generate/index.js

const fs = require('fs')
const path = require('path')
const { registerFont } = require('canvas')
const { Telegram } = require('telegraf')

const { drawMultilineText } = require('./text-renderer')
const { drawAvatar } = require('./avatar')
const { downloadMediaImage } = require('./media')
const { drawQuote } = require('./composer')
const { drawWaveform } = require('./waveform')
const { ColorContrast, lightOrDark, colorLuminance } = require('./color')
const { NAME_COLORS_LIGHT, NAME_COLORS_DARK } = require('./constants')

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
      registerFont(path.join(fontsDir, file), { family: file.replace(/\.[^/.]+$/, '') })
    } catch (error) {
      console.warn(`${file} is not a font file`)
    }
  }
  console.log('Fonts loaded')
}

class QuoteGenerate {
  constructor (botToken) {
    this.telegram = new Telegram(botToken)
  }

  async generate (backgroundColorOne, backgroundColorTwo, message, width, height, scale, emojiBrand) {
    scale = scale || 2
    if (!Number.isFinite(scale) || scale < 1) scale = 1
    if (scale > 20) scale = 20
    width = Math.max(1, (width || 512) * scale)
    height = Math.max(1, (height || 512) * scale)

    const backStyle = lightOrDark(backgroundColorOne)
    const nameColorArray = backStyle === 'light' ? NAME_COLORS_LIGHT : NAME_COLORS_DARK

    let nameIndex = 1
    if (message.from && message.from.id) nameIndex = Math.abs(message.from.id) % 7

    let nameColor = nameColorArray[nameIndex]

    const colorContrast = new ColorContrast()
    const contrast = colorContrast.getContrastRatio(colorLuminance(backgroundColorOne, 0.55), nameColor)
    if (contrast > 90 || contrast < 30) {
      nameColor = colorContrast.adjustContrast(colorLuminance(backgroundColorTwo, 0.55), nameColor)
    }

    const nameSize = 22 * scale

    let nameCanvas
    if ((message.from && message.from.name) || (message.from && (message.from.first_name || message.from.last_name))) {
      let name = message.from.name || `${message.from.first_name || ''} ${message.from.last_name || ''}`.trim()
      if (!name) name = 'User'

      const nameEntities = [{
        type: 'bold',
        offset: 0,
        length: name.length
      }]

      if (message.from.emoji_status) {
        name += ' \uD83E\uDD21'
        nameEntities.push({
          type: 'custom_emoji',
          offset: name.length - 2,
          length: 2,
          custom_emoji_id: message.from.emoji_status
        })
      }

      try {
        nameCanvas = await drawMultilineText(
          name, nameEntities, nameSize, nameColor,
          0, nameSize, width, nameSize, emojiBrand, this.telegram
        )
      } catch (error) {
        console.warn('Failed to render name text:', error.message)
      }
    }

    const fontSize = 24 * scale
    let textColor = backStyle === 'light' ? '#000' : '#fff'

    let textCanvas
    if (message.text) {
      const text = typeof message.text === 'string' ? message.text : String(message.text)
      try {
        textCanvas = await drawMultilineText(
          text, message.entities, fontSize, textColor,
          0, fontSize, width, height - fontSize, emojiBrand, this.telegram
        )
      } catch (error) {
        console.warn('Failed to render message text:', error.message)
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
    if (message.replyMessage && message.replyMessage.name && message.replyMessage.text) {
      try {
        const chatId = message.replyMessage.chatId || 0
        const replyNameIndex = Math.abs(chatId) % 7
        const replyNameColor = nameColorArray[replyNameIndex]

        const replyName = typeof message.replyMessage.name === 'string' ? message.replyMessage.name : String(message.replyMessage.name)
        const replyText = typeof message.replyMessage.text === 'string' ? message.replyMessage.text : String(message.replyMessage.text)

        const replyNameFontSize = 16 * scale
        const replyNameCanvas = await drawMultilineText(
          replyName, 'bold', replyNameFontSize, replyNameColor,
          0, replyNameFontSize, width * 0.9, replyNameFontSize, emojiBrand, this.telegram
        )

        const replyTextFontSize = 21 * scale
        const replyTextCanvas = await drawMultilineText(
          replyText, message.replyMessage.entities || [],
          replyTextFontSize, textColor,
          0, replyTextFontSize, width * 0.9, replyTextFontSize, emojiBrand, this.telegram
        )

        if (replyNameCanvas && replyTextCanvas) {
          replyData = { name: replyNameCanvas, nameColor: replyNameColor, text: replyTextCanvas }
        }
      } catch (error) {
        console.warn('Failed to render reply:', error.message)
        replyData = null
      }
    }

    let mediaCanvas = null
    let mediaType = null
    let maxMediaSize = null

    if (message.media) {
      let media, type
      let crop = !!message.mediaCrop

      if (message.media.url) {
        type = 'url'
        media = message.media.url
      } else {
        type = 'id'
        if (message.media.length > 1) {
          // BUG FIX: was message.media.pop() which mutated input
          media = crop ? message.media[1] : message.media[message.media.length - 1]
        } else {
          media = message.media[0]
        }
      }

      maxMediaSize = width / 3 * scale
      if (message.text && textCanvas && maxMediaSize < textCanvas.width) maxMediaSize = textCanvas.width

      if (media && media.is_animated) {
        media = media.thumb
        maxMediaSize = maxMediaSize / 2
      }

      try {
        mediaCanvas = await downloadMediaImage(media, maxMediaSize, type, crop, this.telegram)
        if (mediaCanvas) {
          mediaType = message.mediaType
        } else {
          console.warn('Failed to download media image, skipping')
        }
      } catch (error) {
        console.warn('Error downloading media image:', error.message)
      }
    }

    if (message.voice) {
      mediaCanvas = drawWaveform(message.voice.waveform)
      maxMediaSize = width / 3 * scale
    }

    // Forward label
    const isForward = !!message.forward
    const forwardLabel = isForward ? (message.forward.label || 'Forwarded message') : null

    // Sender tag (user role in group)
    const senderTag = message.senderTag || null

    // Nothing to render — skip this message
    if (!textCanvas && !nameCanvas && !mediaCanvas && !replyData) {
      return null
    }

    return drawQuote({
      scale,
      background: { colorOne: backgroundColorOne, colorTwo: backgroundColorTwo, textColor },
      avatar: avatarCanvas,
      reply: replyData,
      name: nameCanvas,
      text: textCanvas,
      media: mediaCanvas ? { canvas: mediaCanvas, type: mediaType, maxSize: maxMediaSize } : null,
      isForward,
      forwardLabel,
      nameColor,
      senderTag,
      isQuote: !!message.isQuote
    })
  }
}

module.exports = QuoteGenerate
module.exports.loadFonts = loadFonts
