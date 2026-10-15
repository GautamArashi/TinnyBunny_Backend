/**
 * TinyFish Request Validators
 * Responsibility: Validates request payloads and query parameters for search,
 * fetch, and agent requests before forwarding to controllers.
 */
import { validateFetchUrl } from '../utils/urlValidator.js'

const SUPPORTED_FETCH_FORMATS = new Set(['markdown', 'html', 'json'])
const MAX_FETCH_URLS = 10
const MAX_PURPOSE_LENGTH = 2000
const MAX_GOAL_LENGTH = 2000
const DEFAULT_MAX_DURATION = 180

export function validateSearchRequest(req, res, next) {
  if (!req.body || typeof req.body !== 'object') {
    const error = new Error('Invalid request payload. Expected JSON body.')
    error.status = 400
    return next(error)
  }

  const { query } = req.body

  if (typeof query !== 'string') {
    const error = new Error('Search query must be a string.')
    error.status = 400
    return next(error)
  }

  const trimmedQuery = query.trim()

  if (!trimmedQuery) {
    const error = new Error('Search query cannot be empty.')
    error.status = 400
    return next(error)
  }

  if (trimmedQuery.length > 500) {
    const error = new Error('Search query cannot exceed 500 characters.')
    error.status = 400
    return next(error)
  }

  req.sanitizedQuery = trimmedQuery
  next()
}

/**
 * Validates requests for the TinyFish Fetch API (POST /api/tinyfish/fetch).
 */
export function validateFetchRequest(req, res, next) {
  if (!req.body || typeof req.body !== 'object') {
    const error = new Error('Invalid request payload. Expected JSON body.')
    error.status = 400
    return next(error)
  }

  const { urls, format = 'markdown', purpose } = req.body

  if (!Array.isArray(urls)) {
    const error = new Error("The 'urls' parameter must be an array containing 1 to 10 URLs.")
    error.status = 400
    return next(error)
  }

  if (urls.length === 0) {
    const error = new Error("The 'urls' array must contain at least one URL.")
    error.status = 400
    return next(error)
  }

  if (urls.length > MAX_FETCH_URLS) {
    const error = new Error(`Cannot fetch more than ${MAX_FETCH_URLS} URLs per request.`)
    error.status = 400
    return next(error)
  }

  const sanitizedUrls = []
  for (let i = 0; i < urls.length; i++) {
    const rawUrl = urls[i]
    const result = validateFetchUrl(rawUrl)
    if (!result.valid) {
      const error = new Error(`Validation failed for URL at index ${i}: ${result.error}`)
      error.status = 400
      return next(error)
    }
    sanitizedUrls.push(result.sanitizedUrl)
  }

  const normalizedFormat = typeof format === 'string' ? format.toLowerCase().trim() : ''
  if (!SUPPORTED_FETCH_FORMATS.has(normalizedFormat)) {
    const error = new Error(
      `Invalid format "${format}". Supported formats are: ${Array.from(SUPPORTED_FETCH_FORMATS).join(', ')}.`
    )
    error.status = 400
    return next(error)
  }

  let sanitizedPurpose = null
  if (purpose !== undefined && purpose !== null && purpose !== '') {
    if (typeof purpose !== 'string') {
      const error = new Error("The 'purpose' field must be a string.")
      error.status = 400
      return next(error)
    }

    const trimmedPurpose = purpose.trim()
    if (trimmedPurpose.length > MAX_PURPOSE_LENGTH) {
      const error = new Error(`The 'purpose' field cannot exceed ${MAX_PURPOSE_LENGTH} characters.`)
      error.status = 400
      return next(error)
    }
    sanitizedPurpose = trimmedPurpose
  }

  req.sanitizedFetch = {
    urls: sanitizedUrls,
    format: normalizedFormat,
    purpose: sanitizedPurpose,
  }

  next()
}

/**
 * Validates requests for the TinyFish Agent Streaming API (POST /api/tinyfish/agent/stream).
 */
export function validateAgentRequest(req, res, next) {
  if (!req.body || typeof req.body !== 'object') {
    const error = new Error('Invalid request payload. Expected JSON body.')
    error.status = 400
    return next(error)
  }

  const { url, goal, max_duration_seconds } = req.body

  // Validate starting URL using SSRF and protocol rules
  if (!url || typeof url !== 'string') {
    const error = new Error('Starting URL is required and must be a string.')
    error.status = 400
    return next(error)
  }

  const urlValidation = validateFetchUrl(url)
  if (!urlValidation.valid) {
    const error = new Error(`Invalid starting URL: ${urlValidation.error}`)
    error.status = 400
    return next(error)
  }

  // Validate goal
  if (!goal || typeof goal !== 'string') {
    const error = new Error('Goal is required and must be a non-empty string.')
    error.status = 400
    return next(error)
  }

  const trimmedGoal = goal.trim()
  if (!trimmedGoal) {
    const error = new Error('Goal cannot be empty.')
    error.status = 400
    return next(error)
  }

  if (trimmedGoal.length > MAX_GOAL_LENGTH) {
    const error = new Error(`Goal cannot exceed ${MAX_GOAL_LENGTH} characters.`)
    error.status = 400
    return next(error)
  }

  // Validate optional max_duration_seconds (bounds 30 to 600)
  let duration = DEFAULT_MAX_DURATION
  if (max_duration_seconds !== undefined && max_duration_seconds !== null) {
    const parsedDuration = Number(max_duration_seconds)
    if (isNaN(parsedDuration) || parsedDuration < 30 || parsedDuration > 600) {
      const error = new Error('max_duration_seconds must be a number between 30 and 600.')
      error.status = 400
      return next(error)
    }
    duration = Math.round(parsedDuration)
  }

  req.sanitizedAgent = {
    url: urlValidation.sanitizedUrl,
    goal: trimmedGoal,
    max_duration_seconds: duration,
  }

  next()
}
