const path = require('path')
const fs = require('fs')
const Handlebars = require('handlebars')

const cache = {}

module.exports = (viewName, styleName) => {
  const cacheKey = `${viewName}/${styleName}`
  if (cache[cacheKey]) {
    return cache[cacheKey]
  }

  const template = fs.readFileSync(
    path.resolve(`./views/${viewName}.hbs`)
  ).toString('utf-8')

  const style = fs.readFileSync(
    path.resolve(`./views/${styleName}.css`)
  ).toString('utf-8')

  const view = Handlebars.compile(template.replace('{{> style}}', style))

  cache[cacheKey] = view
  return view
}
