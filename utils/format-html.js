const escapedChars = {
  '"': '&quot;',
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;'
}

const escapeHTML = (string) => {
  const chars = [...string]
  return chars.map(char => escapedChars[char] || char).join('')
}


module.exports = (text = '', entities = []) => {
  const available = [...entities]
  const opened = []
  const result = []
  for (let offset = 0; offset < text.length; offset++) {
    while (true) {
      const index = available.findIndex((entity) => entity.offset === offset)
      if (index === -1) {
        break
      }
      const entity = available[index]
      switch (entity.type) {
        case 'bold':
          result.push('<b>')
          break
        case 'italic':
          result.push('<i>')
          break
        case 'code':
          result.push('<code>')
          break
        case 'pre':
          if (entity.language) {
            result.push(`<code class="language-${entity.language}">`)
          } else {
            result.push('<code>')
          }
          break
        case 'strikethrough':
          result.push('<s>')
          break
        case 'underline':
          result.push('<u>')
          break
        case 'text_mention':
          result.push(`<a href="#" class="mention">`)
          break
        case 'text_link':
          result.push(`<a href="#">`)
          break
        case 'url':
          result.push(`<a href="#" class="url">`)
          break
        case 'spoiler':
          result.push(`<span class="spoiler">`)
          break
        case 'mention':
          result.push(`<span class="mention">`)
          break
        case 'hashtag':
          result.push(`<span class="hashtag">`)
          break
        case 'cashtag':
          result.push(`<span class="cashtag">`)
          break
        case 'bot_command':
          result.push(`<span class="bot-command">`)
          break
        case 'email':
          result.push(`<span class="email">`)
          break
        case 'phone_number':
          result.push(`<span class="phone-number">`)
          break
      }
      opened.unshift(entity)
      available.splice(index, 1)
    }

    result.push(escapeHTML(text[offset]))

    while (true) {
      const index = opened.findIndex((entity) => entity.offset + entity.length - 1 === offset)
      if (index === -1) {
        break
      }
      const entity = opened[index]
      switch (entity.type) {
        case 'bold':
          result.push('</b>')
          break
        case 'italic':
          result.push('</i>')
          break
        case 'code':
          result.push('</code>')
          break
        case 'pre':
          if (entity.language) {
            result.push('</code>')
          } else {
            result.push('</code>')
          }
          break
        case 'strikethrough':
          result.push('</s>')
          break
        case 'underline':
          result.push('</u>')
          break
        case 'text_mention':
        case 'text_link':
        case 'url':
          result.push('</a>')
          break
        case 'spoiler':
        case 'mention':
        case 'hashtag':
        case 'cashtag':
        case 'bot_command':
        case 'email':
        case 'phone_number':
          result.push('</span>')
          break
      }
      opened.splice(index, 1)
    }
  }
  return result.join('')
}
