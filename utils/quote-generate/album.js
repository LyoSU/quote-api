// utils/quote-generate/album.js
//
// Telegram-style album mosaic: several photos/videos in one block, separated
// by a thin gap. The result is a single canvas sized in destination pixels
// (the composer treats it as one piece of media and rounds its OUTER corners
// with the bubble's concentric radius — here only the inner corners are
// rounded, and only slightly).

const { createCanvas } = require('canvas')
const { paintMediaBadges, formatDuration } = require('./attachments')
const { applySpoiler } = require('./spoiler')

const MAX_ITEMS = 10

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// Aspect ratios (w/h) are clamped for layout; tiles crop (cover) the rest.
const layoutRatio = (r) => clamp(r, 0.6, 2)

// Packs `ratios` into the box W × maxH. Returns { w, h, tiles: [{ x, y, w, h }] }
// (integer px, tiles tile the box exactly, `gap` between neighbours).
function layoutAlbum (ratios, W, maxH, gap) {
  const n = ratios.length
  W = Math.round(W)
  maxH = Math.round(maxH)
  if (n === 0) return { w: W, h: 0, tiles: [] }

  if (n === 1) {
    const r = clamp(ratios[0], 0.25, 4)
    let w = W
    let h = W / r
    if (h > maxH) { h = maxH; w = h * r }
    return { w: Math.round(w), h: Math.round(h), tiles: [{ x: 0, y: 0, w: Math.round(w), h: Math.round(h) }] }
  }

  const r = ratios.map(layoutRatio)
  let rows // [{ h, cells: [{ i, w }] }] — heights/widths are real numbers

  if (n <= 4 && r[0] < 0.95 && r.slice(1).every((v) => v < 1.6) && n >= 3) {
    // Tall first photo on the left, the rest stacked on the right.
    const H = Math.min(maxH, W * 0.95)
    const wl = clamp(r[0] * H, W * 0.5, W * 0.62)
    const wr = W - wl - gap
    const m = n - 1
    const th = (H - gap * (m - 1)) / m
    return finish({
      w: W,
      h: H,
      tiles: [
        { x: 0, y: 0, w: wl, h: H },
        ...Array.from({ length: m }, (_, j) => ({ x: wl + gap, y: j * (th + gap), w: wr, h: th }))
      ]
    })
  }

  if (n === 3 && r[0] >= 1.2) {
    // Wide first photo on top, the other two side by side below.
    const h1 = Math.min(W / r[0], W * 0.55)
    const h2 = Math.min((W - gap) / (r[1] + r[2]), maxH - h1 - gap)
    const w2 = (W - gap) * r[1] / (r[1] + r[2])
    return finish({
      w: W,
      h: h1 + gap + h2,
      tiles: [{ x: 0, y: 0, w: W, h: h1 }, { x: 0, y: h1 + gap, w: w2, h: h2 }, { x: w2 + gap, y: h1 + gap, w: W - w2 - gap, h: h2 }]
    })
  }

  if (n === 2 && r[0] > 1.4 && r[1] > 1.4) {
    rows = [[0], [1]]
  } else if (n === 2) {
    rows = [[0, 1]]
  } else {
    rows = bestRows(r, W, maxH, gap)
  }

  // Justified rows: each row fills the width, its height follows from the ratios.
  const built = rows.map((idx) => ({
    idx,
    h: (W - gap * (idx.length - 1)) / idx.reduce((s, i) => s + r[i], 0)
  }))
  let total = built.reduce((s, b) => s + b.h, 0) + gap * (built.length - 1)
  if (total > maxH) { // too tall: squash rows evenly (tiles crop a bit)
    const k = (maxH - gap * (built.length - 1)) / (total - gap * (built.length - 1))
    built.forEach((b) => { b.h *= k })
    total = maxH
  }
  const tiles = []
  let y = 0
  for (const b of built) {
    const sum = b.idx.reduce((s, i) => s + r[i], 0)
    let x = 0
    for (const i of b.idx) {
      const w = (W - gap * (b.idx.length - 1)) * r[i] / sum
      tiles[i] = { x, y, w, h: b.h }
      x += w + gap
    }
    y += b.h + gap
  }
  return finish({ w: W, h: total, tiles })

  // Snap to whole pixels without opening seams: edges are rounded, sizes derived.
  function finish (box) {
    const H = Math.round(box.h)
    const tilesOut = box.tiles.map((t) => {
      const x0 = Math.round(t.x)
      const y0 = Math.round(t.y)
      const x1 = Math.min(W, Math.round(t.x + t.w))
      const y1 = Math.min(H, Math.round(t.y + t.h))
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
    })
    return { w: W, h: H, tiles: tilesOut }
  }
}

