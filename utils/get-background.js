const colorLuminance = require('./color-liminance')
const { createCanvas } = require('canvas')

const normalizeColor = (color) => {
  const canvas = createCanvas(0, 0)
  const canvasCtx = canvas.getContext('2d')

  canvasCtx.fillStyle = color
  color = canvasCtx.fillStyle

  return color
}

module.exports = (backgroundColor) => {
  let backgroundColorOne, backgroundColorTwo
  const backgroundColorSplit = backgroundColor.split('/')

  // TODO effect colors with CSS
  if (backgroundColorSplit && backgroundColorSplit.length > 1 && backgroundColorSplit[0] !== '') {
    backgroundColorOne = normalizeColor(backgroundColorSplit[0])
    backgroundColorTwo = normalizeColor(backgroundColorSplit[1])
  } else if (backgroundColor.startsWith('//')) {
    backgroundColor = normalizeColor(backgroundColor.replace('//', ''))
    backgroundColorOne = colorLuminance(backgroundColor, 0.35)
    backgroundColorTwo = colorLuminance(backgroundColor, -0.15)
  } else {
    backgroundColor = normalizeColor(backgroundColor)
    backgroundColorOne = backgroundColor
    backgroundColorTwo = backgroundColor
  }

  return { backgroundColor, backgroundColorOne, backgroundColorTwo }
}
