/**
 * Express Application Setup
 * Responsibility: Configures Express middleware, security headers, CORS policies,
 * route mounting, and error handling.
 */
import express from 'express'
import cors from 'cors'
import { config } from './config/env.js'
import healthRoutes from './routes/health.routes.js'
import tinyfishRoutes from './routes/tinyfish.routes.js'
import { errorHandler } from './middleware/errorHandler.js'

export const app = express()

// Security & Parsing Middlewares
// Security & Parsing Middlewares
app.use(
  cors({
    origin: (requestOrigin, callback) => {
      // Allow requests with no origin (e.g. curl, server-to-server, health probes, test suites)
      if (!requestOrigin) return callback(null, true)

      const normalized = requestOrigin.replace(/\/+$/, '')

      if (config.allowedOrigins.includes(normalized)) {
        return callback(null, true)
      }

      // In development mode, permit any localhost or 127.0.0.1 origin
      if (
        config.nodeEnv !== 'production' &&
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalized)
      ) {
        return callback(null, true)
      }

      // Origin not allowed by CORS policy
      return callback(null, false)
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
)

app.use(express.json({ limit: '100kb' }))

// Health Check Endpoints
app.use('/api/health', healthRoutes)
app.use('/health', healthRoutes)

// API Routing
app.use('/api/tinyfish', tinyfishRoutes)

// 404 Route Catch-all
app.use((req, res, next) => {
  const error = new Error(`Cannot ${req.method} ${req.originalUrl}`)
  error.status = 404
  next(error)
})

// Centralized Error Handling
app.use(errorHandler)
