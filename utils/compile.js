const path = require('path')
const fs = require('fs')
const Handlebars = require('handlebars')

const cache = {}

module.exports = (viewName, data) => {
  let view = cache[viewName]

  if (view == null) {
    const template = fs.readFileSync(
      path.resolve(__dirname, `../views/${viewName}.hbs`)
    ).toString('utf-8')
    view = Handlebars.compile(template)
    cache[viewName] = view
  }

  return view(data)
}
