const { webkit } = require('playwright')

const promise = webkit.launch().then(browser => browser.newContext())

module.exports = async (content, selector) => {
  const context = await promise
  const page = await context.newPage()
  await page.setContent(content)
  await page.waitForSelector(selector, { state: 'visible' })

  const screenshot = await page.locator(selector).screenshot({
    type: 'png',
    scale: 'css',
    omitBackground: true
  })

  page.close().catch(console.error)
  return screenshot
}
