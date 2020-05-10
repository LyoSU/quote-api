module.exports = {
  apps: [{
    name: 'QuoteBot',
    script: './index.js',
    max_memory_restart: '2000M',
    instances: 2,
    exec_mode: 'cluster',
    watch: true,
    ignore_watch: ['node_modules', 'assets'],
    env: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production'
    }
  }]
}
