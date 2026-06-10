// Real rendering test using actual drawMultilineText
// Run: node test-real.js

const fs = require('fs')
const path = require('path')
const { createCanvas } = require('canvas')
const { drawQuote } = require('./utils/quote-generate/composer')
const { loadFonts, gradientTint } = require('./utils/quote-generate/index')
const { avatarImageLetters } = require('./utils/quote-generate/avatar')
const { drawAvatar } = require('./utils/quote-generate/avatar')
const { AVATAR_COLORS } = require('./utils/quote-generate/constants')
const { colorLuminance } = require('./utils/quote-generate/color')
const { loadIcons, drawVoiceRow, drawDocumentRow, drawAudioRow } = require('./utils/quote-generate/attachments')

const OUT = path.join(__dirname, 'test-output')
fs.mkdirSync(OUT, { recursive: true })

function makeAvatar (color1, color2, letter) {
  const size = 100
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')
  const grad = ctx.createLinearGradient(0, 0, size, size)
  grad.addColorStop(0, color1)
  grad.addColorStop(1, color2)
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = `bold ${size * 0.45}px sans-serif`
  ctx.textAlign = 'center'
  ctx.fillText(letter, size / 2, size / 2 + size * 0.16)
  return canvas
}

async function main () {
  await loadFonts()
  await loadIcons()
  const { drawMultilineText } = require('./utils/quote-generate/text-renderer')

  const scale = 2
  const width = 512 * scale
  const height = 512 * scale
  const tg = { getCustomEmojiStickers: async () => [] }

  // Mirrors the production scale in utils/quote-generate/index.js
  const nameSize = 18 * scale
  const fontSize = 24 * scale
  const replyNameSize = 14 * scale
  const replyTextSize = 15 * scale

  async function mkName (text, color) {
    const canvas = await drawMultilineText(text, [{ type: 'bold', offset: 0, length: text.length }], nameSize, color, 0, nameSize, width, nameSize, 'apple', tg)
    return gradientTint(canvas, color, colorLuminance(color, 0.25))
  }
  async function mkText (text, color) {
    return drawMultilineText(text, [], fontSize, color || '#fff', 0, fontSize, width, height, 'apple', tg)
  }
  async function mkReplyName (text, color) {
    return drawMultilineText(text, 'bold', replyNameSize, color, 0, replyNameSize, width * 0.9, replyNameSize, 'apple', tg)
  }
  async function mkReplyText (text, color) {
    return drawMultilineText(text, [], replyTextSize, color || '#fff', 0, replyTextSize, width * 0.9, replyTextSize, 'apple', tg)
  }

  const bg = { colorOne: '#292232', colorTwo: '#292232', textColor: '#fff' }
  const bgLight = { colorOne: '#e8e8e8', colorTwo: '#e8e8e8', textColor: '#000' }
  const bgGrad = { colorOne: '#667eea', colorTwo: '#764ba2', textColor: '#fff' }

  const tests = []

  // 1. Basic dark
  tests.push({
    name: 'real-01-basic',
    opts: {
      scale, background: bg,
      avatar: makeAvatar('#FF885E', '#FF516A', 'A'),
      name: await mkName('assasinfil', '#FF8E86'),
      text: await mkText('Переполнение вошло в чат'),
      nameColor: '#FF8E86'
    }
  })

  // 2. Basic light
  tests.push({
    name: 'real-02-light',
    opts: {
      scale, background: bgLight,
      avatar: makeAvatar('#72D5FD', '#2A9EF1', 'N'),
      name: await mkName('nowiks', '#3CA5EC'),
      text: await mkText('Ну получить можно... не понял..', '#000'),
      nameColor: '#3CA5EC'
    }
  })

  // Debug reply canvas sizes
  const dbgReplyName = await mkReplyName('Виталий', '#B18FFF')
  const dbgReplyText = await mkReplyText('не понял..')
  console.log(`Reply name canvas: ${dbgReplyName.width}x${dbgReplyName.height}`)
  console.log(`Reply text canvas: ${dbgReplyText.width}x${dbgReplyText.height}`)

  // 3. Reply
  tests.push({
    name: 'real-03-reply',
    opts: {
      scale, background: { colorOne: '#1a1a2e', colorTwo: '#16213e', textColor: '#fff' },
      avatar: makeAvatar('#FF885E', '#FF516A', 'A'),
      reply: {
        name: await mkReplyName('Виталий', '#B18FFF'),
        nameColor: '#B18FFF',
        text: await mkReplyText('не понял..')
      },
      name: await mkName('assasinfil', '#FF8E86'),
      text: await mkText('Переполнение вошло в чат'),
      nameColor: '#FF8E86'
    }
  })

  // 4. No avatar, no name (continuation)
  tests.push({
    name: 'real-04-noname',
    opts: {
      scale, background: bg,
      avatar: null, name: null,
      text: await mkText('понял..')
    }
  })

  // 5. Gradient bg
  tests.push({
    name: 'real-05-gradient',
    opts: {
      scale, background: bgGrad,
      avatar: makeAvatar('#FFCD6A', '#FFA85C', 'Y'),
      name: await mkName('Yuri', '#FFCD6A'),
      text: await mkText('This is a gradient background test with a longer message that wraps across multiple lines'),
      nameColor: '#FFCD6A'
    }
  })

  // 6. Forward
  tests.push({
    name: 'real-06-forward',
    opts: {
      scale, background: bg,
      avatar: makeAvatar('#A0DE7E', '#54CB68', 'P'),
      name: await mkName('Pavel Durov', '#4DD6BF'),
      text: await mkText('Telegram is the most secure messenger in the world.'),
      isForward: true,
      forwardLabel: 'Forwarded from Durov\'s Channel',
      nameColor: '#4DD6BF'
    }
  })

  // 7. Forward + reply
  tests.push({
    name: 'real-07-fwd-reply',
    opts: {
      scale, background: { colorOne: '#1e1e2e', colorTwo: '#1e1e2e', textColor: '#fff' },
      avatar: makeAvatar('#53EDD6', '#28C9B7', 'M'),
      reply: {
        name: await mkReplyName('Alice', '#7AC9FF'),
        nameColor: '#7AC9FF',
        text: await mkReplyText('What did he say?')
      },
      name: await mkName('Mike', '#45E8D1'),
      text: await mkText('He said something very interesting about the project roadmap'),
      isForward: true,
      forwardLabel: 'Forwarded from Project Updates',
      nameColor: '#45E8D1'
    }
  })

  // 8. Sender tag
  tests.push({
    name: 'real-08-tag',
    opts: {
      scale, background: bg,
      avatar: makeAvatar('#FF885E', '#FF516A', 'A'),
      name: await mkName('Admin User', '#FF8E86'),
      text: await mkText('Welcome to the group! Please read the rules.'),
      nameColor: '#FF8E86',
      senderTag: 'Admin'
    }
  })

  // 9. Tag + forward
  tests.push({
    name: 'real-09-tag-fwd',
    opts: {
      scale, background: { colorOne: '#0d1117', colorTwo: '#161b22', textColor: '#e6edf3' },
      avatar: makeAvatar('#FFA8A8', '#FF719A', 'C'),
      name: await mkName('Channel Bot', '#FF7FD5'),
      text: await mkText('Important announcement: server maintenance scheduled for tonight at 3 AM UTC'),
      isForward: true,
      forwardLabel: 'Forwarded from System Alerts',
      nameColor: '#FF7FD5',
      senderTag: 'NFC/SubGHz Dev'
    }
  })

  // 10. Long text with reply
  tests.push({
    name: 'real-10-long-reply',
    opts: {
      scale, background: { colorOne: '#2d2d44', colorTwo: '#2d2d44', textColor: '#fff' },
      avatar: makeAvatar('#72D5FD', '#2A9EF1', 'L'),
      reply: {
        name: await mkReplyName('Previous User', '#3CA5EC'),
        nameColor: '#3CA5EC',
        text: await mkReplyText('Can you explain?')
      },
      name: await mkName('Long Text User', '#7AC9FF'),
      text: await mkText('So basically what happens is that the system processes the input through several stages. First it validates the data, then transforms it, and finally persists it to the database.'),
      nameColor: '#7AC9FF'
    }
  })

  // 11. Short text
  tests.push({
    name: 'real-11-short',
    opts: {
      scale, background: bg,
      avatar: makeAvatar('#FFCD6A', '#FFA85C', 'S'),
      name: await mkName('User', '#FFA357'),
      text: await mkText('ok'),
      nameColor: '#FFA357'
    }
  })

  // 12. Long name + tag
  tests.push({
    name: 'real-12-longname-tag',
    opts: {
      scale, background: bg,
      avatar: makeAvatar('#E0A2F3', '#D669ED', 'X'),
      name: await mkName('Alexander Superlong Name', '#B18FFF'),
      text: await mkText('Testing a very long name with a tag'),
      nameColor: '#B18FFF',
      senderTag: 'Lead Developer & Architect'
    }
  })

  // 13. Partial quote (isQuote)
  tests.push({
    name: 'real-13-quote',
    opts: {
      scale, background: bg,
      avatar: makeAvatar('#72D5FD', '#2A9EF1', 'Q'),
      reply: {
        name: await mkReplyName('Original Author', '#7AC9FF'),
        nameColor: '#7AC9FF',
        text: await mkReplyText('only this part was quoted')
      },
      name: await mkName('Quoter', '#45E8D1'),
      text: await mkText('Exactly, this part is the key insight'),
      nameColor: '#45E8D1',
      isQuote: true
    }
  })

  // 14. Reply no avatar
  tests.push({
    name: 'real-14-reply-noavatar',
    opts: {
      scale, background: bg,
      avatar: null,
      reply: {
        name: await mkReplyName('Someone', '#FF8E86'),
        nameColor: '#FF8E86',
        text: await mkReplyText('Original message text here')
      },
      name: null,
      text: await mkText('Reply to that')
    }
  })

  // Helper: make circular avatar from avatarImageLetters (same as drawAvatar does)
  function makeRealAvatar (letters, colorIndex) {
    const avatarCanvas = avatarImageLetters(letters, AVATAR_COLORS[colorIndex % 7])
    const size = avatarCanvas.height
    const circle = createCanvas(size, size)
    const cctx = circle.getContext('2d')
    cctx.beginPath()
    cctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2, true)
    cctx.clip()
    cctx.drawImage(avatarCanvas, 0, 0, size, size)
    return circle
  }

  // 16. Initials avatar — two letters
  tests.push({
    name: 'real-16-initials-2',
    opts: {
      scale, background: bg,
      avatar: makeRealAvatar('YL', 3),
      name: await mkName('Yuri Ly', '#4DD6BF'),
      text: await mkText('Testing two-letter initials avatar'),
      nameColor: '#4DD6BF'
    }
  })

  // 17. Initials avatar — one letter
  tests.push({
    name: 'real-17-initials-1',
    opts: {
      scale, background: bg,
      avatar: makeRealAvatar('А', 5),
      name: await mkName('Антон', '#B18FFF'),
      text: await mkText('Тестуємо аватарку з одною літерою'),
      nameColor: '#B18FFF'
    }
  })

  // 18. Initials avatar — Cyrillic two letters
  tests.push({
    name: 'real-18-initials-cyrillic',
    opts: {
      scale, background: bgLight,
      avatar: makeRealAvatar('ВН', 2),
      name: await mkName('Виктор Никитчук', '#3CA5EC'),
      text: await mkText('Кириллические буквы в аватарке'),
      nameColor: '#3CA5EC'
    }
  })

  // 19. Standalone avatar renders (for direct comparison)
  const avatarTests = [
    { letters: 'YL', idx: 0 },
    { letters: 'А', idx: 1 },
    { letters: 'ВН', idx: 2 },
    { letters: 'JD', idx: 3 },
    { letters: 'М', idx: 4 },
    { letters: '?', idx: 5 },
    { letters: 'PD', idx: 6 }
  ]
  const avSize = 200
  const avPad = 20
  const avRow = createCanvas(avatarTests.length * (avSize + avPad), avSize)
  const avCtx = avRow.getContext('2d')
  for (let i = 0; i < avatarTests.length; i++) {
    const av = makeRealAvatar(avatarTests[i].letters, avatarTests[i].idx)
    avCtx.drawImage(av, i * (avSize + avPad), 0, avSize, avSize)
  }
  fs.writeFileSync(path.join(OUT, 'real-19-avatars-row.png'), avRow.toBuffer('image/png'))
  console.log(`  ✓ real-19-avatars-row (${avRow.width}x${avRow.height})`)

  // 20. Voice message
  tests.push({
    name: 'real-20-voice',
    opts: {
      scale, background: bg,
      avatar: makeAvatar('#FF885E', '#FF516A', 'A'),
      name: await mkName('assasinfil', '#FF8E86'),
      attachment: { canvas: drawVoiceRow(Array.from({ length: 50 }, (_, i) => 6 + ((i * 13) % 26), 0), 83, '#FF8E86', '#fff', scale, width * 2 / 3) },
      nameColor: '#FF8E86'
    }
  })

  // 21. Document
  tests.push({
    name: 'real-21-document',
    opts: {
      scale, background: bg,
      avatar: makeAvatar('#72D5FD', '#2A9EF1', 'N'),
      name: await mkName('nowiks', '#7AC9FF'),
      attachment: { canvas: drawDocumentRow({ file_name: 'квартальний_звіт_2026.pdf', file_size: 2.4 * 1024 * 1024 }, '#7AC9FF', '#fff', scale, width * 2 / 3) },
      nameColor: '#7AC9FF'
    }
  })

  // 22. Audio (no cover → note disc)
  tests.push({
    name: 'real-22-audio',
    opts: {
      scale, background: bg,
      avatar: makeAvatar('#A0DE7E', '#54CB68', 'M'),
      name: await mkName('Музика', '#4DD6BF'),
      attachment: { canvas: drawAudioRow({ title: 'Водограй', performer: 'Володимир Івасюк', duration: 215 }, '#4DD6BF', '#fff', scale, width * 2 / 3) },
      nameColor: '#4DD6BF'
    }
  })

  // 23. Video with play badge + duration, plus caption
  const videoFrame = createCanvas(800, 450)
  {
    const vctx = videoFrame.getContext('2d')
    const grad = vctx.createLinearGradient(0, 0, 800, 450)
    grad.addColorStop(0, '#2b5876')
    grad.addColorStop(1, '#4e4376')
    vctx.fillStyle = grad
    vctx.fillRect(0, 0, 800, 450)
  }
  tests.push({
    name: 'real-23-video',
    opts: {
      scale, background: bg,
      avatar: makeAvatar('#FFCD6A', '#FFA85C', 'V'),
      name: await mkName('Відеограф', '#FFA357'),
      media: { canvas: videoFrame, type: 'video', maxSize: width * 2 / 3, badge: { play: true, label: '0:42' } },
      text: await mkText('подивіться до кінця 🔥'),
      nameColor: '#FFA357'
    }
  })

  // 24. GIF (no caption → flush media with GIF chip)
  const gifFrame = createCanvas(640, 360)
  {
    const gctx = gifFrame.getContext('2d')
    const grad = gctx.createLinearGradient(0, 360, 640, 0)
    grad.addColorStop(0, '#f83600')
    grad.addColorStop(1, '#f9d423')
    gctx.fillStyle = grad
    gctx.fillRect(0, 0, 640, 360)
  }
  tests.push({
    name: 'real-24-gif',
    opts: {
      scale, background: bg,
      avatar: makeAvatar('#E0A2F3', '#D669ED', 'G'),
      name: await mkName('Гіфка', '#B18FFF'),
      media: { canvas: gifFrame, type: 'animation', maxSize: width * 2 / 3, badge: { label: 'GIF' } },
      nameColor: '#B18FFF'
    }
  })

  // Generate single tests
  for (const test of tests) {
    try {
      const canvas = drawQuote(test.opts)
      fs.writeFileSync(path.join(OUT, `${test.name}.png`), canvas.toBuffer('image/png'))
      console.log(`  ✓ ${test.name} (${canvas.width}x${canvas.height})`)
    } catch (err) {
      console.error(`  ✗ ${test.name}: ${err.message}`)
    }
  }

  // 15. MULTI-MESSAGE DIALOG
  const dialogOpts = [
    {
      scale, background: bg,
      avatar: null, // avatar rides on the LAST message of a streak
      name: await mkName('assasinfil', '#FF8E86'),
      text: await mkText('Хто знає як зробити NFC клон?'),
      nameColor: '#FF8E86',
      senderTag: 'NFC/SubGHz Dev',
      groupPos: 'first'
    },
    {
      scale, background: bg,
      avatar: makeAvatar('#FF885E', '#FF516A', 'A'),
      name: null,
      text: await mkText('Треба Flipper Zero для цього'),
      groupPos: 'last'
    },
    {
      scale, background: bg,
      avatar: makeAvatar('#72D5FD', '#2A9EF1', 'N'),
      reply: {
        name: await mkReplyName('assasinfil', '#FF8E86'),
        nameColor: '#FF8E86',
        text: await mkReplyText('Хто знає як зробити NFC клон?')
      },
      name: await mkName('nowiks', '#7AC9FF'),
      text: await mkText('Ну получить можно... не понял..'),
      nameColor: '#7AC9FF',
      isQuote: true
    },
    {
      scale, background: bg,
      avatar: makeAvatar('#E0A2F3', '#D669ED', 'В'),
      name: await mkName('Виктор Никитчук', '#B18FFF'),
      text: await mkText('Звучит очень по гейски'),
      isForward: true,
      forwardLabel: 'Forwarded from Misha Myte',
      nameColor: '#B18FFF'
    },
    {
      scale, background: bg,
      avatar: makeAvatar('#FF885E', '#FF516A', 'A'),
      name: await mkName('assasinfil', '#FF8E86'),
      text: await mkText('Переполнение вошло в чат'),
      nameColor: '#FF8E86',
      senderTag: 'NFC/SubGHz Dev'
    },
    {
      scale, background: bg,
      avatar: makeAvatar('#72D5FD', '#2A9EF1', 'N'),
      name: await mkName('nowiks', '#7AC9FF'),
      text: await mkText('понял..'),
      nameColor: '#7AC9FF'
    }
  ]

  const quoteMargin = 5 * scale
  const dialogCanvases = dialogOpts.map(o => drawQuote(o))
  let totalW = 0, totalH = 0
  for (const c of dialogCanvases) {
    if (c.width > totalW) totalW = c.width
    totalH += c.height + quoteMargin
  }
  const dialogCanvas = createCanvas(totalW, totalH)
  const dctx = dialogCanvas.getContext('2d')
  let y = 0
  for (const c of dialogCanvases) {
    dctx.drawImage(c, 0, y)
    y += c.height + quoteMargin
  }
  fs.writeFileSync(path.join(OUT, 'real-15-dialog.png'), dialogCanvas.toBuffer('image/png'))
  console.log(`  ✓ real-15-dialog (${dialogCanvas.width}x${dialogCanvas.height})`)

  console.log('\nDone!')
}

main().catch(console.error)
