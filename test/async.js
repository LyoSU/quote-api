const async = require('async')
const path = require('path')
const fs = require('fs')
const LoremIpsum = require('lorem-ipsum').LoremIpsum

require('dotenv').config({ path: './.env' })
require('../app')

const generate = require('../methods/generate')

const lorem = new LoremIpsum({
  sentencesPerParagraph: {
    max: 8,
    min: 1
  },
  wordsPerSentence: {
    max: 16,
    min: 4
  }
})

const nQuotes = parseInt(process.argv[2])
const nCallsLimit = parseInt(process.argv[3])

const queue = async.queue(
  (json, cb) => generate(json)
    .then(cb)
    .catch(console.error),
  nCallsLimit
)

for (let i = 0; i < nQuotes; i++) {
  const text = lorem.generateParagraphs(1)
  const username = lorem.generateWords(2)
  const avatar = 'https://telegra.ph/file/59952c903fdfb10b752b3.jpg'

  const json = {
    botToken: process.env.BOT_TOKEN,
    type: 'quote',
    format: 'png',
    backgroundColor: '#FFFFFF',
    width: 512,
    height: 768,
    scale: 2,
    messages: [
      {
        entities: [],
        avatar: true,
        from: {
          id: 1,
          name: username,
          photo: {
            url: avatar
          }
        },
        text: text,
        replyMessage: {}
      }
    ]
  }

  console.time(i)
  queue.push(json, res => {
    const buffer = Buffer.from(res.image, 'base64')
    fs.writeFile(
      path.resolve(`./test/${i}.png`), buffer,
      err => err && console.error(err)
    )
    console.timeLog(i)
  })
}
