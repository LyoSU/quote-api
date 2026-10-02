// Fixtures for the visual regression test. Fully deterministic (no randomness).
// Asset URLs use the "@@B@@" placeholder; test-visual.js swaps in the local server origin.

const B = '@@B@@'

const assets = {
  ava1: [320, 320, '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9a5a"/><stop offset="1" stop-color="#d4145a"/></linearGradient></defs><rect width="320" height="320" fill="url(#g)"/><circle cx="160" cy="130" r="60" fill="#fff" opacity=".85"/><ellipse cx="160" cy="300" rx="110" ry="90" fill="#fff" opacity=".85"/>'],
  ava2: [320, 320, '<rect width="320" height="320" fill="#2a9d8f"/><circle cx="160" cy="130" r="60" fill="#e9c46a"/><ellipse cx="160" cy="300" rx="110" ry="90" fill="#e9c46a"/>'],
  photoL: [1280, 800, '<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b8bd0"/><stop offset="1" stop-color="#f3c58b"/></linearGradient></defs><rect width="1280" height="800" fill="url(#s)"/><polygon points="0,800 350,280 620,800" fill="#3d4f6b"/><polygon points="400,800 800,200 1280,800" fill="#2c3a52"/><polygon points="700,380 800,200 900,380" fill="#fff"/><circle cx="1050" cy="160" r="70" fill="#fff6d0"/>'],
  photoP: [720, 1280, '<rect width="720" height="1280" fill="#264653"/><circle cx="360" cy="500" r="220" fill="#e76f51"/><rect x="100" y="900" width="520" height="200" rx="30" fill="#e9c46a"/>'],
  photoS: [900, 900, '<defs><linearGradient id="q" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#7b2cbf"/><stop offset="1" stop-color="#ff9e00"/></linearGradient></defs><rect width="900" height="900" fill="url(#q)"/><circle cx="450" cy="450" r="260" fill="none" stroke="#fff" stroke-width="40"/><rect x="380" y="380" width="140" height="140" fill="#fff"/>'],
  photoW: [1600, 700, '<rect width="1600" height="700" fill="#0b6e4f"/><polygon points="0,700 500,200 900,700" fill="#08a045"/><polygon points="600,700 1100,120 1600,700" fill="#6bbf59"/><circle cx="1350" cy="150" r="80" fill="#f4e285"/>'],
  photoT: [600, 1000, '<defs><linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ef476f"/><stop offset="1" stop-color="#118ab2"/></linearGradient></defs><rect width="600" height="1000" fill="url(#t)"/><circle cx="300" cy="360" r="140" fill="#ffd166"/><rect x="120" y="700" width="360" height="120" rx="20" fill="#fff"/>'],
  sticker: [512, 512, '<circle cx="256" cy="256" r="230" fill="#ffcc4d"/><circle cx="180" cy="200" r="30" fill="#664500"/><circle cx="332" cy="200" r="30" fill="#664500"/><path d="M140 310 Q256 420 372 310" stroke="#664500" stroke-width="24" fill="none" stroke-linecap="round"/>']
}

const base = (o = {}) => ({
  from: { id: 1, first_name: 'Юрій', last_name: 'Ly', photo: { url: `${B}/ava1` } },
  avatar: true,
  text: 'Привіт! Як справи?',
  ...o
})
const u2 = { id: 5, name: 'Олена Коваленко', photo: { url: `${B}/ava2` } }
const u3 = { id: 3, name: 'Max 🚀 Without Photo', photo: {} }

