const axios = require('axios')
const path = require('path')
const fs = require('fs')
const { Telegraf } = require('telegraf')

require('dotenv').config({ path: './.env' })
require('../app')

const bot = new Telegraf(process.env.BOT_TOKEN)

bot.on('message', async ctx => {
  const message = JSON.parse(JSON.stringify(ctx.message))
  message.avatar = true
  message.media = message.photo || message.sticker || message.animation?.thumb || null
  if (message.media?.is_video) {
    message.media = message.media.thumb
  }

  await axios.post(
    `http://localhost:${process.env.PORT}/generate`,
    {
      type: 'image',
      format: 'png',
      messages: [message]
    },
    { headers: { 'Content-Type': 'application/json' } }
  ).then(async res => {
    fs.writeFileSync(
      path.resolve(__dirname, 'response.png'),
      Buffer.from(res.data.result.image, 'base64'),
      err => err && console.error(err)
    )

    await ctx.replyWithPhoto({ source: path.resolve(__dirname, 'response.png') })
  }).catch(console.error)

  await axios.post(
    `http://localhost:${process.env.PORT}/generate`,
    {
      type: 'html',
      format: 'html',
      messages: [message]
    },
    { headers: { 'Content-Type': 'application/json' } }
  ).then(async res => {
    fs.writeFileSync(
      path.resolve(__dirname, 'response.html'),
      Buffer.from(res.data.result.image, 'base64'),
      err => err && console.error(err)
    )
  }).catch(console.error)
})

bot.catch(console.error)
bot.launch()
