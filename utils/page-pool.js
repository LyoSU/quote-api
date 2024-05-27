const path = require('path')
const fs = require('fs')
const { webkit } = require('playwright')

const promise = webkit.launch().then(browser => browser.newContext())
const files = {} // cache of contents from .html files
const pages = {} // arrays of browser pages by name

const popPage = async (pageName) => {
  const context = await promise
  if (!Array.isArray(pages[pageName])) {
    pages[pageName] = []
  }

  if (pages[pageName].length) {
    const page = pages[pageName].pop()
    return page
  } else {
    // if pool of appropriate pages is empty, create new page
    let html = files[pageName]
    if (html == null) {
      html = fs.readFileSync(path.resolve(__dirname, `../pages/${pageName}.html`))
        .toString('utf-8')
        .replace('{{> CSSresetURL}}', `http://localhost:${process.env.PORT}/assets/reset.min.css`)
      files[pageName] = html
    }

    const page = await context.newPage()
    page.on('console', message => console.log(message.text()))
    await page.setContent(html)

    return page
  }
}

const pushPage = (pageName, page) => {
  if (!Array.isArray(pages[pageName])) {
    pages[pageName] = []
  }
  pages[pageName].push(page)
}

module.exports = {
  popPage, pushPage
}
