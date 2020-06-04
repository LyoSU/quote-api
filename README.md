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
  "backgroundColor": "#130f1c",
  "width": 512,
  "height": 768,
  "scale": 2,
  "messages": [
    {
      "message": {
        "chatId": 66478514,
        "avatar": true,
        "from": {
          "id": 66478514,
          "name": "Yuri 💜 Ly",
          "username": "LyoSU",
          "photo": {
            "small_file_id": "AQADAgADxakxG7Jh9gMACLP-UJEuAAMCAAOyYfYDAATieVimvJOu7MNPBAABGQQ",
            "small_file_unique_id": "AQADs_5QkS4AA8NPBAAB",
            "big_file_id": "AQADAgADxakxG7Jh9gMACLP-UJEuAAMDAAOyYfYDAATieVimvJOu7MVPBAABGQQ",
            "big_file_unique_id": "AQADs_5QkS4AA8VPBAAB"
          }
        },
        "text": "Hello world!"
      },
      "replyMessage": {},
      "entities": []
    },
    {
      "message": {
        "chatId": 66478514,
        "from": {
          "id": 66478514,
          "name": false,
          "username": "LyoSU"
        },
        "text": "Я люблю тебя ❤️"
      },
      "replyMessage": {},
      "entities": []
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
