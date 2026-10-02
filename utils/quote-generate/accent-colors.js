// utils/quote-generate/accent-colors.js
//
// Telegram profile accent colors (Bot API `accent_color_id`).
//   0–6    single colors: red, orange, violet, green, cyan, blue, pink
//   7–13   two-color (striped) variants of the same 7 hues
//   14–20  three-color variants
//
// Telegram ships ids 0–6 as built-in defaults and 7–20 through
// `help.peerColors` (the server owns the exact values and may revise them).
// Single colors follow the tdesktop/iOS defaults; the dark single colors are
// the ones this renderer already used. The 7–20 sets are close approximations
// of the published palettes — not byte-verified against a live
// `help.peerColors` response.
//
// Each entry: [main, 2nd, 3rd] — `main` is the name color, the rest are the
// reply-line stripe colors. Unknown ids resolve to null → legacy id % 7 colors.

const LIGHT = {
  0: ['#cc5049'], 1: ['#d67722'], 2: ['#955cdb'], 3: ['#40a920'], 4: ['#309eba'], 5: ['#368ad1'], 6: ['#c7508b'],
  7: ['#e15052', '#f9ae63'], 8: ['#e0802b', '#fac534'], 9: ['#a05ff3', '#f48fff'],
  10: ['#27a910', '#a7dc57'], 11: ['#27acce', '#82e8d6'], 12: ['#3391d4', '#7dd3f0'], 13: ['#dd4371', '#ffbe9f'],
  14: ['#247bed', '#f04856', '#ffffff'], 15: ['#d67722', '#1ea011', '#ffffff'], 16: ['#179e42', '#e84a3f', '#ffffff'],
  17: ['#2894af', '#6fc456', '#ffffff'], 18: ['#0c9ab3', '#ffad95', '#ffe6b5'], 19: ['#7757d6', '#f79610', '#ffde8e'],
  20: ['#1585cf', '#f2ab1d', '#ffffff']
}

const DARK = {
  0: ['#ff8e86'], 1: ['#ffa357'], 2: ['#b18fff'], 3: ['#4dd6bf'], 4: ['#45e8d1'], 5: ['#7ac9ff'], 6: ['#ff7fd5'],
  7: ['#ff9380', '#992f37'], 8: ['#ecb04e', '#c66a2c'], 9: ['#d0a2f7', '#6d3fc6'],
  10: ['#a7eb6e', '#167c2f'], 11: ['#40d8d0', '#045c7f'], 12: ['#52bfff', '#0b5494'], 13: ['#ff86a6', '#8e366e'],
  14: ['#3fa2fe', '#e5424f', '#ffffff'], 15: ['#ff905e', '#32a527', '#ffffff'], 16: ['#66d364', '#d5444f', '#ffffff'],
  17: ['#22bce2', '#3da240', '#ffffff'], 18: ['#22bce2', '#ff6b9d', '#ffe6b5'], 19: ['#9791ff', '#f2731d', '#ffdb59'],
  20: ['#3d9bee', '#dba51d', '#ffffff']
}

// → ['#main', '#2nd'?, '#3rd'?] for the bubble theme, or null when the id is
// absent / not a known accent id (the caller keeps its legacy color).
function resolveAccent (id, isLight) {
  if (typeof id !== 'number' || !Number.isInteger(id)) return null
  const set = (isLight ? LIGHT : DARK)[id]
  if (!set) return null
  // A white stripe segment vanishes on a light bubble and reads as a broken
  // line — drop it there; the stripe keeps the remaining colors' rhythm.
  return isLight ? set.filter((c, i) => i === 0 || luminance(c) < 0.9) : set.slice()
}

function luminance (hex) {
  const n = parseInt(hex.slice(1), 16)
  return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255
}

module.exports = { resolveAccent, LIGHT, DARK }
