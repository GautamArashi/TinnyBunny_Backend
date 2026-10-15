/**
 * Server Launcher
 * Responsibility: Starts the HTTP server on the configured port.
 */
import { app } from './app.js'
import { config, isTinyFishConfigured } from './config/env.js'

const server = app.listen(config.port, config.host, () => {
  console.log(`[TinyFish Studio Server] Listening on ${config.host}:${config.port} (env: ${config.nodeEnv})`)
  console.log(`[TinyFish Studio Server] Allowed Client Origins: ${config.allowedOrigins.join(', ')}`)
  console.log(
    `[TinyFish Studio Server] TinyFish API Key: ${
      isTinyFishConfigured() ? 'Configured (Active)' : 'Not Configured (Requires server/.env or platform env)'
    }`
  )
})

process.on('SIGTERM', () => {
  server.close(() => {
    console.log('[TinyFish Studio Server] Process terminated')
  })
})
