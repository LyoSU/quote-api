const { Telegraf } = require('telegraf')

const botToken = process.env.BOT_TOKEN
const bot = new Telegraf(botToken)

module.exports = bot.telegram
