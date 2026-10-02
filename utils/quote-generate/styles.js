// utils/quote-generate/styles.js
//
// Quote style presets. A style is DATA — design tokens (logical px, scaled
// at use) plus a few flags — read by index.js and composer.js. There is no
// per-style code path: classic is glass with the effects switched off and a
// tighter, flatter rhythm.
//
// Flags:
//   tail         bubble tail on the avatar's side (only when an avatar is shown)
//   groupCorners same-sender neighbours flatten the corners facing each other
//   avatarAlign  'bottom' (glass, under the tail) | 'top' (classic, first of a run)
//   shadow       { color, blur, y } drop shadow, or null
//   glass        hairline + top-edge highlight width in px, 0 = flat fill
//   nameGradient accent gradient on the sender name (else solid color)
//   replyStyle   'block' tinted rounded accent block | 'line' thin bar, no tint
//
// Radii nest: an inner radius is the outer radius minus the inset between
// them (concentric corners), never a free-standing constant.

// Concentric corner: inner radius = outer − inset, never sharper than `min`.
const concentric = (outer, inset, min = 4) => Math.max(min, outer - inset)

const RADIUS = 25 // bubble corner radius
const INSET = { x: 16, y: 16 } // bubble edge → visible content
const BLOCK = { padX: 12, padY: 8 } // accent block: edge → text
const CHIP = 8 // sticker reply chip padding
const BLOCK_RADIUS = concentric(RADIUS, INSET.x) // block sits one inset inside the bubble

// Rich Message blocks (rich.js). Hierarchy comes from weight, color and
// spacing, not size: three text sizes only — body 24, small 19, micro 15.
// Alphas are relative to the theme text color. Gaps are between visible
// bounds, like `space`.
const RICH = {
  // Line measure: a rich message never runs wider than a long plain paragraph
  // does. Wider content (code, tables) would make the sticker downscale as a
  // whole and shrink every glyph in it.
  measure: 460,
  heading: [26, 24], // h1, h2+ (bold, text color)
  small: 19, // table cells, code, thinking
  gap: { para: 8, before: 16, after: 6, block: 12, item: 4, divider: 12 },
  hairline: { dark: 0.14, light: 0.12 }, // divider
  list: { indent: 20, maxDepth: 2, bullet: 0.85 },
  table: { pad: { x: 8, y: 6 }, compact: { x: 6, y: 3 }, fill: 0.05, head: 0.08, rule: 0.1, minCol: 44, maxCols: 4, maxRows: 6 },
  radius: BLOCK_RADIUS, // table / code / pill containers, concentric with the bubble
  code: { fill: 0.06, maxLines: 8 },
  pill: { fill: 0.06, padX: 12, padY: 8 }, // collapsed details / thinking
  pull: { mark: 48, alpha: 0.35 } // pull-quote “ size and alpha
}

