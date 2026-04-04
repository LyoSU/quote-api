const path = require('path')
const fs = require('fs')
const emojiDb = require('./emoji-db')

const emojiJFilesDir = '../assets/emoji/'

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
  if (!jsonFile) return {}

  const filePath = path.resolve(__dirname, emojiJFilesDir + jsonFile)

  try {
    if (fs.existsSync(filePath)) {
      emojiImageByBrand[brand] = require(filePath)
    } else {
      emojiImageByBrand[brand] = {}
    }
  } catch (error) {
    console.error('Failed to load emoji brand', brand, error.message)
    emojiImageByBrand[brand] = {}
  }

  return emojiImageByBrand[brand]
}

// Eager-load apple (default brand) at startup
loadBrand('apple')

module.exports = { loadBrand, brands: emojiJsonByBrand }
