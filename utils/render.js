const { webkit } = require('playwright')

const promise = webkit.launch()
  .then(browser => browser.newContext())
  .then(context => context.newPage())

module.exports = async (content) => {
  const page = await promise
  await page.setContent(content)
  return page
}
