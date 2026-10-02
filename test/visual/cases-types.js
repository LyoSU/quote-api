// Visual fixtures for the special message types (cards.js): checklists,
// gifts, giveaways, stories and the forum topic header. Prefix `typ-`.
// Sticker file_ids are asset names — the stubbed getFileLink in
// test-visual.js serves them from the local fixture server; 'bgemoji*'
// custom emoji ids resolve to the `sticker` asset.

const assets = {
  // Regular gift: a wrapped box with a bow.
  giftBox: [512, 512, '<defs><linearGradient id="gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff6b8b"/><stop offset="1" stop-color="#d6265a"/></linearGradient></defs><rect x="96" y="220" width="320" height="230" rx="28" fill="url(#gb)"/><rect x="76" y="170" width="360" height="80" rx="22" fill="#ff8aa5"/><rect x="232" y="170" width="48" height="280" fill="#ffd66b"/><path d="M256 172 C200 90 120 110 150 160 C170 190 230 180 256 172 Z" fill="#ffd66b"/><path d="M256 172 C312 90 392 110 362 160 C342 190 282 180 256 172 Z" fill="#ffc23d"/>'],
  // Unique gift models.
  giftPepe: [512, 512, '<ellipse cx="256" cy="300" rx="170" ry="150" fill="#5fae4a"/><ellipse cx="256" cy="330" rx="120" ry="90" fill="#8fd16f"/><circle cx="190" cy="190" r="62" fill="#5fae4a"/><circle cx="322" cy="190" r="62" fill="#5fae4a"/><circle cx="190" cy="190" r="40" fill="#fff"/><circle cx="322" cy="190" r="40" fill="#fff"/><circle cx="198" cy="196" r="20" fill="#222"/><circle cx="314" cy="196" r="20" fill="#222"/><path d="M200 290 Q256 330 312 290" stroke="#b03a2e" stroke-width="14" fill="none" stroke-linecap="round"/>'],
  giftGem: [512, 512, '<defs><linearGradient id="gg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9f6ff"/><stop offset="1" stop-color="#6fc3ff"/></linearGradient></defs><polygon points="256,60 420,200 256,460 92,200" fill="url(#gg)"/><polygon points="256,60 330,200 256,460 182,200" fill="#bfe6ff" opacity=".8"/><polygon points="92,200 420,200 256,236" fill="#ffffff" opacity=".55"/>'],
  // Pattern symbols (shape only — tinted by symbol_color).
  giftCrown: [256, 256, '<path d="M28 196 L48 72 L100 136 L128 48 L156 136 L208 72 L228 196 Z" fill="#000"/><rect x="28" y="204" width="200" height="24" rx="8" fill="#000"/>'],
  giftStar: [256, 256, '<polygon points="128,16 160,96 246,100 178,154 202,238 128,190 54,238 78,154 10,100 96,96" fill="#000"/>']
}