// Best split of the items (in order) into consecutive rows: total height close
// to a target, rows of similar height, no sliver rows.
function bestRows (r, W, maxH, gap) {
  const n = r.length
  const target = Math.min(maxH, W * (0.55 + 0.05 * n))
  let best = null
  for (let mask = 0; mask < (1 << (n - 1)); mask++) {
    const rows = [[0]]
    for (let i = 1; i < n; i++) {
      if (mask & (1 << (i - 1))) rows.push([i])
      else rows[rows.length - 1].push(i)
    }
    if (rows.some((row) => row.length > 4)) continue
    const hs = rows.map((row) => (W - gap * (row.length - 1)) / row.reduce((s, i) => s + r[i], 0))
    const total = hs.reduce((s, v) => s + v, 0) + gap * (rows.length - 1)
    const mean = hs.reduce((s, v) => s + v, 0) / hs.length
    const dev = Math.sqrt(hs.reduce((s, v) => s + (v - mean) ** 2, 0) / hs.length)
    let cost = Math.abs(total - target) / W + 0.6 * dev / W
    if (total > maxH) cost += 0.5 * (total - maxH) / W
    if (hs.some((v) => v < W * 0.18)) cost += 2
    if (hs.some((v) => v > W * 0.75)) cost += 1
    if (!best || cost < best.cost) best = { cost, rows }
  }
  return best.rows
}

// Cover-fit draw of `img` into the tile; corner radii per corner.
function drawTile (ctx, img, t, radii) {
  const { tl, tr, br, bl } = radii
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(t.x + tl, t.y)
  ctx.arcTo(t.x + t.w, t.y, t.x + t.w, t.y + t.h, tr)
  ctx.arcTo(t.x + t.w, t.y + t.h, t.x, t.y + t.h, br)
  ctx.arcTo(t.x, t.y + t.h, t.x, t.y, bl)
  ctx.arcTo(t.x, t.y, t.x + t.w, t.y, tl)
  ctx.closePath()
  ctx.clip()
  const k = Math.max(t.w / img.width, t.h / img.height)
  const sw = t.w / k
  const sh = t.h / k
  const sx = (img.width - sw) / 2
  const sy = (img.height - sh) * 0.4 // faces sit high — crop a bit more off the bottom
  ctx.drawImage(img, sx, sy, sw, sh, t.x, t.y, t.w, t.h)
  ctx.restore()
}

/**
 * Downloads the album items concurrently and paints the mosaic.
 * `items`: [{ file_id | url, type: 'photo'|'video'|'animation', duration? }]
 * Items that fail to load are dropped; returns null when none loaded.
 */
async function drawAlbum (items, { maxWidth, scale, style, telegram, download, spoiler = false }) {
  const list = items.slice(0, MAX_ITEMS).filter((it) => it && (it.url || it.file_id))
  const loaded = await Promise.all(list.map(async (it) => {
    const isUrl = !!it.url
    const img = await download(isUrl ? it.url : it.file_id, maxWidth, isUrl ? 'url' : 'id', false, telegram)
      .catch(() => null)
    if (!img) return null
    // Hidden media: every tile is veiled before layout (ratios stay intact).
    return { img: spoiler ? await applySpoiler(img, scale).catch(() => null) : img, it }
  }))
  const ok = loaded.filter((o) => o && o.img)
  if (!ok.length) return null

  const gap = Math.max(1, Math.round(style.album.gap * scale))
  const inner = style.album.radius * scale
  const W = Math.round(maxWidth)
  const box = layoutAlbum(ok.map((o) => o.img.width / o.img.height), W, W, gap)

  const canvas = createCanvas(box.w, box.h)
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ok.forEach((o, i) => {
    const t = box.tiles[i]
    // Corners on the mosaic edge stay square (the bubble rounds them); inner ones get a small radius.
    const cap = (v) => Math.min(v, t.w / 2, t.h / 2)
    const left = t.x === 0
    const right = t.x + t.w >= box.w
    const top = t.y === 0
    const bottom = t.y + t.h >= box.h
    drawTile(ctx, o.img, t, {
      tl: left && top ? 0 : cap(inner),
      tr: right && top ? 0 : cap(inner),
      br: right && bottom ? 0 : cap(inner),
      bl: left && bottom ? 0 : cap(inner)
    })
    let badge = null
    if (o.it.type === 'video') badge = { play: true, label: o.it.duration != null ? formatDuration(o.it.duration) : null }
    else if (o.it.type === 'animation' || o.it.type === 'gif') badge = { label: 'GIF' }
    if (badge) paintMediaBadges(ctx, t.x, t.y, t.w, t.h, badge, scale, style)
  })
  return canvas
}

module.exports = { drawAlbum, layoutAlbum, MAX_ITEMS }
