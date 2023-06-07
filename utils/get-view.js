const path = require('path')
const fs = require('fs')
const Handlebars = require('handlebars')

module.exports = viewName => {
  const template = fs.readFileSync(
    path.resolve(`./views/${viewName}.hbs`)
  ).toString('utf-8')

  return Handlebars.compile(template)
}