const messages = {
  basic: [base()],
  'basic-long': [base({ text: 'Це довге повідомлення, яке має переноситися на кілька рядків, щоб перевірити, як працює перенесення тексту і відступи всередині бабла.\n\nДругий абзац після порожнього рядка. І ще трохи тексту для ширини.' })],
  entities: [base({
    text: 'Жирний курсив підкреслений закреслений code_inline посилання @mention #hashtag спойлер',
    entities: [
      { type: 'bold', offset: 0, length: 6 }, { type: 'italic', offset: 7, length: 6 },
      { type: 'underline', offset: 14, length: 11 }, { type: 'strikethrough', offset: 26, length: 11 },
      { type: 'code', offset: 38, length: 11 }, { type: 'text_link', offset: 50, length: 9, url: 'https://x.com' },
      { type: 'mention', offset: 60, length: 8 }, { type: 'hashtag', offset: 69, length: 8 },
      { type: 'spoiler', offset: 78, length: 7 }
    ]
  })],
  pre: [base({ text: 'Дивись:\nfunction hello() {\n  return 42\n}', entities: [{ type: 'pre', offset: 8, length: 32, language: 'js' }] })],
  blockquote: [base({ text: 'Цитата з книги:\nСлова, що лишаються в серці надовго і не відпускають.\nА це вже мій коментар.', entities: [{ type: 'blockquote', offset: 16, length: 54 }] })],
  reply: [base({ replyMessage: { name: 'Олена Коваленко', text: 'А ти бачив новий реліз? Там стільки всього цікавого, аж не віриться', chatId: 5 } })],
  'reply-thumb': [base({ text: 'Гарне фото!', replyMessage: { name: 'Олена', text: 'Фото', chatId: 5, media: { fileId: 'photoL' } } })],
  'reply-shortmsg': [base({ text: 'Ок', replyMessage: { name: 'Дуже Довге Імʼя Користувача Яке Не Влазить', text: 'Дуже довгий текст відповіді, який точно має обрізатися десь тут на краю', chatId: 3 } })],
  forward: [base({ forward: { label: 'Переслано від Олена Коваленко' }, text: 'Переслане повідомлення з текстом' })],
  'tag-longname': [base({ from: { id: 7, name: 'Олександр Костянтинович Великодній-Запорізький', photo: { url: `${B}/ava2` } }, senderTag: 'адмін', text: 'Тест довгого імені з тегом' })],
  viabot: [base({ viaBot: 'gif', text: 'via bot повідомлення' })],
  'no-avatar-letters': [{ from: u3, avatar: true, text: 'Аватар з літер, бо фото немає' }],
  'no-avatar-false': [{ from: u3, avatar: false, text: 'Без аватара взагалі' }],
  'no-name': [{ from: { id: 1, name: false }, avatar: false, text: 'Без імені і аватара' }],
  'photo-caption': [base({ text: 'Подивись на цей краєвид 🏔', media: { url: `${B}/photoL` } })],
  'photo-only': [base({ text: '', media: { url: `${B}/photoL` } })],
  'photo-portrait': [base({ text: 'Портрет', media: { url: `${B}/photoP` } })],
  'photo-reply': [base({ text: 'Ось!', media: { url: `${B}/photoL` }, replyMessage: { name: 'Олена', text: 'Скинь фото', chatId: 5 } })],
  sticker: [base({ text: '', media: { url: `${B}/sticker` }, mediaType: 'sticker' })],
  'sticker-reply': [base({ text: '', media: { url: `${B}/sticker` }, mediaType: 'sticker', replyMessage: { name: 'Олена', text: 'Як тобі?', chatId: 5 } })],
  video: [base({ text: 'Відос', media: { url: `${B}/photoL` }, mediaType: 'video', mediaDuration: 83 })],
  gif: [base({ text: '', media: { url: `${B}/photoP` }, mediaType: 'animation' })],
  'video-note': [base({ text: '', media: { url: `${B}/photoP` }, mediaType: 'video_note' })],
  voice: [base({ text: '', voice: { waveform: Array.from({ length: 60 }, (_, i) => Math.round(15 + 15 * Math.sin(i / 3) + (i * 7) % 11)), duration: 42 } })],
  'voice-caption': [base({ text: 'Послухай', voice: { waveform: Array.from({ length: 60 }, (_, i) => (i * 13) % 31), duration: 5 } })],
  document: [base({ text: '', document: { file_name: 'Звіт_за_вересень_2026_фінальна_версія.pdf', file_size: 2.4 * 1024 * 1024 } })],
  audio: [base({ text: '', audio: { title: 'Океан Ельзи — Обійми', performer: 'Океан Ельзи', duration: 245, thumb: `${B}/photoL` } })],
  'audio-nothumb': [base({ text: '', audio: { title: 'track.mp3', duration: 61 } })],
  dialog: [
    base({ text: 'Привіт!', chatId: 1 }),
    base({ from: { id: 1, name: false, photo: { url: `${B}/ava1` } }, text: 'Ти тут?', chatId: 1 }),
    { from: u2, avatar: true, chatId: 5, text: 'Так, привіт 👋 що сталося?' },
    base({ chatId: 1, text: 'Глянь на це', replyMessage: { name: 'Олена Коваленко', text: 'Так, привіт 👋 що сталося?', chatId: 5 } }),
    { from: u3, avatar: true, chatId: 3, text: 'Я теж тут' }
  ],
  'emoji-only': [base({ text: '😂' })],
  'emoji-many': [base({ text: '🔥🔥🔥 це просто 💯 топ 🇺🇦❤️👨‍👩‍👧‍👦' })],
  'emoji-name': [{ from: { id: 9, name: '💜 Yuri 💜 🇺🇦', photo: { url: `${B}/ava1` } }, avatar: true, text: 'Емодзі в імені' }],
  rtl: [base({ text: 'مرحبا بالعالم، هذا اختبار للنص العربي' })],
  cjk: [base({ text: '你好世界，这是一个中文测试。日本語のテストです。한국어 테스트' })],
  'long-word': [base({ text: 'https://example.com/very/long/url/that/does/not/have/spaces/and/must/wrap/somehow/at/the/edge?query=123456789' })],
  'very-long': [base({ text: Array.from({ length: 40 }, (_, i) => `Рядок ${i + 1}: трохи тексту для висоти.`).join('\n') })],
  'voice-nowave': [base({ text: '', voice: { waveform: [], duration: 42 } })],
  'voice-nowave-short': [base({ text: '', voice: { duration: 7 } })],
  'reply-photo-notext': [base({ text: 'Гарне фото!', replyMessage: { name: 'Олена', text: '', chatId: 5, media: { kind: 'photo', fileId: 'photoL' } } })],
  'spoiler-photo': [base({ text: 'Спойлер', media: { url: `${B}/photoL` }, mediaType: 'photo', hasMediaSpoiler: true })],
  'spoiler-photo-only': [base({ text: '', media: { url: `${B}/photoP` }, mediaType: 'photo', hasMediaSpoiler: true })],
  'quote-blockquote': [base({ text: 'Цитата з книги:\nСлова, що лишаються в серці надовго і не відпускають.\nА це вже мій коментар.', entities: [{ type: 'blockquote', offset: 16, length: 54 }], isQuote: true, replyMessage: { name: 'Олена', text: 'Оригінал', chatId: 5 } })],
  'partial-quote': [base({ text: 'Лише виділена частина повідомлення', isQuote: true, replyMessage: { name: 'Олена', text: 'Оригінал', chatId: 5 } })]
}

