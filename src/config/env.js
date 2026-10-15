/**
 * Environment Configuration
 * Responsibility: Centralized loader and validator for runtime environment variables
 * (PORT, TINYFISH_API_KEY, NODE_ENV, etc.).
 */
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

// Ensure .env is loaded from the server directory even when run from root
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const nodeEnv = process.env.NODE_ENV || 'development'
const isDev = nodeEnv !== 'production'

/**
 * Parses comma-separated CLIENT_ORIGIN string into an array of allowed origins.
 * In development mode, automatically preserves local development access.
 */
function parseAllowedOrigins(originString, isDevelopment) {
  const localDefaults = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ]
  const parsed = (originString || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean)

  if (isDevelopment) {
    localDefaults.forEach((origin) => {
      if (!parsed.includes(origin)) parsed.push(origin)
    })
  }

  return parsed.length > 0 ? parsed : ['http://localhost:5173']
}

const allowedOrigins = parseAllowedOrigins(process.env.CLIENT_ORIGIN, isDev)

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  host: process.env.HOST || '0.0.0.0',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  allowedOrigins,
  tinyfishApiKey: (process.env.TINYFISH_API_KEY || '').trim(),
  searchLocation: (process.env.TINYFISH_SEARCH_LOCATION || '').trim(),
  searchLanguage: (process.env.TINYFISH_SEARCH_LANGUAGE || '').trim(),
  nodeEnv,
}

/**
 * Checks if a non-empty TinyFish API key is present.
 *
 * @returns {boolean} True if API key is configured
 */
export function isTinyFishConfigured() {
  return Boolean(config.tinyfishApiKey && config.tinyfishApiKey.length > 0)
}
