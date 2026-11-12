const NAME_COLORS_LIGHT = [
  '#FC5C51', '#FA790F', '#895DD5', '#0FB297', '#0FC9D6', '#3CA5EC', '#D54FAF'
]

const NAME_COLORS_DARK = [
  '#FF8E86', '#FFA357', '#B18FFF', '#4DD6BF', '#45E8D1', '#7AC9FF', '#FF7FD5'
]

const AVATAR_COLORS = [
  ['#FF885E', '#FF516A'], ['#FFCD6A', '#FFA85C'], ['#E0A2F3', '#D669ED'],
  ['#A0DE7E', '#54CB68'], ['#53EDD6', '#28C9B7'], ['#72D5FD', '#2A9EF1'],
  ['#FFA8A8', '#FF719A']
]

const BREAK_REGEX = /<br>|\n|\r/
const SPACE_REGEX = /[\f\n\r\t\v\u0020\u1680\u2000-\u200a\u2028\u2029\u205f\u3000]/
const CJK_REGEX = /[\u1100-\u11ff\u2e80-\u2eff\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u3100-\u312f\u3130-\u318f\u3190-\u319f\u31a0-\u31bf\u31c0-\u31ef\u31f0-\u31ff\u3200-\u32ff\u3300-\u33ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]/
const RTL_REGEX = /[\u0591-\u07FF\u200F\u202B\u202E\uFB1D-\uFDFD\uFE70-\uFEFC]/
// Strong left-to-right text: any letter that is not a strong RTL one. (The old
// NEUTRAL_REGEX had `\u1F300-\u1F5FF` without the `u` flag — that parses as
// the range `0-\u1F5F`, so Latin and Cyrillic counted as "neutral" and one
// RTL word anywhere in a message flipped every line.)
const LTR_STRONG_REGEX = /\p{L}/u
// Digits and number punctuation only (weak: follows the surrounding run).
const NUMBER_REGEX = /^[\d\u0660-\u0669\u06F0-\u06F9][\d\u0660-\u0669\u06F0-\u06F9.,:%/+\-\u066B\u066C]*$/
// Scripts written without spaces (Thai, Lao, Myanmar, Khmer): lines may break
// between the dictionary words Intl.Segmenter returns.
const SEA_REGEX = /[\u0E00-\u0EFF\u1000-\u109F\u1780-\u17FF]/

const ENTITY_TYPES_MONOSPACE = ['pre', 'code', 'pre_code']
const ENTITY_TYPES_MENTION = ['mention', 'text_mention', 'hashtag', 'email', 'phone_number', 'bot_command', 'url', 'text_link']

// Consistent emoji scale factor for both measurement and drawing
const EMOJI_SCALE = 1.15

// Punctuation that sticks to the preceding text segment (never starts a new line)
const LEFT_STICKY_PUNCTUATION = new Set([
  '.', ',', '!', '?', ':', ';', ')', ']', '}', '%', '"', "'",
  '\u2019', // right single quote '
  '\u201D', // right double quote "
  '\u2026', // ellipsis …
  '\u3001', // ideographic comma 、
  '\u3002', // ideographic period 。
  '\uFF0C', // fullwidth comma ，
  '\uFF0E', // fullwidth period ．
  '\uFF01', // fullwidth exclamation ！
  '\uFF09', // fullwidth right paren ）
  '\uFF3D', // fullwidth right bracket ］
  '\uFF1A', // fullwidth colon ：
  '\uFF1B', // fullwidth semicolon ；
  '\uFF1F', // fullwidth question ？
  '\u300D', '\u300F', '\u3011', '\u300B', '\u3009' // closing CJK brackets
])

// Kinsoku Shori: characters prohibited at line start (closing marks, prolonged sound)
const KINSOKU_START = new Set([
  '\u3001', '\u3002', '\uFF0C', '\uFF0E',
  '\u3005',
  '\u3009', '\u300B', '\u300D', '\u300F', '\u3011',
  '\u301F',
  '\u30FC',
  '\u30FD', '\u30FE',
  '\u309D', '\u309E',
  '\uFF09', '\uFF3D', '\uFF5D',
  '\uFF01', '\uFF1F'
])

// Kinsoku Shori: characters prohibited at line end (opening marks)
const KINSOKU_END = new Set([
  '\u3008', '\u300A', '\u300C', '\u300E', '\u3010',
  '\u301D',
  '\uFF08', '\uFF3B', '\uFF5B',
  '\u2018', '\u201C'
])

// Arabic-script text (Arabic, Persian, Urdu, …) is set in Vazirmatn — the
// typeface Telegram itself uses for it — instead of the Noto fallback. The
// choice is per text run, by content: Vazirmatn also carries Latin glyphs, so
// listing it as a fallback family would restyle Latin wherever the primary
// family is resolved by fontconfig rather than registered from a file.
const ARABIC_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/
const FONT_FAMILY = 'NotoSans'
const FONT_FAMILY_ARABIC = 'Vazirmatn'
const fontFamily = (text) => ARABIC_REGEX.test(text) ? FONT_FAMILY_ARABIC : FONT_FAMILY

module.exports = {
  ARABIC_REGEX: ARABIC_REGEX,
  fontFamily: fontFamily,
  NAME_COLORS_LIGHT: NAME_COLORS_LIGHT,
  NAME_COLORS_DARK: NAME_COLORS_DARK,
  AVATAR_COLORS: AVATAR_COLORS,
  BREAK_REGEX: BREAK_REGEX,
  SPACE_REGEX: SPACE_REGEX,
  CJK_REGEX: CJK_REGEX,
  RTL_REGEX: RTL_REGEX,
  LTR_STRONG_REGEX: LTR_STRONG_REGEX,
  NUMBER_REGEX: NUMBER_REGEX,
  SEA_REGEX: SEA_REGEX,
  ENTITY_TYPES_MONOSPACE: ENTITY_TYPES_MONOSPACE,
  ENTITY_TYPES_MENTION: ENTITY_TYPES_MENTION,
  EMOJI_SCALE: EMOJI_SCALE,
  LEFT_STICKY_PUNCTUATION: LEFT_STICKY_PUNCTUATION,
  KINSOKU_START: KINSOKU_START,
  KINSOKU_END: KINSOKU_END
}
