const fs = require('fs')
const { createCanvas, registerFont } = require('canvas')
const EmojiDbLib = require('emoji-db')
const { loadImage } = require('canvas')
const loadImageFromUrl = require('./image-load-url')
const sharp = require('sharp')
const Jimp = require('jimp')
const smartcrop = require('smartcrop-sharp')
const runes = require('runes')
const lottie = require('lottie-node')
const zlib = require('zlib')
const { Telegram } = require('telegraf')

const emojiDb = new EmojiDbLib({ useDefaultDb: true })

function loadFont () {
  console.log('font load start')
  const fontsDir = 'assets/fonts/'

  fs.readdir(fontsDir, (_err, files) => {
    files.forEach((file) => {
      try {
        registerFont(`${fontsDir}${file}`, { family: file.replace(/\.[^/.]+$/, '') })
      } catch (error) {
        console.error(`${fontsDir}${file} not font file`)
      }
    })
  })

  console.log('font load end')
}

loadFont()

const emojiImageByBrand = require('./emoji-image')

const LRU = require('lru-cache')

const avatarCache = new LRU({
  max: 20,
  maxAge: 1000 * 60 * 5
})
class QuoteGenerate {
  constructor (botToken) {
    this.telegram = new Telegram(botToken)
  }

  async avatarImageLatters (letters, color) {
    const size = 500
    const canvas = createCanvas(size, size)
    const context = canvas.getContext('2d')

    color = color || '#' + (Math.random() * 0xFFFFFF << 0).toString(16)

    context.fillStyle = color
    context.fillRect(0, 0, canvas.width, canvas.height)

    const drawLetters = await this.drawMultilineText(
      letters,
      null,
      size / 2,
      '#FFF',
      0,
      size,
      size * 5,
      size * 5
    )

    context.drawImage(drawLetters, (canvas.width - drawLetters.width) / 2, (canvas.height - drawLetters.height) / 1.5)

    return canvas.toBuffer()
  }

  async downloadAvatarImage (user) {
    let avatarImage

    let nameLatters
    if (user.first_name && user.last_name) nameLatters = runes(user.first_name)[0] + (runes(user.last_name || '')[0])
    else {
      let name = user.first_name || user.name || user.title
      name = name.toUpperCase()
      const nameWord = name.split(' ')

      if (nameWord.length > 1) nameLatters = runes(nameWord[0])[0] + runes(nameWord.splice(-1)[0])[0]
      else nameLatters = runes(nameWord[0])[0]
    }

    const cacheKey = user.id

    const avatarImageCache = avatarCache.get(cacheKey)

    const avatarColorArray = [
      '#c03d33',
      '#4fad2d',
      '#d09306',
      '#168acd',
      '#8544d6',
      '#cd4073',
      '#2996ad',
      '#ce671b'
    ]

    const colorMapId = [0, 7, 4, 1, 6, 3, 5]
    const nameIndex = Math.abs(user.id) % 7

    const avatarColor = avatarColorArray[colorMapId[nameIndex]]

    if (avatarImageCache) {
      avatarImage = avatarImageCache
    } else if (user.photo && user.photo.url) {
      avatarImage = await loadImage(user.photo.url)
    } else {
      try {
        let userPhoto, userPhotoUrl

        if (user.photo && user.photo.big_file_id) userPhotoUrl = await this.telegram.getFileLink(user.photo.big_file_id).catch(console.error)

        if (!userPhotoUrl) {
          const getChat = await this.telegram.getChat(user.id).catch(console.error)
          if (getChat && getChat.photo && getChat.photo.big_file_id) userPhoto = getChat.photo.big_file_id

          if (userPhoto) userPhotoUrl = await this.telegram.getFileLink(userPhoto)
          else if (user.username) userPhotoUrl = `https://telega.one/i/userpic/320/${user.username}.jpg`
          else avatarImage = await loadImage(await this.avatarImageLatters(nameLatters, avatarColor))
        }

        if (userPhotoUrl) avatarImage = await loadImage(userPhotoUrl)

        avatarCache.set(cacheKey, avatarImage)
      } catch (error) {
        avatarImage = await loadImage(await this.avatarImageLatters(nameLatters, avatarColor))
      }
    }

    return avatarImage
  }

