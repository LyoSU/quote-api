// Rich Message (Bot API 10.1+) fixtures for the visual test — `message.rich`
// in the normalized shape the bot sends (quote-bot rich-types.ts). `text` is
// the bot's flattened fallback; the renderer ignores it when rich renders.

const b = (text, extra = {}) => ({ text, ...extra })
const boldAll = (text) => [{ type: 'bold', offset: 0, length: text.length }]

const ai = {
  blocks: [
    { type: 'heading', level: 1, text: 'Як зварити ідеальну каву' },
    b('Коротко: свіже зерно, правильний помел і вода ~93 °C. Решта — дрібниці.', { type: 'paragraph', entities: [{ type: 'bold', offset: 9, length: 11 }] }),
    { type: 'heading', level: 2, text: 'Що знадобиться' },
    {
      type: 'list',
      ordered: false,
      items: [
        { text: 'Зерно обсмаження до 4 тижнів', depth: 0 },
        { text: 'Ваги з точністю 0,1 г — без них усе навмання і результат щоразу інший', depth: 0 },
        { text: 'Кавомолка з жорнами', depth: 1 },
        { text: 'Фільтр і пуровер', depth: 0, entities: [{ type: 'code', offset: 9, length: 7 }] }
      ]
    },
    { type: 'pre', language: 'js', text: 'const ratio = 1 / 16\nconst water = coffee / ratio' },
    b('Смачного! ☕', { type: 'paragraph' })
  ]
}

const steps = {
  blocks: [
    { type: 'heading', level: 2, text: 'Кроки' },
    {
      type: 'list',
      ordered: true,
      items: [
        { text: 'Прогрій чайник', depth: 0, marker: '1.' },
        { text: 'Змели 15 г зерна', depth: 0, marker: '2.' },
        { text: 'Залий 250 мл води', depth: 0, marker: '9.' },
        { text: 'Чекай 3 хвилини і не поспішай', depth: 0, marker: '10.' }
      ]
    },
    {
      type: 'list',
      ordered: false,
      items: [
        { text: 'Купити зерно', depth: 0, check: true },
        { text: 'Помити пуровер', depth: 0, check: false }
      ]
    }
  ]
}

const table = {
  blocks: [
    b('Порівняння тарифів:', { type: 'paragraph' }),
    {
      type: 'table',
      rows: [
        [{ text: 'Тариф', header: true }, { text: 'Ціна', header: true }, { text: 'Ліміт', header: true }],
        [{ text: 'Free' }, { text: '0 ₴' }, { text: '10 запитів' }],
        [{ text: 'Pro', entities: boldAll('Pro') }, { text: '199 ₴' }, { text: 'Без обмежень і з пріоритетом у черзі' }],
        [{ text: 'Team' }, { text: '899 ₴' }, { text: '5 місць' }]
      ],
      caption: { text: 'Ціни за місяць' }
    }
  ]
}

const tableCompact = {
  blocks: [
    {
      type: 'table',
      compact: true,
      rows: [
        [{ text: 'Місто', header: true }, { text: '°C', header: true }, { text: 'Вітер', header: true }, { text: 'Опади', header: true }, { text: 'Тиск', header: true }],
        ...[['Київ', '18', '4 м/с', '10%', '750'], ['Львів', '15', '6 м/с', '40%', '742'], ['Одеса', '22', '8 м/с', '0%', '761'],
          ['Харків', '17', '3 м/с', '5%', '748'], ['Дніпро', '19', '5 м/с', '0%', '752'], ['Ужгород', '20', '2 м/с', '15%', '744'],
          ['Чернігів', '16', '4 м/с', '20%', '749'], ['Суми', '15', '5 м/с', '30%', '746']].map((r) => r.map((t) => ({ text: t })))
      ]
    }
  ]
}

const quote = {
  blocks: [
    b('Улюблена думка з книжки:', { type: 'paragraph' }),
    { type: 'quote', text: 'Простота — це найвища форма витонченості.', credit: { text: 'Леонардо да Вінчі' } },
    { type: 'divider' },
    { type: 'quote', pull: true, text: 'Менше, але краще' },
    { type: 'footer', text: 'Надіслано з бота-асистента' }
  ]
}

const thinking = {
  blocks: [
    { type: 'thinking', text: 'Думаю…' },
    b('Ось що я знайшов про погоду на вихідні.', { type: 'paragraph' }),
    { type: 'details', text: 'Джерела та методика' },
    { type: 'math', text: 'E = mc^2' },
    { type: 'label', text: '📍 Київ, Хрещатик' }
  ]
}

const long = {
  blocks: [
    { type: 'heading', level: 1, text: 'Звіт за тиждень' },
    ...Array.from({ length: 4 }, (_, i) => b(`Абзац ${i + 1}: команда закрила кілька задач, оновила документацію і провела дві зустрічі з клієнтами.`, { type: 'paragraph' })),
    { type: 'heading', level: 2, text: 'Далі' },
    { type: 'list', ordered: false, items: Array.from({ length: 8 }, (_, i) => ({ text: `Пункт ${i + 1} зі списку задач`, depth: 0 })) }
  ]
}

const photo = {
  blocks: [
    { type: 'heading', level: 2, text: 'Гори взимку' },
    b('Найкращий час для фото — світанок, коли сонце тільки сходить.', { type: 'paragraph' })
  ]
}

const rtl = {
  rtl: true,
  blocks: [
    { type: 'heading', level: 2, text: 'מתכון קצר' },
    { type: 'list', ordered: true, items: [{ text: 'לחמם מים', depth: 0, marker: '1.' }, { text: 'לטחון קפה טרי', depth: 0, marker: '2.' }] },
    { type: 'quote', text: 'פשוט וטעים' }
  ]
}

module.exports = function addRichCases (add, { base, B, bgs }) {
  const m = (rich, extra = {}) => [base({ text: 'fallback', rich, ...extra })]
  const both = (name, msgs) => {
    add(`rich-glass-dark-${name}`, msgs, { backgroundColor: bgs.dark })
    add(`rich-classic-light-${name}`, msgs, { backgroundColor: bgs.light, style: 'classic' })
  }
  both('ai', m(ai))
  both('steps', m(steps))
  both('table', m(table))
  both('table-compact', m(tableCompact))
  both('quote', m(quote))
  both('thinking', m(thinking))
  both('long', m(long))
  both('photo', m(photo, { media: { url: `${B}/photoL` }, mediaType: 'photo' }))
  add('rich-glass-light-ai', m(ai), { backgroundColor: bgs.light })
  add('rich-glass-light-table', m(table), { backgroundColor: bgs.light })
  add('rich-classic-dark-ai', m(ai), { backgroundColor: bgs.dark, style: 'classic' })
  add('rich-glass-dark-rtl', m(rtl), { backgroundColor: bgs.dark })
  add('rich-glass-dark-album', m(photo, { album: ['photoL', 'photoP', 'photoS'].map((id) => ({ url: `${B}/${id}`, type: 'photo' })) }), { backgroundColor: bgs.dark })
}
