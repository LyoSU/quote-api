const { webkit } = require('playwright')

const promise = webkit.launch()
  .then(browser => browser.newContext())
  .then(context => context.newPage())

module.exports = async (content, selector) => {
  const page = await promise
  await page.setContent(content)
  const screenshot = await page.locator(selector).screenshot({
    type: 'png',
    scale: 'css',
    omitBackground: true
  })
  return screenshot
}
