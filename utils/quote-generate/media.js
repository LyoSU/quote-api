// utils/quote-generate/media.js

const { loadImage } = require('canvas')
const sharp = require('sharp')
const smartcrop = require('smartcrop-sharp')
const loadImageFromUrl = require('../image-load-url')
const { execFile } = require('child_process')
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')

// Telegram animations (GIFs) are mp4 files; thumbnail-less ones reach us as
// raw video buffers that neither canvas nor sharp can decode. Detect a video
// container by magic bytes and extract the first frame via ffmpeg
// (best-effort: no ffmpeg installed → behave like before, media is skipped).
function isVideoBuffer (buffer) {
  if (!buffer || buffer.length < 12) return false
  // mp4/mov/m4v: "ftyp" box at offset 4
  if (buffer.slice(4, 8).toString('latin1') === 'ftyp') return true
  // webm/mkv: EBML header
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) return true
  return false
}

function extractVideoFrame (buffer) {
  return new Promise((resolve) => {
    // ffmpeg needs a seekable input for mp4 (moov atom may sit at the end),
    // so go through a temp file; the PNG frame comes back on stdout.
    const tmp = path.join(os.tmpdir(), `quote-media-${crypto.randomBytes(8).toString('hex')}`)
    fs.writeFile(tmp, buffer, (writeErr) => {
      if (writeErr) return resolve(null)
      execFile('ffmpeg', [
        '-y', '-i', tmp,
        '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', 'pipe:1'
      ], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024, timeout: 15000 }, (err, stdout) => {
        fs.unlink(tmp, () => {})
        if (err || !stdout || stdout.length === 0) {
          if (err) console.warn('ffmpeg frame extraction failed:', err.message)
          return resolve(null)
        }
        resolve(stdout)
      })
    })
  })
}

// Frame of the `crop` preview (w / h).
const PREVIEW_ASPECT = { landscape: 16 / 9, portrait: 1 }

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

    let load = await loadImageFromUrl(mediaUrl).catch((error) => {
      console.warn('Failed to load image from URL:', error.message)
      return null
    })

    if (!load) {
      console.warn('Failed to load media, skipping')
      return null
    }

    // Raw video (thumbnail-less GIF/animation) → first frame, then the
    // normal image pipeline below applies unchanged.
    if (isVideoBuffer(load)) {
      const frame = await extractVideoFrame(load)
      if (!frame) {
        console.warn('Media is a video and no frame could be extracted, skipping')
        return null
      }
      load = frame
    }

    if (crop || (mediaUrl && mediaUrl.match(/.webp/))) {
      try {
        const imageSharp = sharp(load)
        const imageMetadata = await imageSharp.metadata()
        const sharpPng = await imageSharp.png().toBuffer()

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
          // Stickers: drop the transparent margin so the art fills its slot.
          try {
            croppedImage = await sharp(sharpPng).trim().png().toBuffer()
          } catch (trimError) {
            croppedImage = sharpPng // nothing to trim (uniform image)
          }
        } else {
          // `crop` flag: a preview crop like Twitter's — a fixed frame placed
          // on the most salient part of the picture (smartcrop), 16:9 for
          // landscape and square shots, 1:1 for portraits. (The target used
          // to be `mediaSize × source height`: an aspect ratio that depended
          // on the file's resolution.)
          try {
            const { width: iw, height: ih } = imageMetadata
            const aspect = iw >= ih ? PREVIEW_ASPECT.landscape : PREVIEW_ASPECT.portrait
            const cw = Math.round(Math.min(iw, ih * aspect))
            const ch = Math.round(Math.min(ih, cw / aspect))
            const smartcropResult = await smartcrop.crop(sharpPng, { width: cw, height: ch })
            const cropArea = smartcropResult.topCrop
            // Create fresh sharp instance for extract (pipeline not reusable after toBuffer)
            croppedImage = await sharp(load).extract({
              width: cropArea.width,
              height: cropArea.height,
              left: cropArea.x,
              top: cropArea.y
            }).png().toBuffer()
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
        // canvas can't decode this format natively — convert via sharp to PNG
        try {
          const pngBuffer = await sharp(load).png({ force: true }).toBuffer()
          return await loadImage(pngBuffer)
        } catch (convertError) {
          console.warn('Failed to load image:', loadError.message)
          return null
        }
      }
    }
  } catch (error) {
    console.error('Critical error in downloadMediaImage:', error.message)
    return null
  }
}

module.exports = { downloadMediaImage }
