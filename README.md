# quote-api
Апи для генерерации Telegram цитат

## Методы
##### Создание цитаты
```http
POST/GET /generate
```

Пример JSON запроса:
```json
{
  "type": "quote",
  "backgroundColor": "#1b1429",
  "width": 512,
  "height": 768,
  "scale": 2,
  "messages": [
    {
      "entities": {},
      "chatId": 66478514,
      "avatar": true,
      "from": {
        "id": 66478514,
        "first_name": "Yuri",
        "last_name": "💜 Ly",
        "username": "LyoSU",
        "language_code": "ru",
        "title": "Yuri 💜 Ly",
        "photo": {
          "small_file_id": "AQADAgAD-qkxG7Jh9gMACIreFJguAAMCAAOyYfYDAATieVimvJOu7CjBAQABGQQ",
          "small_file_unique_id": "AQADit4UmC4AAyjBAQAB",
          "big_file_id": "AQADAgAD-qkxG7Jh9gMACIreFJguAAMDAAOyYfYDAATieVimvJOu7CrBAQABGQQ",
          "big_file_unique_id": "AQADit4UmC4AAyrBAQAB"
        },
        "type": "private",
        "name": "Yuri 💜 Ly"
      },
      "text": "Hello",
      "replyMessage": {}
    }
  ]
}
```

Медиа:
```
{
  "type": "quote",
  "backgroundColor": "#1b1429",
  "width": 512,
  "height": 768,
  "scale": 2,
  "messages": [
    {
      "entities": [],
      "media": [
        {
          "file_id": "AgACAgIAAxkBAAIqWl-gczsNnJRCvw8lFjxcq20emvL3AAKLsjEbNigAAUk02TM0mPO1SxhxZpouAAMBAAMCAANtAAMDUwACGQQ",
          "file_unique_id": "AQADGHFmmi4AAwNTAAI",
          "file_size": 17115,
          "height": 180,
          "width": 320
        },
        {
          "file_id": "AgACAgIAAxkBAAIqWl-gczsNnJRCvw8lFjxcq20emvL3AAKLsjEbNigAAUk02TM0mPO1SxhxZpouAAMBAAMCAAN4AAMEUwACGQQ",
          "file_unique_id": "AQADGHFmmi4AAwRTAAI",
          "file_size": 70933,
          "height": 450,
          "width": 800
        },
        {
          "file_id": "AgACAgIAAxkBAAIqWl-gczsNnJRCvw8lFjxcq20emvL3AAKLsjEbNigAAUk02TM0mPO1SxhxZpouAAMBAAMCAAN5AAMFUwACGQQ",
          "file_unique_id": "AQADGHFmmi4AAwVTAAI",
          "file_size": 133413,
          "height": 720,
          "width": 1280
        }
      ],
      "chatId": 66478514,
      "avatar": true,
      "from": {
        "id": 66478514,
        "first_name": "Yuri",
        "last_name": "💜 Ly",
        "username": "LyoSU",
        "language_code": "ru",
        "title": "Yuri 💜 Ly",
        "photo": {
          "small_file_id": "AQADAgAD-qkxG7Jh9gMACIreFJguAAMCAAOyYfYDAATieVimvJOu7CjBAQABGQQ",
          "small_file_unique_id": "AQADit4UmC4AAyjBAQAB",
          "big_file_id": "AQADAgAD-qkxG7Jh9gMACIreFJguAAMDAAOyYfYDAATieVimvJOu7CrBAQABGQQ",
          "big_file_unique_id": "AQADit4UmC4AAyrBAQAB"
        },
        "type": "private",
        "name": "Yuri 💜 Ly"
      },
      "replyMessage": {}
    }
  ]
}
```

Параметры:
|  Поле | Тип |  Описание  |
| :------------ | :------------ | :------------ |
|  type | string | Тип выходного изображения. Может быть: quote, image, null |
|  backgroundColor | string | Цвет фона цитаты. Может быть Hex, название или random для случайного цвета |
|  messages | array | Массив из сообщений |
| width | number | Максимальная ширина |
| height | number | Максимальная высота |
| scale | number | Маштаб |

Пример ответа:

```json
{
  "ok": true,
  "result": {
    "image": "base64 image",
    "type": "quote",
    "width": 512,
    "height": 359
  }
}

```
