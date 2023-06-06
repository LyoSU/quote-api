const path = require('path')
const fs = require('fs')
const Handlebars = require('handlebars')

const quote = Handlebars.compile(
  fs.readFileSync(path.resolve('./views/quote.hbs')).toString('utf-8')
)

module.exports = {
  quote
}