// Albums: mixed portrait/landscape/square tiles (name → items, 'v' marks a video).
const albumSets = {
  2: ['photoL', 'photoP'],
  '2wide': ['photoL', 'photoW'],
  3: ['photoP', 'photoL', 'photoS'],
  '3wide': ['photoL', 'photoP', 'photoS'],
  4: ['photoL', 'photoP', 'photoS', 'photoT'],
  5: ['photoL', 'photoW', 'photoP', 'photoS', 'photoT'],
  7: ['photoL', 'photoP', 'photoS', 'photoW', 'photoT', 'photoL', 'photoS'],
  10: ['photoL', 'photoP', 'photoS', 'photoW', 'photoT', 'photoL', 'photoS', 'photoP', 'photoW', 'photoT']
}
const albumItems = (ids, video) => ids.map((id, i) => ({
  url: `${B}/${id}`,
  type: video === i ? 'video' : 'photo',
  ...(video === i ? { duration: 83 } : {})
}))
const albumMessages = {}
for (const [k, ids] of Object.entries(albumSets)) {
  albumMessages[`album-${k}`] = [base({ text: '', album: albumItems(ids) })]
  albumMessages[`album-${k}-caption`] = [base({ text: 'Фото з поїздки 🏔 вийшли чудово', album: albumItems(ids, 1) })]
}
albumMessages['album-4-reply'] = [base({ text: 'Ось всі', album: albumItems(albumSets[4], 0), replyMessage: { name: 'Олена', text: 'Скинь фото', chatId: 5 } })]
albumMessages['album-3-forward'] = [base({ text: '', forward: { label: 'Переслано від Олена Коваленко' }, album: albumItems(albumSets[3]) })]
albumMessages['album-4-spoiler'] = [base({ text: 'Спойлер-альбом', hasMediaSpoiler: true, album: albumItems(albumSets[4], 0) })]
albumMessages['album-1'] = [base({ text: 'Один у альбомі', album: albumItems(['photoL']) })]
albumMessages['album-missing'] = [base({ text: 'Один не завантажився', album: [...albumItems(['photoL', 'photoP']), { url: `${B}/nope`, type: 'photo' }] })]

