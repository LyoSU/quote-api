#!/usr/bin/env node

/**
 * Downloads emoji images from emoji-datasource CDN (jsdelivr) and saves them
 * as base64 JSON files for each brand.
 *
 * Supported brands via emoji-datasource: apple, google, twitter
 * Unsupported (kept as-is): joypixels, blob
 *
 * Usage:
 *   node scripts/update-emoji.js              # update all supported brands
 *   node scripts/update-emoji.js apple         # update only apple
 *   node scripts/update-emoji.js google twitter # update specific brands
 */

const path = require('path')
const fs = require('fs')
const https = require('https')

const EmojiDbLib = require('emoji-db')
const emojiDb = new EmojiDbLib({ useDefaultDb: true })

const EMOJI_DIR = path.resolve(__dirname, '../assets/emoji/')

const CDN_VERSION = '16.0.0'
const CDN_SIZE = 64 // px
const CONCURRENCY = 50

const SUPPORTED_BRANDS = {
  apple: {
    pkg: 'emoji-datasource-apple',
    folder: 'apple'
  },
  google: {
    pkg: 'emoji-datasource-google',
    folder: 'google'
  },
  twitter: {
    pkg: 'emoji-datasource-twitter',
    folder: 'twitter'
  }
}

const BRAND_JSON_FILES = {
  apple: 'emoji-apple-image.json',
  google: 'emoji-google-image.json',
  twitter: 'emoji-twitter-image.json',
  joypixels: 'emoji-joypixels-image.json',
  blob: 'emoji-blob-image.json'
}

function fetchBuffer (url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
      }
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.setTimeout(10000, () => {
      req.destroy()
      reject(new Error(`Timeout for ${url}`))
    })
  })
}

function getCdnUrl (brand, emojiCode) {
  const config = SUPPORTED_BRANDS[brand]
  return `https://cdn.jsdelivr.net/npm/${config.pkg}@${CDN_VERSION}/img/${config.folder}/${CDN_SIZE}/${emojiCode}.png`
}

async function runPool (tasks, concurrency) {
  const results = []
  let index = 0

  async function worker () {
    while (index < tasks.length) {
      const i = index++
      results[i] = await tasks[i]().catch(() => null)
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker())
  await Promise.all(workers)
  return results
}

async function updateBrand (brand) {
  const config = SUPPORTED_BRANDS[brand]
  if (!config) {
    console.log(`  Skipping ${brand} — not supported by emoji-datasource (keeping existing JSON)`)
    return
  }

  const jsonFile = path.join(EMOJI_DIR, BRAND_JSON_FILES[brand])

  // Load existing data
  let existing = {}
  try {
    if (fs.existsSync(jsonFile)) {
      existing = JSON.parse(fs.readFileSync(jsonFile, 'utf8'))
    }
  } catch (err) {
    console.warn(`  Warning: could not read existing ${jsonFile}: ${err.message}`)
  }

  const dbData = emojiDb.dbData
  const codes = Object.keys(dbData).filter(k => !dbData[k].qualified)

  // Find missing emoji codes
  const missing = codes.filter(code => !existing[code])
  const total = codes.length
  const alreadyHave = total - missing.length

  console.log(`  ${brand}: ${total} emoji total, ${alreadyHave} cached, ${missing.length} to download`)

  if (missing.length === 0) {
    console.log(`  ${brand}: up to date`)
    return
  }

  let downloaded = 0
  let failed = 0

  const tasks = missing.map(code => async () => {
    try {
      const url = getCdnUrl(brand, code)
      const buffer = await fetchBuffer(url)
      const base64 = buffer.toString('base64')

      if (base64.length > 0) {
        downloaded++
        if (downloaded % 100 === 0) process.stdout.write(`  ${brand}: ${downloaded}/${missing.length}\r`)
        return { code, base64 }
      }
    } catch (err) {
      failed++
      return null
    }
  })

  const results = await runPool(tasks, CONCURRENCY)

  for (const result of results) {
    if (result) existing[result.code] = result.base64
  }

  console.log(`  ${brand}: downloaded ${downloaded}, failed ${failed}, total ${Object.keys(existing).length}`)

  // Write atomically
  const tmpFile = jsonFile + '.tmp'
  fs.writeFileSync(tmpFile, JSON.stringify(existing))
  fs.renameSync(tmpFile, jsonFile)

  console.log(`  ${brand}: saved to ${path.basename(jsonFile)}`)
}

async function main () {
  const args = process.argv.slice(2)
  const brands = args.length > 0 ? args : Object.keys(BRAND_JSON_FILES)

  console.log('Emoji updater — CDN: emoji-datasource@' + CDN_VERSION + ' via jsdelivr')
  console.log('Brands to update:', brands.join(', '))
  console.log()

  for (const brand of brands) {
    if (!BRAND_JSON_FILES[brand]) {
      console.error(`Unknown brand: ${brand}`)
      continue
    }
    await updateBrand(brand)
  }

  console.log('\nDone.')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
