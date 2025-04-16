# quote-api

[![npm version](https://img.shields.io/npm/v/quote-api)](https://www.npmjs.com/package/quote-api)
[![wakatime](https://wakatime.com/badge/github/LyoSU/quote-api.svg)](https://wakatime.com/badge/github/LyoSU/quote-api)

Generator for creating images with "quotes" from Telegram messages.

## Table of Contents
- [quote-api](#quote-api)
  - [Table of Contents](#table-of-contents)
  - [Installation](#installation)
  - [Running](#running)
  - [API](#api)
    - [POST /generate](#post-generate)
      - [Request Parameters](#request-parameters)
      - [Message Object](#message-object)
      - [Request Example](#request-example)
      - [Response](#response)
      - [Additional Examples](#additional-examples)
        - [Text Entities Example](#text-entities-example)
        - [Media Examples](#media-examples)
        - [Voice Message Example](#voice-message-example)
      - [Error Handling](#error-handling)
    - [File Extension in URL](#file-extension-in-url)
  - [Deployed Instance](#deployed-instance)
  - [Usage Examples](#usage-examples)
    - [JavaScript](#javascript)
    - [Python](#python)

---

## Installation

```bash
git clone https://github.com/LyoSU/quote-api.git
cd quote-api
npm install
```

## Running

```bash
# Using environment variables
export BOT_TOKEN=your_telegram_bot_token
npm start

# Or directly
node index.js
```

---

## API

### POST /generate

Generates one or more "quote" images.

#### Request Parameters

Content-Type: `application/json`

| Field               | Type     | Required | Description                                                                                                    |
| ------------------- | -------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| `botToken`          | string   | No       | Telegram bot token (if not provided, uses `process.env.BOT_TOKEN`).                                             |
| `type`              | string   | No       | Final content format:                                                                                           |
|                     |          |          | - `quote` (framed quote)                                                                                        |
|                     |          |          | - `image` (background + eternal image)                                                                          |
|                     |          |          | - `stories` (720×1280 for stories)                                                                              |
|                     |          |          | - otherwise — `null` (raw data).                                                                                |
| `format`            | string   | No       | File format: `png` or `webp` (for `type === 'quote'`).                                                         |
| `ext`               | string   | No       | Extension: `png`/`webp`. If specified, response `image` will be a `Buffer`, otherwise — `base64` string.        |
| `backgroundColor`   | string   | No       | Background color (HEX, CSS-name or `random`).                                                                   |
|                     |          |          | - If string contains slash, e.g., `"#111/#222"`, it creates a gradient.                                         |
|                     |          |          | - If starts with `//`, creates a semi-transparent variant.                                                      |
| `width`             | number   | No       | Layout width in px (before scaling).                                                                            |
| `height`            | number   | No       | Layout height in px (before scaling).                                                                           |
| `scale`             | number   | No       | Scaling factor (1–20). Default is `2`.                                                                          |
| `emojiBrand`        | string   | No       | Emoji brand: `apple` (default), `google`, `twitter`, etc.                                                       |
| `messages`          | array    | Yes      | List of messages (see [Message Object](#message-object)).                                                      |

#### Message Object

| Field                | Type           | Required | Description                                                                                              |
| -------------------- | -------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `from`               | object         | Yes      | Sender information:                                                                                     |
|                      |                |          | - `id` (number): User ID                                                                                 |
|                      |                |          | - `first_name`, `last_name`: User's name components                                                      |
|                      |                |          | - `name`: Alternative to first_name/last_name                                                            |
|                      |                |          | - `username`: User's username                                                                            |
|                      |                |          | - `photo.url` or `photo.big_file_id`: Avatar image                                                       |
|                      |                |          | - `emoji_status`: Custom emoji status ID (optional)                                                      |
| `text`               | string         | No       | Message text (up to 4096 characters).                                                                    |
| `entities`           | array          | No       | Telegram text styles: `bold`, `italic`, `underline`, `strikethrough`, `code`, links, hashtags, etc.      |
|                      |                |          | Each entity is an object with: `type`, `offset`, `length`, and sometimes `custom_emoji_id`               |
| `avatar`             | boolean        | No       | Whether to show avatar (true/false).                                                                     |
| `replyMessage`       | object         | No       | If specified, shows a short quote above:                                                                 |
|                      |                |          | - `name`: Name of the user being replied to                                                              |
|                      |                |          | - `text`: Text of the replied message                                                                    |
|                      |                |          | - `entities`: Text styles in the reply                                                                   |
|                      |                |          | - `chatId`: ID of the chat where the original message was sent (defaults to sender ID if missing)         |
|                      |                |          | - `from`: Optional user information about the reply author                                               |
| `media`              | object\|array  | No       | If array is passed, uses the last file (or second if `mediaCrop=true`).                                 |
|                      |                |          | If object: `{ url }` or `{ file_id, width, height, is_animated }`                                        |
| `mediaType`          | string         | No       | `sticker` for stickers, otherwise text/image.                                                            |
| `mediaCrop`          | boolean        | No       | Whether to crop media to maintain proportions.                                                           |
| `voice`              | object         | No       | Voice message: `{ waveform: [...number] }`. Displayed as a waveform.                                     |

#### Request Example

```http
POST /generate
Content-Type: application/json

{
  "backgroundColor": "#1b1429",
  "width": 512,
  "height": 768,
  "scale": 2,
  "emojiBrand": "apple",
  "messages": [
    {
      "from": {
        "id": 66478514,
        "first_name": "Yuri 💜",
        "last_name": "Ly",
        "username": "LyoSU",
        "photo": { "big_file_id": "AQAD..." }
      },
      "text": "Welcome to the quote generator!",
      "entities": [
        {
          "type": "bold",
          "offset": 0,
          "length": 7
        },
        {
          "type": "italic",
          "offset": 8,
          "length": 3
        }
      ],
      "avatar": true,
      "replyMessage": {
        "name": "Charlie",
        "text": "How's the weather today?",
        "entities": [],
        "chatId": 123456789,
        "from": {
          "id": 123456789,
          "name": "Charlie",
          "photo": { "url": "https://example.com/avatar.jpg" }
        }
      }
    }
  ]
}
```

#### Response

```json
{
  "image": "<base64 string or Buffer>",
  "type": "quote",
  "width": 512,
  "height": 359,
  "ext": "png"
}
```

#### Additional Examples

##### Text Entities Example

```json
"entities": [
  {
    "type": "bold",
    "offset": 0,
    "length": 5
  },
  {
    "type": "italic",
    "offset": 6,
    "length": 6
  },
  {
    "type": "code",
    "offset": 13,
    "length": 10
  },
  {
    "type": "text_link",
    "offset": 24,
    "length": 4,
    "url": "https://example.com"
  },
  {
    "type": "custom_emoji",
    "offset": 29,
    "length": 2,
    "custom_emoji_id": "5368324170671202286"
  }
]
```

##### Media Examples

Using URL:
```json
"media": {
  "url": "https://example.com/image.jpg"
}
```

Using file_id:
```json
"media": {
  "file_id": "AgACAgIAAxkBAAIQ7WR...",
  "width": 800,
  "height": 600
}
```

Using multiple files (will use last or second if mediaCrop=true):
```json
"media": [
  {"file_id": "AgACAgIAAxkBAAIQ7WR..."},
  {"file_id": "AgACAgIAAxkBAAIQ7WS..."}
]
```

##### Voice Message Example

```json
"voice": {
  "waveform": [0, 4, 8, 16, 12, 8, 4, 8, 16, 12, 8, 4, 0]
}
```

#### Error Handling

Possible error responses:

```json
{"error": "query_empty"} // No parameters provided
{"error": "messages_empty"} // No messages in the request
{"error": "empty_messages"} // No valid messages could be processed
```

### File Extension in URL

You can request images directly with the desired file format by appending `.png` or `.webp` to the endpoint URL:

```http
POST /generate.png
Content-Type: application/json

{
  "messages": [...]
}
```

This is equivalent to setting `ext: "png"` in the request body. The response will contain a binary image instead of a base64 string.

Similarly, you can use:
```http
POST /generate.webp
```

This is especially useful for integrations that require direct file responses rather than processing base64 content.

---

## Deployed Instance

There is a deployed instance of this API available at:
```
https://bot.lyo.su/quote/generate
```

You can also use format-specific endpoints:
```
https://bot.lyo.su/quote/generate.png
https://bot.lyo.su/quote/generate.webp
```

You can use these URLs for testing purposes, but please note that stability isn't guaranteed for production use.

---

## Usage Examples

### JavaScript

```js
const axios = require('axios')
const fs = require('fs')

// Minimal example with only required fields
const simpleExample = async () => {
  try {
    // Minimal required payload
    const payload = {
      messages: [{
        from: {
          id: 1,
          name: "User"
        },
        text: "Hello world!"
      }]
    }

    const response = await axios.post('https://bot.lyo.su/quote/generate', payload)
    if (response.data.error) {
      console.error('Error:', response.data.error)
      return
    }

    const buffer = Buffer.from(response.data.image, 'base64')
    fs.writeFileSync('simple-quote.png', buffer)
    console.log("Saved simple-quote.png")
  } catch (error) {
    console.error('Request failed:', error.message)
  }
}

// Complete example with all options
const completeExample = async () => {
  try {
    const payload = {
      backgroundColor: "#FFFFFF",
      width: 512,
      height: 768,
      scale: 2,
      emojiBrand: "apple",
      messages: [
        {
          from: {
            id: 1,
            name: "Alice",
            photo: { url: "https://dummyimage.com/100x100" }
          },
          text: "Hello World",
          avatar: true,
          entities: [
            {
              type: "bold",
              offset: 0,
              length: 5
            }
          ],
          replyMessage: {
            name: "Bob",
            text: "How's the weather today?",
            entities: [],
            chatId: 987654321
          }
        }
      ]
    }

    // Option 1: Using the regular endpoint (returns base64)
    const response = await axios.post('https://bot.lyo.su/quote/generate', payload)
    const buffer = Buffer.from(response.data.image, 'base64')
    fs.writeFileSync('quote.png', buffer)
    console.log("Saved quote.png")

    // Option 2: Using the PNG endpoint directly (returns binary)
    const binaryResponse = await axios.post(
      'https://bot.lyo.su/quote/generate.png',
      payload,
      { responseType: 'arraybuffer' }
    )
    fs.writeFileSync('quote-direct.png', Buffer.from(binaryResponse.data))
    console.log("Saved quote-direct.png")
  } catch (error) {
    console.error('Request failed:', error.message)
  }
}

// Run examples
simpleExample()
completeExample()
```

### Python

```py
import requests
import base64
import os

# Minimal example with only required fields
def simple_example():
    # Minimal required payload
    payload = {
        "messages": [{
            "from": {
                "id": 1,
                "name": "User"
            },
            "text": "Hello world!"
        }]
    }

    try:
        r = requests.post('https://bot.lyo.su/quote/generate', json=payload)
        data = r.json()
        if 'error' in data:
            print(f"Error: {data['error']}")
            return

        img = base64.b64decode(data['image'])
        with open('simple-quote.png', 'wb') as f:
            f.write(img)
        print("Saved simple-quote.png")
    except Exception as e:
        print(f"Request failed: {str(e)}")

# Complete example with all options
def complete_example():
    payload = {
        "backgroundColor": "#FFFFFF",
        "width": 512,
        "height": 768,
        "scale": 2,
        "emojiBrand": "apple",
        "messages": [
            {
                "from": {
                    "id": 1,
                    "name": "Bob",
                    "photo": { "url": "https://dummyimage.com/100x100" }
                },
                "text": "Hello!",
                "avatar": True,
                "entities": [
                    {
                        "type": "bold",
                        "offset": 0,
                        "length": 5
                    }
                ],
                "replyMessage": {
                    "name": "Alice",
                    "text": "Hi there!",
                    "entities": [],
                    "chatId": 123456789
                }
            }
        ]
    }

    try:
        # Option 1: Using the regular endpoint (returns base64)
        r = requests.post('https://bot.lyo.su/quote/generate', json=payload)
        data = r.json()
        img = base64.b64decode(data['image'])
        with open('quote.png', 'wb') as f:
            f.write(img)
        print("Saved quote.png")

        # Option 2: Using the PNG endpoint directly (returns binary)
        r = requests.post('https://bot.lyo.su/quote/generate.png', json=payload)
        with open('quote-direct.png', 'wb') as f:
            f.write(r.content)
        print("Saved quote-direct.png")
    except Exception as e:
        print(f"Request failed: {str(e)}")

# Run examples
simple_example()
complete_example()
```