const glass = {
  name: 'glass',
  // Spacing tokens, logical px on a 4px grid. Every one is measured between
  // VISIBLE bounds — text blocks end at the cap line (top) and the last
  // baseline (bottom, descenders hang), blocks/media/rows expose their ink —
  // so the same token always reads as the same distance.
  space: {
    inset: INSET, // bubble edge → visible content
    stackTight: 12, // text → text: name/forward label → message text (≈ a line of rhythm)
    stack: 12, // anything ↔ block: reply chip, quote, media, attachment row
    inline: 8, // side by side: name ↔ tag/via, icon ↔ label
    chip: CHIP // sticker reply chip padding
  },
  maxHeader: 300, // header/forward-label width cap — longer names fade out instead of inflating the bubble
  maxLines: 16, // message text is cut with "…" past this many lines — a sticker must stay readable
  radius: RADIUS,
  radiusGrouped: 7, // corner radius facing a same-sender neighbour bubble
  minRadius: 4, // floor of every concentric (inner) radius
  chipRadius: BLOCK_RADIUS + CHIP, // sticker reply chip wraps the block
  replyThumb: 40, // reply media thumbnail side
  shadowPad: 12, // canvas margin (right/bottom) so the drop shadow isn't clipped
  shadowPadTop: 4, // canvas margin above the bubble (shadow blur spills up a little)
  glass: 2, // frosted-glass hairline width (border + top edge highlight)
  tailSize: 14, // bubble tail size (when avatar is shown)
  minWidth: 100, // min bubble width
  avatar: 50, // avatar diameter
  avatarGap: 10, // avatar → bubble (off-grid: test-fixes pins the composed width)
  avatarTop: 0, // avatar drop from the bubble top (avatarAlign 'top')
  // Type scale, logical px. Main text is 24: reply ≈0.8×, name ≈0.83×, micro
  // text (tag, via, forward label, badges, row meta) never below 0.6×.
  fonts: { name: 20, replyName: 19, replyText: 19, micro: 15 },
  microAlpha: 0.65, // muted secondary text (row meta, member tag)
  // Accent block — the modern-Telegram rounded tinted block used for both
  // the reply preview and the partial-quote body: solid bar on the left,
  // accent tint behind, optional ❝ in the corner.
  block: {
    padY: BLOCK.padY,
    padL: BLOCK.padX,
    padR: BLOCK.padX,
    padRIcon: 32,
    bar: 4,
    icon: 16,
    iconInset: 4,
    radius: BLOCK_RADIUS,
    thumbRadius: concentric(BLOCK_RADIUS, BLOCK.padY), // thumb sits one block pad inside
    tint: 0.1,
    // Reply line for 2–3 color accents: alternating slanted segments
    // (logical px; a segment is `dash` long, `slant` is the diagonal shift).
    stripe: { dash: 6, slant: 4 },
    // Profile background emoji: faint tinted copies in the right part of the
    // chip (flag token). Positions: dx from the chip's right edge, dy as a
    // fraction of its height, size in logical px.
    emojiPattern: true,
    emojiAlpha: 0.14,
    emojiCells: [
      { dx: 14, dy: 0.28, size: 14 }, { dx: 36, dy: 0.72, size: 12 }, { dx: 40, dy: 0.18, size: 10 },
      { dx: 62, dy: 0.5, size: 13 }, { dx: 88, dy: 0.2, size: 9 }, { dx: 92, dy: 0.8, size: 10 },
      { dx: 120, dy: 0.5, size: 8 }
    ],
    gap: 8, // reply name → reply text
    thumbGap: 8
  },
  // Sender tag in the header: role pill (owner purple / admin green, tinted
  // 15%) or plain muted text (member). Colors per theme for contrast.
  tag: {
    padX: 8,
    padY: 4,
    tint: 0.15,
    colors: {
      owner: { dark: '#b08cf0', light: '#6d3fc0' },
      admin: { dark: '#6fcb6d', light: '#2c8a36' }
    }
  },
  // In-bubble attachment rows (voice, document, audio) and media badges.
  row: {
    disc: 44, // play/file/cover disc side
    gap: 12, // disc → texts/waveform
    title: 18, // first line (file name, track title)
    lineGap: 8, // title baseline → meta cap line
    bar: 3, // waveform bar width
    barGap: 2, // waveform bar pitch gap
    barMin: 4, // shortest bar
    barMax: 28, // tallest bar
    cover: BLOCK_RADIUS // audio cover corner radius
  },
  album: { gap: 2, radius: 4 }, // mosaic: tile gap, inner (tile-to-tile) corner radius
  badge: { padX: 8, padY: 4, bg: 0.62, inset: 8, play: 48 }, // media overlay chips on a solid dark pill
  tail: true,
  groupCorners: true,
  avatarAlign: 'bottom',
  shadow: { color: 'rgba(0, 0, 0, 0.24)', blur: 6, y: 2 },
  nameGradient: true,
  replyStyle: 'block',
  rich: RICH
}

// The pre-redesign look: avatar at the top, flat solid bubble with uniform
// corners, no shadow/glass, solid-color name, reply as a thin accent line.
// Canvas margins stay identical to glass so stacking math is shared.
const classic = {
  ...glass,
  name: 'classic',
  minWidth: 0,
  avatarTop: 4,
  fonts: { name: 22, replyName: 20, replyText: 20, micro: 15 },
  block: { ...glass.block, padY: 4, padR: 4, radius: 0, tint: 0, gap: 8, emojiPattern: false },
  glass: 0,
  tail: false,
  groupCorners: false,
  avatarAlign: 'top',
  shadow: null,
  nameGradient: false,
  replyStyle: 'line',
  rich: { ...RICH, radius: 4 } // flat look: containers stay near-square, like the line reply
}

const STYLES = { glass, classic }

// Unknown / missing name → glass.
function getStyle (name) {
  return Object.prototype.hasOwnProperty.call(STYLES, name) ? STYLES[name] : glass
}

module.exports = { STYLES, getStyle, glass, classic, concentric }
