/**
 * Health Routes
 * Responsibility: Exposes system diagnostic and health check endpoints (/health, /api/health)
 * to verify backend uptime and readiness without exposing secrets.
 */
import { Router } from 'express'
import { config, isTinyFishConfigured } from '../config/env.js'

const router = Router()

router.get('/', (req, res) => {
  const configured = isTinyFishConfigured()

  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
    services: {
      tinyfishConfigured: configured,
      search: configured ? 'ready' : 'key_missing',
      fetch: configured ? 'ready' : 'key_missing',
      agent: configured ? 'ready' : 'key_missing',
    },
    capabilities: {
      search: {
        endpoint: '/api/tinyfish/search',
        method: 'POST',
        implemented: true,
        keyConfigured: configured,
      },
      fetch: {
        endpoint: '/api/tinyfish/fetch',
        method: 'POST',
        implemented: true,
        keyConfigured: configured,
      },
      agent: {
        endpoint: '/api/tinyfish/agent/stream',
        method: 'POST',
        implemented: true,
        keyConfigured: configured,
      },
    },
  })
})

export default router