module.exports = function typesCases ({ B, base, bgs }) {
  const ch = { id: -1001, name: 'Канал Новини', photo: { url: `${B}/ava2` } }

  const tasks = (texts, doneIdx) => texts.map((text, i) => ({ text, done: doneIdx.includes(i) }))
  const checklist = {
    title: 'Підготовка до релізу 🚀',
    tasks: [
      { text: 'Оновити залежності', done: true },
      { text: 'Прогнати візуальні тести на macOS і в Docker-образі', done: true },
      { text: 'Написати changelog', done: false, entities: [{ type: 'bold', offset: 9, length: 9 }] },
      { text: 'Задеплоїти на прод', done: false },
      { text: 'Анонс у каналі 📣', done: false }
    ],
    othersCanMarkDone: true,
    footer: 'Виконано 2 з 5'
  }
  const longChecklist = {
    title: 'Покупки на тиждень',
    tasks: tasks(['Молоко', 'Хліб', 'Яйця', 'Сир', 'Помідори', 'Огірки', 'Кава', 'Чай', 'Яблука', 'Банани', 'Рис', 'Гречка'], [0, 1, 4, 7, 10]),
    footer: 'Виконано 5 з 12'
  }
  const sticker = (id) => ({ file_id: `${id}-tgs`, is_animated: true, thumb: { file_id: id } })

  const gift = {
    kind: 'regular',
    title: 'Подарунок',
    sticker: sticker('giftBox'),
    starCount: 50,
    text: 'З днем народження! Нехай усе вдається 🎉',
    entities: [{ type: 'bold', offset: 0, length: 16 }]
  }
  const uniqueA = {
    kind: 'unique',
    name: 'Plush Pepe #1842',
    attributes: 'Cozy Frog · Midnight Blue · Crown',
    model: { name: 'Cozy Frog', sticker: sticker('giftPepe') },
    symbol: { name: 'Crown', sticker: sticker('giftCrown') },
    backdrop: { name: 'Midnight Blue', centerColor: '#5a7cf0', edgeColor: '#1d2b6b', symbolColor: '#0e1a4d', textColor: '#ffffff' }
  }
  const uniqueB = {
    kind: 'unique',
    name: 'Ion Gem #77',
    attributes: 'Prism · Rose Gold · Star',
    model: { name: 'Prism', sticker: { file_id: 'giftGem' } },
    symbol: { name: 'Star', sticker: { file_id: 'giftStar' } },
    backdrop: { name: 'Rose Gold', centerColor: 0xf2b2a0, edgeColor: 0xb05a64, symbolColor: 0x8a3846, textColor: 0xffffff }, // raw RGB24 ints are accepted too
    text: 'Тримай колекційний 💎'
  }
  const premium = {
    kind: 'giveaway',
    title: 'Розіграш',
    prize: '5× Telegram Premium · 3 місяці',
    meta: ['5 переможців · Підсумки 12 жовт. 2026 р.', 'Канал Новини, Дизайн UA, Tech Daily +2']
  }
  const stars = {
    kind: 'giveaway',
    title: 'Розіграш',
    prize: 'Набір стікерів від автора\n⭐ 10 000 зірок',
    meta: ['1 переможець · Підсумки 1 лист. 2026 р.', 'Канал Новини']
  }
  const winners = {
    kind: 'winners',
    title: 'Переможці розіграшу',
    prize: '5× Telegram Premium · 3 місяці',
    winners: 'Анна Коваль, Богдан, Віра Петренко +2',
    meta: ['5 переможців · Підсумки 12 жовт. 2026 р.']
  }

  const set = {
    checklist: [base({ text: 'Підготовка до релізу 🚀\n☑ Оновити залежності\n☐ …', checklist })],
    'checklist-long': [base({ text: 'fallback', checklist: longChecklist })],
    gift: [base({ text: '🎁 Подарунок · ⭐ 50\nЗ днем народження!', gift })],
    'gift-nocaption': [base({ text: '🎁 Подарунок · ⭐ 25', gift: { ...gift, text: undefined, entities: undefined, starCount: 25 } })],
    'unique-a': [base({ text: '🎁 Plush Pepe #1842', gift: uniqueA })],
    'unique-b': [base({ text: '🎁 Ion Gem #77', gift: uniqueB })],
    'giveaway-premium': [{ from: ch, avatar: true, chatId: -1001, text: '🎁 Розіграш', giveaway: premium }],
    'giveaway-stars': [{ from: ch, avatar: true, chatId: -1001, text: '🎁 Розіграш', giveaway: stars }],
    'giveaway-winners': [{ from: ch, avatar: true, chatId: -1001, text: '🏆', giveaway: winners }],
    'story-reply': [base({ text: 'Яка гарна історія!', replyMessage: { name: 'Канал Новини', text: 'Історія', chatId: -1001, media: { kind: 'story' } } })],
    'story-forward': [base({ forward: { label: 'Переслано від Канал Новини' }, text: '📖 Історія', mediaType: 'story', storyId: 7, story: { label: 'Історія', chatName: 'Канал Новини' } })],
    topic: [
      base({ topic: { name: 'Дизайн і UI', iconColor: '#6fb9f0' }, text: 'Новий макет уже у Figma', chatId: 1 }),
      base({ from: { id: 1, name: false, photo: { url: `${B}/ava1` } }, text: 'Гляньте, будь ласка', chatId: 1 })
    ],
    'topic-emoji-tag': [base({ topic: { name: 'Реліз 0.15 — дуже довга назва гілки обговорення, що не влазить', iconColor: '#ff93b2', iconEmojiId: 'bgemoji1' }, senderTag: 'адмін', senderTagRole: 'admin', text: 'Все готово до релізу' })]
  }

  const cases = []
  const add = (name, msgs, opts) => cases.push({ name: `typ-${name}`, messages: msgs, opts })
  const all4 = ['checklist', 'gift', 'unique-a', 'giveaway-premium', 'story-reply', 'topic']
  for (const [name, m] of Object.entries(set)) {
    const combos = all4.includes(name)
      ? [['glass', 'dark'], ['glass', 'light'], ['classic', 'dark'], ['classic', 'light']]
      : [['glass', 'dark'], ['classic', 'light']]
    for (const [style, theme] of combos) {
      add(`${style}-${theme}-${name}`, m, { backgroundColor: bgs[theme], ...(style === 'classic' ? { style } : {}) })
    }
  }
  return { cases, assets }
}