  ungzip (input, options) {
    return new Promise((resolve, reject) => {
      zlib.gunzip(input, options, (error, result) => {
        if (!error) resolve(result)
        else reject(Error(error))
      })
    })
  }

  async downloadMediaImage (media, mediaSize, type = 'id', crop = true) {
    let mediaUrl
    if (type === 'id') mediaUrl = await this.telegram.getFileLink(media).catch(console.error)
    else mediaUrl = media
    const load = await loadImageFromUrl(mediaUrl)
    if (mediaUrl.match(/.tgs/)) {
      const jsonLottie = await this.ungzip(load)
      const canvas = createCanvas(512, 512)
      const animation = lottie(JSON.parse(jsonLottie.toString()), canvas)
      const middleFrame = Math.floor(animation.getDuration(true) / 2)
      animation.goToAndStop(middleFrame, true)

      return canvas
    } else if (crop || mediaUrl.match(/.webp/)) {
      const imageSharp = sharp(load)
      const imageMetadata = await imageSharp.metadata()
      const sharpPng = await imageSharp.png({ lossless: true, force: true }).toBuffer()

      let croppedImage

      if (imageMetadata.format === 'webp') {
        const jimpImage = await Jimp.read(sharpPng)

        croppedImage = await jimpImage.autocrop(false).getBufferAsync(Jimp.MIME_PNG)
      } else {
        const smartcropResult = await smartcrop.crop(sharpPng, { width: mediaSize, height: imageMetadata.height })
        const crop = smartcropResult.topCrop

        croppedImage = imageSharp.extract({ width: crop.width, height: crop.height, left: crop.x, top: crop.y })
        croppedImage = await imageSharp.png({ lossless: true, force: true }).toBuffer()
      }

      return loadImage(croppedImage)
    } else {
      return loadImage(load)
    }
  }

  hexToRgb (hex) {
    return hex.replace(/^#?([a-f\d])([a-f\d])([a-f\d])$/i
      , (m, r, g, b) => '#' + r + r + g + g + b + b)
      .substring(1).match(/.{2}/g)
      .map(x => parseInt(x, 16))
  }

