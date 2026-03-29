const { createCanvas } = require('canvas')

class ColorContrast {
  constructor () {
    this.brightnessThreshold = 175
  }

  getBrightness (color) {
    const [r, g, b] = hexToRgb(color)
    return (r * 299 + g * 587 + b * 114) / 1000
  }

  adjustBrightness (color, amount) {
    const [r, g, b] = hexToRgb(color)
    const newR = Math.max(0, Math.min(255, r + amount))
    const newG = Math.max(0, Math.min(255, g + amount))
    const newB = Math.max(0, Math.min(255, b + amount))
    return rgbToHex([newR, newG, newB])
  }

  getContrastRatio (background, foreground) {
    const brightness1 = this.getBrightness(background)
    const brightness2 = this.getBrightness(foreground)
    const lightest = Math.max(brightness1, brightness2)
    const darkest = Math.min(brightness1, brightness2)
    return (lightest + 0.05) / (darkest + 0.05)
  }

  adjustContrast (background, foreground) {
    const contrastRatio = this.getContrastRatio(background, foreground)
    const brightnessDiff = this.getBrightness(background) - this.getBrightness(foreground)
    if (contrastRatio >= 4.5) {
      return foreground
    } else if (brightnessDiff >= 0) {
      const amount = Math.ceil((this.brightnessThreshold - this.getBrightness(foreground)) / 2)
      return this.adjustBrightness(foreground, amount)
    } else {
      const amount = Math.ceil((this.getBrightness(foreground) - this.brightnessThreshold) / 2)
      return this.adjustBrightness(foreground, -amount)
    }
  }
}

function hexToRgb (hex) {
  hex = String(hex).replace(/^#/, '')
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
  }
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)
  return [r, g, b]
}

function rgbToHex ([r, g, b]) {
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

function normalizeColor (color) {
  const canvas = createCanvas(0, 0)
  const canvasCtx = canvas.getContext('2d')
  canvasCtx.fillStyle = color
  return canvasCtx.fillStyle
}

function colorLuminance (hex, lum) {
  hex = String(hex).replace(/[^0-9a-f]/gi, '')
  if (hex.length < 6) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
  }
  lum = lum || 0
  let rgb = '#'
  for (let i = 0; i < 3; i++) {
    let c = parseInt(hex.substr(i * 2, 2), 16)
    c = Math.round(Math.min(Math.max(0, c + (c * lum)), 255)).toString(16)
    rgb += ('00' + c).substr(c.length)
  }
  return rgb
}

function lightOrDark (color) {
  let r, g, b
  if (color.match(/^rgb/)) {
    color = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+(?:\.\d+)?))?\)$/)
    r = color[1]
    g = color[2]
    b = color[3]
  } else {
    color = +('0x' + color.slice(1).replace(color.length < 5 && /./g, '$&$&'))
    r = color >> 16
    g = color >> 8 & 255
    b = color & 255
  }
  const hsp = Math.sqrt(0.299 * (r * r) + 0.587 * (g * g) + 0.114 * (b * b))
  return hsp > 127.5 ? 'light' : 'dark'
}

function parseBackgroundColor (backgroundColor) {
  backgroundColor = backgroundColor || '//#292232'
  const split = backgroundColor.split('/')
  if (split.length > 1 && split[0] !== '') {
    return { colorOne: normalizeColor(split[0]), colorTwo: normalizeColor(split[1]) }
  } else if (backgroundColor.startsWith('//')) {
    const base = normalizeColor(backgroundColor.replace('//', ''))
    return { colorOne: colorLuminance(base, 0.35), colorTwo: colorLuminance(base, -0.15) }
  } else {
    const base = normalizeColor(backgroundColor)
    return { colorOne: base, colorTwo: base }
  }
}

module.exports = {
  ColorContrast, hexToRgb, rgbToHex, normalizeColor, colorLuminance, lightOrDark, parseBackgroundColor
}
