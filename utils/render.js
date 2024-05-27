const { popPage, pushPage } = require('./page-pool')

module.exports = async (pageName, content) => {
  const page = await popPage(pageName)
  const body = await page.locator('body')

  await body.evaluate((element, content) => { element.innerHTML = content }, content)

  // wait for all images will be loaded
  await page.waitForFunction(() => {
    const images = Array.from(document.querySelectorAll('img'))
    return images.every(img => img.complete)
  })

  const quote = await body.locator('#quote')
  const screenshot = await quote.screenshot({
    type: 'png',
    scale: 'css',
    omitBackground: true
  })

  pushPage(pageName, page)
  return screenshot
}