  // https://codepen.io/andreaswik/pen/YjJqpK
  lightOrDark (color) {
    let r, g, b

    // Check the format of the color, HEX or RGB?
    if (color.match(/^rgb/)) {
      // If HEX --> store the red, green, blue values in separate variables
      color = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+(?:\.\d+)?))?\)$/)

      r = color[1]
      g = color[2]
      b = color[3]
    } else {
      // If RGB --> Convert it to HEX: http://gist.github.com/983661
      color = +('0x' + color.slice(1).replace(
        color.length < 5 && /./g, '$&$&'
      )
      )

      r = color >> 16
      g = color >> 8 & 255
      b = color & 255
    }

    // HSP (Highly Sensitive Poo) equation from http://alienryderflex.com/hsp.html
    const hsp = Math.sqrt(
      0.299 * (r * r) +
      0.587 * (g * g) +
      0.114 * (b * b)
    )

    // Using the HSP value, determine whether the color is light or dark
    if (hsp > 127.5) {
      return 'light'
    } else {
      return 'dark'
    }
  }

  async drawMultilineText (text, entities, fontSize, fontColor, textX, textY, maxWidth, maxHeight, emojiBrand = 'apple') {
    if (maxWidth > 10000) maxWidth = 10000
    if (maxHeight > 10000) maxHeight = 10000

    const emojiImageJson = emojiImageByBrand[emojiBrand]

    let fallbackEmojiBrand = 'apple'
    if (emojiBrand === 'blob') fallbackEmojiBrand = 'google'

    const fallbackEmojiImageJson = emojiImageByBrand[fallbackEmojiBrand]

    const canvas = createCanvas(maxWidth + fontSize, maxHeight + fontSize)
    const canvasCtx = canvas.getContext('2d')

    text = text.slice(0, 4096)
    text = text.replace(/і/g, 'i') // замена украинской буквы і на английскую, так как она отсутствует в шрифтах Noto
    const chars = text.split('')

    const lineHeight = 4 * (fontSize * 0.3)

    const styledChar = []

    const emojis = emojiDb.searchFromText({ input: text, fixCodePoints: true })

    for (let charIndex = 0; charIndex < chars.length; charIndex++) {
      const char = chars[charIndex]

      styledChar[charIndex] = {
        char,
        style: []
      }

      if (entities && typeof entities === 'string') styledChar[charIndex].style.push(entities)
    }

    if (entities && typeof entities === 'object') {
      for (let entityIndex = 0; entityIndex < entities.length; entityIndex++) {
        const entity = entities[entityIndex]
        const style = []

        if (['pre', 'code'].includes(entity.type)) {
          style.push('monospace')
        } else if (
          ['mention', 'text_mention', 'hashtag', 'email', 'phone_number', 'bot_command', 'url', 'text_link']
            .includes(entity.type)
        ) {
          style.push('mention')
        } else {
          style.push(entity.type)
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

    const breakMatch = /<br>|\n|\r/
    const spaceMatch = /[\f\n\r\t\v\u0020\u1680\u2000-\u200a\u2028\u2029\u205f\u3000]/

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
              (charStyle.char.match(breakMatch)) ||
              (charStyle.char.match(spaceMatch) && !lastChar.char.match(spaceMatch)) ||
              (lastChar.char.match(spaceMatch) && !charStyle.char.match(spaceMatch)) ||
              (charStyle.style && lastChar.style && charStyle.style.toString() !== lastChar.style.toString())
            )
        )
      ) {
        stringNum++
      }

      if (!styledWords[stringNum]) {
        styledWords[stringNum] = {
          word: charStyle.char
        }

        if (charStyle.style) styledWords[stringNum].style = charStyle.style
        if (charStyle.emoji) styledWords[stringNum].emoji = charStyle.emoji
      } else styledWords[stringNum].word += charStyle.char
    }

    let lineX = textX
    let lineY = textY

    let textWidth = 0

    let breakWrite = false
    for (let index = 0; index < styledWords.length; index++) {
      const styledWord = styledWords[index]

      let emojiImage

      if (styledWord.emoji) {
        const emojiImageBase = emojiImageJson[styledWord.emoji.code]
        if (emojiImageBase) {
          emojiImage = await loadImage(
            Buffer.from(emojiImageBase, 'base64')
          ).catch(() => {})
        }
        if (!emojiImage) {
          emojiImage = await loadImage(
            Buffer.from(fallbackEmojiImageJson[styledWord.emoji.code], 'base64')
          ).catch(() => {})
        }
      }

      let fontType = ''
      let fontName = 'NotoSans'
      let fillStyle = fontColor

      if (styledWord.style.includes('bold')) {
        fontType += 'bold '
      }
      if (styledWord.style.includes('italic')) {
        fontType += 'italic '
      }
      if (styledWord.style.includes('monospace')) {
        fontName = 'SFNSMono'
        fillStyle = '#5887a7'
      }
      if (styledWord.style.includes('mention')) {
        fillStyle = '#6ab7ec'
      }
      if (styledWord.style.includes('spoiler')) {
        const rbaColor = this.hexToRgb(this.normalizeColor(fontColor))
        fillStyle = `rgba(${rbaColor[0]}, ${rbaColor[1]}, ${rbaColor[2]}, 0.15)`
      }
      // else {
      //   canvasCtx.font = `${fontSize}px OpenSans`
      //   canvasCtx.fillStyle = fontColor
      // }

      canvasCtx.font = `${fontType} ${fontSize}px ${fontName}`
      canvasCtx.fillStyle = fillStyle

      if (canvasCtx.measureText(styledWord.word).width > maxWidth - fontSize * 3) {
        while (canvasCtx.measureText(styledWord.word).width > maxWidth - fontSize * 3) {
          styledWord.word = styledWord.word.substr(0, styledWord.word.length - 1)
          if (styledWord.word.length <= 0) break
        }
        styledWord.word += '…'
      }

      let lineWidth
      const wordlWidth = canvasCtx.measureText(styledWord.word).width

      if (styledWord.emoji) lineWidth = lineX + fontSize
      else lineWidth = lineX + wordlWidth

      if (styledWord.word.match(breakMatch) || (lineWidth > maxWidth - fontSize * 2 && wordlWidth < maxWidth)) {
        if (styledWord.word.match(spaceMatch) && !styledWord.word.match(breakMatch)) styledWord.word = ''
        if ((styledWord.word.match(spaceMatch) || !styledWord.word.match(breakMatch)) && lineY + lineHeight > maxHeight) {
          while (lineWidth > maxWidth - fontSize * 2) {
            styledWord.word = styledWord.word.substr(0, styledWord.word.length - 1)
            lineWidth = lineX + canvasCtx.measureText(styledWord.word).width
            if (styledWord.word.length <= 0) break
          }

          styledWord.word += '…'
          lineWidth = lineX + canvasCtx.measureText(styledWord.word).width
          breakWrite = true
        } else {
          if (styledWord.emoji) lineWidth = textX + fontSize + (fontSize * 0.15)
          else lineWidth = textX + canvasCtx.measureText(styledWord.word).width

          lineX = textX
          lineY += lineHeight
        }
      }

      if (lineWidth > textWidth) textWidth = lineWidth
      if (textWidth > maxWidth) textWidth = maxWidth

      if (emojiImage) {
        canvasCtx.drawImage(emojiImage, lineX, lineY - fontSize + (fontSize * 0.15), fontSize, fontSize)
      } else {
        canvasCtx.fillText(styledWord.word, lineX, lineY)

        if (styledWord.style.includes('strikethrough')) canvasCtx.fillRect(lineX, lineY - fontSize / 2.8, canvasCtx.measureText(styledWord.word).width, fontSize * 0.1)
        if (styledWord.style.includes('underline')) canvasCtx.fillRect(lineX, lineY + 2, canvasCtx.measureText(styledWord.word).width, fontSize * 0.1)
      }

      lineX = lineWidth

      if (breakWrite) break
    }

    const canvasResize = createCanvas(textWidth, lineY + fontSize)
    const canvasResizeCtx = canvasResize.getContext('2d')

    canvasResizeCtx.drawImage(canvas, 0, 0)

    return canvasResize
  }

  // https://stackoverflow.com/a/3368118
  drawRoundRect (color, w, h, r) {
    const x = 0
    const y = 0

    const canvas = createCanvas(w, h)
    const canvasCtx = canvas.getContext('2d')

    canvasCtx.fillStyle = color

    if (w < 2 * r) r = w / 2
    if (h < 2 * r) r = h / 2
    canvasCtx.beginPath()
    canvasCtx.moveTo(x + r, y)
    canvasCtx.arcTo(x + w, y, x + w, y + h, r)
    canvasCtx.arcTo(x + w, y + h, x, y + h, r)
    canvasCtx.arcTo(x, y + h, x, y, r)
    canvasCtx.arcTo(x, y, x + w, y, r)
    canvasCtx.closePath()

    canvasCtx.fill()

    return canvas
  }

  roundImage (image, r) {
    const w = image.width
    const h = image.height

    const canvas = createCanvas(w, h)
    const canvasCtx = canvas.getContext('2d')

    const x = 0
    const y = 0

    if (w < 2 * r) r = w / 2
    if (h < 2 * r) r = h / 2
    canvasCtx.beginPath()
    canvasCtx.moveTo(x + r, y)
    canvasCtx.arcTo(x + w, y, x + w, y + h, r)
    canvasCtx.arcTo(x + w, y + h, x, y + h, r)
    canvasCtx.arcTo(x, y + h, x, y, r)
    canvasCtx.arcTo(x, y, x + w, y, r)
    canvasCtx.clip()
    canvasCtx.closePath()
    canvasCtx.restore()
    canvasCtx.drawImage(image, x, y)

    return canvas
  }

  deawReplyLine (lineWidth, height, color) {
    const canvas = createCanvas(20, height)
    const context = canvas.getContext('2d')
    context.beginPath()
    context.moveTo(10, 0)
    context.lineTo(10, height)
    context.lineWidth = lineWidth
    context.strokeStyle = color
    context.stroke()

    return canvas
  }

  async drawAvatar (user) {
    const avatarImage = await this.downloadAvatarImage(user)

    if (avatarImage) {
      const avatarSize = avatarImage.naturalHeight

      const canvas = createCanvas(avatarSize, avatarSize)
      const canvasCtx = canvas.getContext('2d')

      const avatarX = 0
      const avatarY = 0

      canvasCtx.beginPath()
      canvasCtx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2, true)
      canvasCtx.clip()
      canvasCtx.closePath()
      canvasCtx.restore()
      canvasCtx.drawImage(avatarImage, avatarX, avatarY, avatarSize, avatarSize)

      return canvas
    }
  }

  drawLineSegment (ctx, x, y, width, isEven) {
    ctx.lineWidth = 35 // how thick the line is
    ctx.strokeStyle = '#aec6cf' // what color our line is
    ctx.beginPath()
    y = isEven ? y : -y
    ctx.moveTo(x, 0)
    ctx.lineTo(x, y)
    ctx.arc(x + width / 2, y, width / 2, Math.PI, 0, isEven)
    ctx.lineTo(x + width, 0)
    ctx.stroke()
  }

  drawWaveform (data) {
    const normalizedData = data.map(i => i / 32)

    const canvas = createCanvas(4500, 500)
    const padding = 50
    canvas.height = (canvas.height + padding * 2)
    const ctx = canvas.getContext('2d')
    ctx.translate(0, canvas.height / 2 + padding)

    // draw the line segments
    const width = canvas.width / normalizedData.length
    for (let i = 0; i < normalizedData.length; i++) {
      const x = width * i
      let height = normalizedData[i] * canvas.height - padding
      if (height < 0) {
        height = 0
      } else if (height > canvas.height / 2) {
        height = height > canvas.height / 2
      }
      this.drawLineSegment(ctx, x, height, width, (i + 1) % 2)
    }
    return canvas
  }

  async drawQuote (scale = 1, backgroundColor, avatar, replyName, replyText, name, text, media, mediaType, maxMediaSize) {
    const blockPosX = 55 * scale
    const blockPosY = 0

    const indent = 15 * scale

    const avatarPosX = 0
    const avatarPosY = 15
    const avatarSize = 50 * scale

    if (mediaType === 'sticker') name = undefined

    let width = 0
    if (name) width = name.width
    if (text && width < text.width) width = text.width + indent
    if (replyName) {
      if (width < replyName.width) width = replyName.width + indent
      if (width < replyText.width) width = replyText.width + indent
    }

    let height = indent
    if (text) height += text.height
    else height += indent

    if (name) {
      height = name.height
      if (text) height = text.height + name.height
      else height += indent
    }

    width += blockPosX + (indent * 2)
    height += blockPosY

    let namePosX = blockPosX + indent
    let namePosY = indent

    if (!name) {
      namePosX = 0
      namePosY = -indent
    }

    const textPosX = blockPosX + indent
    let textPosY = indent
    if (name) textPosY = name.height

    let replyPosX = 0
    let replyNamePosY = 0
    let replyTextPosY = 0

    if (replyName) {
      replyPosX = textPosX + indent

      const replyNameHeight = replyName.height * 1.2
      const replyTextHeight = replyText.height * 0.5

      replyNamePosY = namePosY + replyNameHeight
      replyTextPosY = replyNamePosY + replyTextHeight

      textPosY += replyNameHeight + replyTextHeight + (indent / 2)
      height += replyNameHeight + replyTextHeight + (indent / 2)
    }

    let mediaPosX = 0
    let mediaPosY = 0

    let mediaWidth, mediaHeight

    if (media) {
      mediaWidth = media.width * (maxMediaSize / media.height)
      mediaHeight = maxMediaSize

      if (mediaWidth >= maxMediaSize) {
        mediaWidth = maxMediaSize
        mediaHeight = media.height * (maxMediaSize / media.width)
      }

      if (!text || text.width <= mediaWidth || mediaWidth > (width - blockPosX)) {
        width = mediaWidth + indent * 6
      }

      height += mediaHeight
      if (!text) height += indent

      if (name) {
        mediaPosX = namePosX
        mediaPosY = name.height + 5 * scale
      } else {
        mediaPosX = blockPosX + indent
        mediaPosY = indent
      }
      if (replyName) mediaPosY += replyNamePosY + indent / 2
      textPosY = mediaPosY + mediaHeight + 5 * scale
    }

    if (mediaType === 'sticker' && (name || replyName)) {
      mediaPosY += indent * 4
      height += indent * 2
    }

    const canvas = createCanvas(width, height)
    const canvasCtx = canvas.getContext('2d')

    let rectWidth = width - blockPosX
    let rectHeight = height
    const rectPosX = blockPosX
    const rectPosY = blockPosY
    const rectRoundRadius = 25 * scale

    let rect
    if (mediaType === 'sticker' && (name || replyName)) {
      rectHeight -= mediaHeight + indent * 2
    }

    if (mediaType !== 'sticker' || name || replyName) rect = this.drawRoundRect(backgroundColor, rectWidth, rectHeight, rectRoundRadius)

    if (avatar) canvasCtx.drawImage(avatar, avatarPosX, avatarPosY, avatarSize, avatarSize)
    if (rect) canvasCtx.drawImage(rect, rectPosX, rectPosY)
    if (name) canvasCtx.drawImage(name, namePosX, namePosY)
    if (text) canvasCtx.drawImage(text, textPosX, textPosY)
    if (media) canvasCtx.drawImage(this.roundImage(media, 5 * scale), mediaPosX, mediaPosY, mediaWidth, mediaHeight)

    if (replyName) {
      const backStyle = this.lightOrDark(backgroundColor)
      let lineColor = '#fff'
      if (backStyle === 'light') lineColor = '#000'
      canvasCtx.drawImage(this.deawReplyLine(3 * scale, replyName.height + replyText.height * 0.4, lineColor), textPosX - 7, replyNamePosY)

      canvasCtx.drawImage(replyName, replyPosX, replyNamePosY)
      canvasCtx.drawImage(replyText, replyPosX, replyTextPosY)
    }

    return canvas
  }

  normalizeColor (color) {
    const canvas = createCanvas(0, 0)
    const canvasCtx = canvas.getContext('2d')

    canvasCtx.fillStyle = color
    color = canvasCtx.fillStyle

    return color
  }

  async generate (backgroundColor, message, width = 512, height = 512, scale = 2, emojiBrand = 'apple') {
    if (!scale) scale = 2
    if (scale > 20) scale = 20
    width *= scale
    height *= scale

    // check background style color black/light
    const backStyle = this.lightOrDark(backgroundColor)

    // defsult color from tdesktop
    // https://github.com/telegramdesktop/tdesktop/blob/67d08c2d4064e04bec37454b5b32c5c6e606420a/Telegram/SourceFiles/data/data_peer.cpp#L43
    // const nameColor = [
    //   '#c03d33',
    //   '#4fad2d',
    //   '#d09306',
    //   '#168acd',
    //   '#8544d6',
    //   '#cd4073',
    //   '#2996ad',
    //   '#ce671b'
    // ]

    // name light style color
    const nameColorLight = [
      '#862a23',
      '#37791f',
      '#916604',
      '#0f608f',
      '#5d2f95',
      '#8f2c50',
      '#1c6979',
      '#904812'
    ]

    // name dark style color
    const nameColorDark = [
      '#fb6169',
      '#85de85',
      '#f3bc5c',
      '#65bdf3',
      '#b48bf2',
      '#ff5694',
      '#62d4e3',
      '#faa357'
    ]

    // user name  color
    // https://github.com/telegramdesktop/tdesktop/blob/67d08c2d4064e04bec37454b5b32c5c6e606420a/Telegram/SourceFiles/data/data_peer.cpp#L43
    const nameMap = [0, 7, 4, 1, 6, 3, 5]

    let nameIndex = 1
    if (message.chatId) nameIndex = Math.abs(message.chatId) % 7

    const nameColorIndex = nameMap[nameIndex]
    const nameColorPalette = backStyle === 'light' ? nameColorLight : nameColorDark

    const nameColor = nameColorPalette[nameColorIndex]

    const nameSize = 22 * scale

    let nameCanvas
    if (message.from.name) {
      nameCanvas = await this.drawMultilineText(
        message.from.name,
        'bold',
        nameSize,
        nameColor,
        0,
        nameSize,
        width,
        nameSize,
        emojiBrand
      )
    }

    // const minFontSize = 18
    // const maxFontSize = 28

    // let fontSize = 25 / ((text.length / 10) * 0.2)

    // if (fontSize < minFontSize) fontSize = minFontSize
    // if (fontSize > maxFontSize) fontSize = maxFontSize

    const fontSize = 24 * scale

    let textColor = '#fff'
    if (backStyle === 'light') textColor = '#000'

    let textCanvas
    if (message.text) {
      textCanvas = await this.drawMultilineText(
        message.text,
        message.entities,
        fontSize,
        textColor,
        0,
        fontSize,
        width,
        height - fontSize,
        emojiBrand
      )
    }

    let avatarCanvas
    if (message.avatar) avatarCanvas = await this.drawAvatar(message.from)

    let replyName, replyText
    if (message.replyMessage.name && message.replyMessage.text) {
      const replyNameIndex = Math.abs(message.replyMessage.chatId) % 7
      let replyNameColor = nameColorDark[nameMap[replyNameIndex]]
      if (backStyle === 'light') replyNameColor = nameColorLight[nameMap[replyNameIndex]]

      const replyNameFontSize = 16 * scale
      if (message.replyMessage.name) {
        replyName = await this.drawMultilineText(
          message.replyMessage.name,
          'bold',
          replyNameFontSize,
          replyNameColor,
          0,
          replyNameFontSize,
          width * 0.9,
          replyNameFontSize,
          emojiBrand
        )
      }

      let textColor = '#fff'
      if (backStyle === 'light') textColor = '#000'

      const replyTextFontSize = 21 * scale
      replyText = await this.drawMultilineText(
        message.replyMessage.text,
        message.replyMessage.entities,
        replyTextFontSize,
        textColor,
        0,
        replyTextFontSize,
        width * 0.9,
        replyTextFontSize,
        emojiBrand
      )
    }

    let mediaCanvas, mediaType, maxMediaSize
    if (message.media) {
      let media, type

      let crop = false
      if (message.mediaCrop) crop = true

      if (message.media.url) {
        type = 'url'
        media = message.media.url
      } else {
        type = 'id'
        if (message.media.length > 1) {
          if (crop) media = message.media[1]
          else media = message.media.pop()
        } else media = message.media[0]
      }

      maxMediaSize = width / 3 * scale
      if (message.text && maxMediaSize < textCanvas.width) maxMediaSize = textCanvas.width

      mediaCanvas = await this.downloadMediaImage(media, maxMediaSize, type, crop)
      mediaType = message.mediaType
    }

    if (message.voice) {
      mediaCanvas = this.drawWaveform(message.voice.waveform)
      maxMediaSize = width / 3 * scale
    }

    const quote = this.drawQuote(
      scale,
      backgroundColor,
      avatarCanvas,
      replyName, replyText,
      nameCanvas, textCanvas,
      mediaCanvas, mediaType, maxMediaSize
    )

    return quote
  }
}

module.exports = QuoteGenerate
