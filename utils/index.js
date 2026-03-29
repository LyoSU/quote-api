const QuoteGenerate = require('./quote-generate/index')

module.exports = {
  QuoteGenerate,
  loadFonts: QuoteGenerate.loadFonts,
  loadImageFromUrl: require('./image-load-url'),
  loadImageFromPath: require('./image-load-path'),
  promiseAllStepN: require('./promise-concurrent'),
  userName: require('./user-name')
}
