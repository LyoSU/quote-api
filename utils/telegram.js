const { Telegraf } = require('telegraf')

const botToken = process.env.BOT_TOKEN

module.exports = new Telegraf(botToken)
