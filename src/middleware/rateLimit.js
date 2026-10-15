/**
 * Rate Limiting Middleware
 * Responsibility: Protects server resources and manages request frequency
 * to prevent throttling on upstream TinyFish API tiers.
 */
import rateLimit from 'express-rate-limit'

export const searchRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // Limit each IP to 60 search requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      message: 'Too many search requests from this client. Please wait a minute before retrying.',
      status: 429,
    },
  },
})

export const fetchRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // Limit each IP to 30 fetch requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      message: 'Too many fetch requests from this client. Please wait a minute before retrying.',
      status: 429,
    },
  },
})

export const agentRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 15, // Limit each IP to 15 agent runs per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      message: 'Too many agent execution requests from this client. Please wait a minute before starting a new run.',
      status: 429,
    },
  },
})
