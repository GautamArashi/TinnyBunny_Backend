/**
 * TinyFish Routes
 * Responsibility: Declares Express routing for TinyFish proxy endpoints
 * (/api/tinyfish/search, /api/tinyfish/fetch, /api/tinyfish/agent/stream).
 */
import { Router } from 'express'
import {
  searchHandler,
  fetchHandler,
  agentStreamHandler,
} from '../controllers/tinyfish.controller.js'
import {
  validateSearchRequest,
  validateFetchRequest,
  validateAgentRequest,
} from '../validators/tinyfish.validator.js'
import {
  searchRateLimiter,
  fetchRateLimiter,
  agentRateLimiter,
} from '../middleware/rateLimit.js'

const router = Router()

// POST /api/tinyfish/search
router.post('/search', searchRateLimiter, validateSearchRequest, searchHandler)

// POST /api/tinyfish/fetch
router.post('/fetch', fetchRateLimiter, validateFetchRequest, fetchHandler)

// POST /api/tinyfish/agent/stream
router.post('/agent/stream', agentRateLimiter, validateAgentRequest, agentStreamHandler)

export default router
