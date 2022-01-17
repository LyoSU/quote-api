const path = require('path')
const fs = require('fs')
const loadImageFromUrl = require('./image-load-url')
const EmojiDbLib = require('emoji-db')
const promiseAllStepN = require('./promise-concurrent')

const emojiDb = new EmojiDbLib({ useDefaultDb: true })

const emojiJFilesDir = '../assets/emoji/'

const brandFoledIds = {
  apple: 285,
  google: 313,
  twitter: 282,
  joypixels: 291,
  blob: 56
}

const emojiJsonByBrand = {
  apple: 'emoji-apple-image.json',
  google: 'emoji-google-image.json',
  twitter: 'emoji-twitter-image.json',
  joypixels: 'emoji-joypixels-image.json',
  blob: 'emoji-blob-image.json'
}

let emojiImageByBrand = {
  apple: [],
  google: [],
  twitter: [],
  joypixels: [],
  blob: []
}

for (const brand in emojiJsonByBrand) {
  const emojiJsonFile = path.resolve(
    __dirname,
    emojiJFilesDir + emojiJsonByBrand[brand]
  )

  try {
    if (fs.existsSync(emojiJsonFile)) emojiImageByBrand[brand] = require(emojiJsonFile)
  } catch (error) {
    console.log(error)
  }
  if (brand === 'blob') downloadEmoji(brand)
}

async function downloadEmoji (brand) {
  console.log('emoji image load start')

  const emojiImage = emojiImageByBrand[brand]

  const emojiJsonFile = path.resolve(
    __dirname,
    emojiJFilesDir + emojiJsonByBrand[brand]
  )

  const dbData = emojiDb.dbData
  const dbArray = Object.keys(dbData)
  const emojiPromiseArray = []

  for (const key of dbArray) {
    const emoji = dbData[key]

    if (!emoji.qualified && !emojiImage[key]) {
      emojiPromiseArray.push(async () => {
        let brandFolderName = brand
        if (brand === 'blob') brandFolderName = 'google'

        const fileUrl = `${process.env.EMOJI_DOMAIN}/thumbs/60/${brandFolderName}/${brandFoledIds[brand]}/${emoji.image.file_name}`

        const img = await loadImageFromUrl(fileUrl, (headers) => {
          return !headers['content-type'].match(/image/)
        })

        const base64 = img.toString('base64')

        if (base64) {
          return {
            key,
            base64
          }
        }
      })
    }
  }

  const donwloadResult = await promiseAllStepN(200)(emojiPromiseArray)

  for (const emojiData of donwloadResult) {
    if (emojiData) emojiImage[emojiData.key] = emojiData.base64
  }

  if (Object.keys(emojiImage).length > 0) {
    const emojiJson = JSON.stringify(emojiImage, null, 2)

    fs.writeFile(emojiJsonFile, emojiJson, (err) => {
      if (err) return console.log(err)
    })
  }

  console.log('emoji image load end')

  // const emojiDataDir = 'assets/emojis/'

  // Object.keys(dbData).map(async (key) => {
  //   const emoji = dbData[key]

  //   if (emoji.image) {
  //     const fileName = `${emoji.code}.png`
  //     if (!fs.existsSync(`${emojiDataDir}${fileName}`)) {
  //       const fileUrl = `${process.env.EMOJI_DOMAIN}/thumbs/60/${emoji.image.brand}/${emoji.image.folder_id}/${emoji.image.file_name}`

  //       const img = await loadImageFromUrl(fileUrl)

  //       fs.writeFile(`${emojiDataDir}${fileName}`, img, (err) => {
  //         if (err) return console.log(err)
  //       })
  //     }
  //   }
  // })
}

module.exports = emojiImageByBrand
