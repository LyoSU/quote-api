// utils/quote-generate/media.js

const { loadImage } = require('canvas')
const sharp = require('sharp')
const { Jimp, JimpMime } = require('jimp')
const smartcrop = require('smartcrop-sharp')
const loadImageFromUrl = require('../image-load-url')

async function downloadMediaImage (media, mediaSize, type, crop, telegram) {
  type = type || 'id'
  crop = crop !== undefined ? crop : true

  try {
    let mediaUrl
    if (type === 'id') mediaUrl = await telegram.getFileLink(media).catch(console.error)
    else mediaUrl = media

    if (!mediaUrl) {
      console.warn('Failed to get media URL, skipping media')
      return null
    }

    const load = await loadImageFromUrl(mediaUrl).catch((error) => {
      console.warn('Failed to load image from URL:', error.message)
      return null
    })

    if (!load) {
      console.warn('Failed to load media, skipping')
      return null
    }

    if (crop || (mediaUrl && mediaUrl.match(/.webp/))) {
      try {
        const imageSharp = sharp(load)
        const imageMetadata = await imageSharp.metadata()
        const sharpPng = await imageSharp.png({ lossless: true, force: true }).toBuffer()

        if (!imageMetadata || !imageMetadata.width || !imageMetadata.height || !sharpPng) {
          try {
            return await loadImage(load)
          } catch (fallbackError) {
            console.warn('Failed to load original image as fallback:', fallbackError.message)
            return null
          }
        }

        let croppedImage

        if (imageMetadata.format === 'webp') {
          try {
            const jimpImage = await Jimp.read(sharpPng)
            croppedImage = await jimpImage.autocrop().getBuffer(JimpMime.png)
          } catch (jimpError) {
            console.warn('Failed to process webp with Jimp, using original:', jimpError.message)
            croppedImage = sharpPng
          }
        } else {
          try {
            const smartcropResult = await smartcrop.crop(sharpPng, { width: mediaSize, height: imageMetadata.height })
            const cropArea = smartcropResult.topCrop
            // Create fresh sharp instance for extract (pipeline not reusable after toBuffer)
            croppedImage = await sharp(load).extract({
              width: cropArea.width,
              height: cropArea.height,
              left: cropArea.x,
              top: cropArea.y
            }).png({ lossless: true, force: true }).toBuffer()
          } catch (cropError) {
            console.warn('Failed to crop image, using original:', cropError.message)
            croppedImage = sharpPng
          }
        }

        try {
          return await loadImage(croppedImage)
        } catch (loadError) {
          console.warn('Failed to load processed image, trying original:', loadError.message)
          try {
            return await loadImage(load)
          } catch (originalError) {
            console.warn('Failed to load original image as final fallback:', originalError.message)
            return null
          }
        }
      } catch (sharpError) {
        console.warn('Failed to process image with Sharp, trying original:', sharpError.message)
        try {
          return await loadImage(load)
        } catch (originalError) {
          console.warn('Failed to load original image:', originalError.message)
          return null
        }
      }
    } else {
      try {
        return await loadImage(load)
      } catch (loadError) {
        console.warn('Failed to load image:', loadError.message)
        return null
      }
    }
  } catch (error) {
    console.error('Critical error in downloadMediaImage:', error.message)
    return null
  }
}

module.exports = { downloadMediaImage }
