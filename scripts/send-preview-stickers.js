// Надсилає прев'ю-стікери редизайну в Telegram.
// Run: node scripts/send-preview-stickers.js [chat_id]

require('dotenv').config()
const { Telegram } = require('telegraf')
const generate = require('../methods/generate')

const CHAT_ID = Number(process.argv[2] || 66478514)
const BOT_TOKEN = process.env.BOT_TOKEN
const BG = '//#252e44' // gradient pair (lighten/darken) → glass bubble

async function main () {
  if (!BOT_TOKEN) throw new Error('BOT_TOKEN missing in .env')
  const telegram = new Telegram(BOT_TOKEN)

  const cases = [
    ['текст + реплай', [{
      chatId: 101,
      avatar: true,
      from: { id: 101, name: 'Олена Ковальчук' },
      replyMessage: { name: 'Андрій', text: 'давай завтра о 10:00?', chatId: 102 },
      text: 'Домовились, скину нагадування 🔥'
    }]],
    ['voice', [{
      chatId: 103,
      avatar: true,
      from: { id: 103, name: 'Макс Голос' },
      voice: { waveform: Array.from({ length: 60 }, (_, i) => 4 + ((i * 13) % 28), 0), duration: 83 }
    }]],
    ['документ', [{
      chatId: 104,
      avatar: true,
      from: { id: 104, name: 'Бухгалтерія' },
      document: { file_name: 'квартальний_звіт_2026.pdf', file_size: 2.4 * 1024 * 1024 },
      text: 'фінальна версія'
    }]],
    ['музика', [{
      chatId: 105,
      avatar: true,
      from: { id: 105, name: 'Меломан' },
      audio: { title: 'Водограй', performer: 'Володимир Івасюк', duration: 215 }
    }]],
    ['відео', [{
      chatId: 106,
      avatar: true,
      from: { id: 106, name: 'Відеограф' },
      media: { url: 'https://picsum.photos/seed/quoteapi/640/360' },
      mediaType: 'video',
      mediaDuration: 42,
      text: 'подивіться до кінця 🔥'
    }]],
    ['діалог (групування)', [
      {
        chatId: 107,
        avatar: true,
        from: { id: 107, name: 'assasinfil' },
        text: 'Хто знає як зробити NFC клон?'
      },
      {
        chatId: 107,
        avatar: true,
        from: { id: 107, name: 'assasinfil' },
        text: 'Треба Flipper Zero для цього'
      },
      {
        chatId: 108,
        avatar: true,
        from: { id: 108, name: 'nowiks' },
        replyMessage: { name: 'assasinfil', text: 'Хто знає як зробити NFC клон?', chatId: 107 },
        text: 'Ну получить можна… не понял..'
      }
    ]]
  ]

  await telegram.sendMessage(CHAT_ID, '🎨 Прев\'ю редизайну цитат — глянь стікери нижче')

  for (const [label, messages] of cases) {
    try {
      const result = await generate({
        botToken: BOT_TOKEN,
        messages,
        type: 'quote',
        format: 'webp',
        ext: 'webp',
        scale: 2,
        backgroundColor: BG
      })
      if (result.error) throw new Error(result.error)
      await telegram.sendSticker(CHAT_ID, { source: Buffer.from(result.image) })
      console.log(`✓ ${label} (${result.width}x${result.height})`)
    } catch (err) {
      console.error(`✗ ${label}: ${err.message}`)
    }
  }
}

main().catch((err) => {
  console.error('FAIL:', err.message)
  process.exit(1)
})
