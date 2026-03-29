const path = require('path')
const fs = require('fs')
const loadImageFromUrl = require('./image-load-url')
const promiseAllStepN = require('./promise-concurrent')
const emojiDb = require('./emoji-db')

const emojiJFilesDir = '../assets/emoji/'

const brandFoledIds = {
  apple: 325,
  google: 313,
  twitter: 322,
  joypixels: 340,
  blob: 56
}

const emojiJsonByBrand = {
  apple: 'emoji-apple-image.json',
  google: 'emoji-google-image.json',
  twitter: 'emoji-twitter-image.json',
  joypixels: 'emoji-joypixels-image.json',
  blob: 'emoji-blob-image.json'
}

// Lazy-loaded emoji data — only apple is loaded eagerly (default brand)
const emojiImageByBrand = {}

function loadBrand (brand) {
  if (emojiImageByBrand[brand]) return emojiImageByBrand[brand]

  const jsonFile = emojiJsonByBrand[brand]
  if (!jsonFile) return []

  const filePath = path.resolve(__dirname, emojiJFilesDir + jsonFile)

  try {
    if (fs.existsSync(filePath)) {
      emojiImageByBrand[brand] = require(filePath)
    } else {
      emojiImageByBrand[brand] = []
    }
  } catch (error) {
    console.error('Failed to load emoji brand', brand, error.message)
    emojiImageByBrand[brand] = []
  }

  return emojiImageByBrand[brand]
}

// Eager-load apple (default brand) at startup
loadBrand('apple')

async function downloadEmoji (brand) {
  console.log('emoji image load start')

  const emojiImage = loadBrand(brand)

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
}

module.exports = { loadBrand, brands: emojiJsonByBrand }
