const { popPage, pushPage } = require('./page-pool')

module.exports = async (pageName, content) => {
  const page = await popPage(pageName)
  const body = await page.locator('body')

  await body.evaluate((element, content) => { element.innerHTML = content }, content)

  const quote = await body.locator('#quote')
  await quote.waitFor({ state: 'visible' })
  await page.waitForLoadState('networkidle')

  const screenshot = await quote.screenshot({
    type: 'png',
    scale: 'css',
    omitBackground: true
  })

  pushPage(page)
  return screenshot
}
