const { createCanvas } = require('canvas')

function drawLineSegment (ctx, x, y, width, isEven) {
  ctx.lineWidth = 35
  ctx.strokeStyle = '#aec6cf'
  ctx.beginPath()
  y = isEven ? y : -y
  ctx.moveTo(x, 0)
  ctx.lineTo(x, y)
  ctx.arc(x + width / 2, y, width / 2, Math.PI, 0, isEven)
  ctx.lineTo(x + width, 0)
  ctx.stroke()
}

function drawWaveform (data) {
  const normalizedData = data.map(i => i / 32)
  const canvas = createCanvas(4500, 500)
  const padding = 50
  canvas.height = canvas.height + padding * 2
  const ctx = canvas.getContext('2d')
  ctx.translate(0, canvas.height / 2 + padding)
  const width = canvas.width / normalizedData.length
  for (let i = 0; i < normalizedData.length; i++) {
    const x = width * i
    let height = normalizedData[i] * canvas.height - padding
    if (height < 0) {
      height = 0
    } else if (height > canvas.height / 2) {
      height = canvas.height / 2
    }
    drawLineSegment(ctx, x, height, width, (i + 1) % 2)
  }
  return canvas
}

module.exports = { drawWaveform }