const bgs = { dark: '#1b1429', light: '#ffffff', grad: '#1e3c72/#2a5298', trans: '//#292232', warm: '#f6e7c1' }

const cases = []
const add = (name, msgs, opts) => cases.push({ name, messages: msgs, opts })

for (const [name, m] of Object.entries(messages)) {
  add(`q-dark-${name}`, m, { backgroundColor: bgs.dark })
  add(`q-light-${name}`, m, { backgroundColor: bgs.light })
}
for (const name of Object.keys(albumMessages)) {
  add(`alb-glass-dark-${name}`, albumMessages[name], { backgroundColor: bgs.dark })
  add(`alb-classic-light-${name}`, albumMessages[name], { backgroundColor: bgs.light, style: 'classic' })
}
add('alb-glass-light-album-5-caption', albumMessages['album-5-caption'], { backgroundColor: bgs.light })
add('alb-classic-dark-album-7-caption', albumMessages['album-7-caption'], { backgroundColor: bgs.dark, style: 'classic' })

for (const b of ['grad', 'trans', 'warm']) add(`q-${b}-reply`, messages.reply, { backgroundColor: bgs[b] })
for (const [b, c] of Object.entries(bgs)) {
  add(`img-${b}-reply`, messages.reply, { type: 'image', backgroundColor: c })
  add(`st-${b}-reply`, messages.reply, { type: 'stories', backgroundColor: c })
}
add('img-dark-dialog', messages.dialog, { type: 'image', backgroundColor: bgs.dark })
add('img-dark-photo', messages['photo-caption'], { type: 'image', backgroundColor: bgs.dark })
add('img-light-sticker', messages.sticker, { type: 'image', backgroundColor: bgs.light })
add('st-dark-verylong', messages['very-long'], { type: 'stories', backgroundColor: bgs.dark })
add('st-light-dialog', messages.dialog, { type: 'stories', backgroundColor: bgs.light })
add('st-dark-short', messages['emoji-only'], { type: 'stories', backgroundColor: bgs.dark })
add('raw-dark-dialog', messages.dialog, { type: undefined, format: undefined, ext: undefined, backgroundColor: bgs.dark })

// Telegram accent colors: single (0, 3), two-color (8), three-color (15); the
// reply chip carries the replied sender's accent, 'bgemoji1' resolves to the
// sticker asset through the stubbed getCustomEmojiStickers (test-visual.js).
for (const id of [0, 3, 8, 15]) {
  const m = [base({
    from: { id: 1, first_name: 'Юрій', last_name: 'Ly', photo: { url: `${B}/ava1` }, accentColorId: id },
    text: 'Колір імені й смуги з профілю',
    replyMessage: { name: 'Олена Коваленко', text: 'А ти бачив новий реліз? Там стільки всього цікавого, аж не віриться', chatId: 5, accentColorId: id, backgroundEmojiId: 'bgemoji1' }
  })]
  for (const [theme, c] of [['dark', bgs.dark], ['light', bgs.light]]) {
    add(`acc-glass-${theme}-${id}`, m, { backgroundColor: c })
    add(`acc-classic-${theme}-${id}`, m, { backgroundColor: c, style: 'classic' })
  }
}
add('acc-glass-dark-8-thumb', [base({ from: { id: 1, name: 'Юрій', photo: { url: `${B}/ava1` }, accentColorId: 8 }, text: 'Гарне фото!', replyMessage: { name: 'Олена', text: 'Фото', chatId: 5, accentColorId: 8, media: { fileId: 'photoL' } } })], { backgroundColor: bgs.dark })
add('acc-glass-grad-15', [base({ from: { id: 1, name: 'Юрій', photo: { url: `${B}/ava1` }, accentColorId: 15 }, text: 'Градієнтний фон', replyMessage: { name: 'Олена', text: 'Коротко', chatId: 5, accentColorId: 15 } })], { backgroundColor: bgs.grad })

// Rich Messages (rich.js): rich-* cases.
require('./rich-cases')(add, { base, B, bgs })

module.exports = { cases, assets }
