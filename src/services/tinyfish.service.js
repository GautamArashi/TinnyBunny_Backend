/**
 * TinyFish Service
 * Responsibility: Implements secure HTTP communication with upstream TinyFish APIs
 * using native fetch, AbortController timeouts, credential protection, and upstream error mapping.
 */
import { config, isTinyFishConfigured } from '../config/env.js'

const UPSTREAM_SEARCH_URL = 'https://api.search.tinyfish.ai'
const UPSTREAM_FETCH_URL = 'https://api.fetch.tinyfish.ai'
const UPSTREAM_AGENT_RUN_SSE_URL = 'https://agent.tinyfish.ai/v1/automation/run-sse'

const SEARCH_TIMEOUT_MS = 15000
const FETCH_TIMEOUT_MS = 150000 // 150 seconds per official guidance

/**
 * Executes a web search query against the official TinyFish Search API.
 *
 * @param {Object} params
 * @param {string} params.query - Validated and trimmed search query
 * @returns {Promise<Object>} Structured upstream search response
 */
export async function executeSearch({ query }) {
  if (!isTinyFishConfigured()) {
    const error = new Error(
      'The search service is currently unavailable. Server API key is not configured in server/.env.'
    )
    error.status = 503
    throw error
  }

  const upstreamUrl = new URL(UPSTREAM_SEARCH_URL)
  upstreamUrl.searchParams.set('query', query)

  if (config.searchLocation) {
    upstreamUrl.searchParams.set('location', config.searchLocation)
  }

  if (config.searchLanguage) {
    upstreamUrl.searchParams.set('language', config.searchLanguage)
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS)

  let upstreamResponse
  try {
    upstreamResponse = await fetch(upstreamUrl.toString(), {
      method: 'GET',
      headers: {
        'X-API-Key': config.tinyfishApiKey,
        Accept: 'application/json',
      },
      signal: controller.signal,
    })
  } catch (fetchErr) {
    clearTimeout(timeoutId)
    if (fetchErr.name === 'AbortError') {
      const error = new Error('Upstream search request timed out after 15 seconds.')
      error.status = 502
      throw error
    }

    const error = new Error('Failed to reach upstream TinyFish search service.')
    error.status = 502
    throw error
  } finally {
    clearTimeout(timeoutId)
  }

  if (!upstreamResponse.ok) {
    const status = upstreamResponse.status
    let mappedStatus = 502
    let message = 'Upstream TinyFish search service reported an error.'

    if (status === 401 || status === 403) {
      mappedStatus = 401
      message = 'Invalid or unauthorized TinyFish API key.'
    } else if (status === 402) {
      mappedStatus = 402
      message = 'Upstream search allowance exhausted or account billing issue.'
    } else if (status === 429) {
      mappedStatus = 429
      message = 'Upstream TinyFish API rate limit exceeded. Please wait before retrying.'
    } else if (status >= 400 && status < 500) {
      mappedStatus = 400
      message = 'Upstream rejected the search request parameters.'
    }

    const error = new Error(message)
    error.status = mappedStatus
    throw error
  }

  let data
  try {
    data = await upstreamResponse.json()
  } catch {
    const error = new Error('Received an unparseable response from upstream search service.')
    error.status = 502
    throw error
  }

  const results = Array.isArray(data?.results) ? data.results : []
  return {
    query: typeof data?.query === 'string' ? data.query : query,
    results,
    total_results:
      typeof data?.total_results === 'number'
        ? data.total_results
        : results.length,
    page: typeof data?.page === 'number' ? data.page : 1,
  }
}

/**
 * Executes a webpage content extraction request against the official TinyFish Fetch API.
 *
 * @param {Object} params
 * @param {string[]} params.urls - Array of 1-10 validated public HTTP/HTTPS URLs
 * @param {string} [params.format='markdown'] - Output format: 'markdown' | 'html' | 'json'
 * @param {string|null} [params.purpose] - Optional purpose description (max 2000 chars)
 * @returns {Promise<Object>} Object containing results and errors arrays
 */
export async function executeFetch({ urls, format = 'markdown', purpose = null }) {
  if (!isTinyFishConfigured()) {
    const error = new Error(
      'The fetch service is currently unavailable. Server API key is not configured in server/.env.'
    )
    error.status = 503
    throw error
  }

  const payload = {
    urls,
    format,
  }

  if (purpose) {
    payload.purpose = purpose
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  let upstreamResponse
  try {
    upstreamResponse = await fetch(UPSTREAM_FETCH_URL, {
      method: 'POST',
      headers: {
        'X-API-Key': config.tinyfishApiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
  } catch (fetchErr) {
    clearTimeout(timeoutId)
    if (fetchErr.name === 'AbortError') {
      const error = new Error('Upstream fetch request timed out after 150 seconds.')
      error.status = 504
      throw error
    }

    const error = new Error('Failed to reach upstream TinyFish fetch service.')
    error.status = 502
    throw error
  } finally {
    clearTimeout(timeoutId)
  }

  if (!upstreamResponse.ok) {
    const status = upstreamResponse.status
    let mappedStatus = 502
    let message = 'Upstream TinyFish fetch service reported an error.'

    if (status === 401 || status === 403) {
      mappedStatus = 401
      message = 'Invalid or unauthorized TinyFish API key.'
    } else if (status === 402) {
      mappedStatus = 402
      message = 'TinyFish fetch allowance exhausted or insufficient wallet balance.'
    } else if (status === 429) {
      mappedStatus = 429
      message = 'Upstream TinyFish API rate limit exceeded. Please wait before retrying.'
    } else if (status >= 400 && status < 500) {
      mappedStatus = 400
      message = 'Upstream rejected the fetch request parameters.'
    }

    const error = new Error(message)
    error.status = mappedStatus
    throw error
  }

  let data
  try {
    data = await upstreamResponse.json()
  } catch {
    const error = new Error('Received an unparseable response from upstream fetch service.')
    error.status = 502
    throw error
  }

  return {
    results: Array.isArray(data?.results) ? data.results : [],
    errors: Array.isArray(data?.errors) ? data.errors : [],
  }
}

/**
 * Initiates an autonomous agent execution stream from the official TinyFish run-sse endpoint
 * and relays SSE events directly to the client response.
 *
 * @param {Object} params
 * @param {string} params.url - Validated starting URL
 * @param {string} params.goal - Goal instructions (max 2000 chars)
 * @param {number} [params.max_duration_seconds=180] - Maximum duration limit
 * @param {import('express').Response} res - Express response object for SSE streaming
 * @param {AbortSignal} clientSignal - Signal from client request disconnect
 */
export async function streamAgentRun({ url, goal, max_duration_seconds = 180 }, res, clientSignal) {
  if (!isTinyFishConfigured()) {
    const error = new Error(
      'The agent service is currently unavailable. Server API key is not configured in server/.env.'
    )
    error.status = 503
    throw error
  }

  const payload = {
    url,
    goal,
    agent_config: {
      max_duration_seconds: max_duration_seconds || 180,
    },
  }

  const upstreamController = new AbortController()

  // Handle client cancellation / disconnect
  if (clientSignal) {
    clientSignal.addEventListener('abort', () => {
      upstreamController.abort()
    })
  }

  // Safety ceiling: max_duration_seconds + 30s buffer
  const timeoutMs = (max_duration_seconds + 30) * 1000
  const timeoutId = setTimeout(() => upstreamController.abort(), timeoutMs)

  let upstreamResponse
  try {
    upstreamResponse = await fetch(UPSTREAM_AGENT_RUN_SSE_URL, {
      method: 'POST',
      headers: {
        'X-API-Key': config.tinyfishApiKey,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(payload),
      signal: upstreamController.signal,
    })
  } catch (fetchErr) {
    clearTimeout(timeoutId)
    if (fetchErr.name === 'AbortError') {
      const error = new Error(`Upstream agent run timed out after ${max_duration_seconds} seconds.`)
      error.status = 504
      throw error
    }

    const error = new Error('Failed to reach upstream TinyFish agent service.')
    error.status = 502
    throw error
  } finally {
    clearTimeout(timeoutId)
  }

  // If upstream returns an HTTP error before streaming starts, return sanitized error
  if (!upstreamResponse.ok) {
    const status = upstreamResponse.status
    let mappedStatus = 502
    let message = 'Upstream TinyFish agent service reported an error.'

    if (status === 401 || status === 403) {
      mappedStatus = 401
      message = 'Invalid or unauthorized TinyFish API key.'
    } else if (status === 402) {
      mappedStatus = 402
      message = 'Insufficient TinyFish wallet balance or run allowance exhausted.'
    } else if (status === 429) {
      mappedStatus = 429
      message = 'Upstream TinyFish Agent rate limit exceeded. Please wait before retrying.'
    } else if (status >= 400 && status < 500) {
      mappedStatus = 400
      message = 'Upstream rejected the agent execution parameters.'
    }

    const error = new Error(message)
    error.status = mappedStatus
    throw error
  }

  // Setup SSE headers on client response
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders()
  }

  // Stream chunks to the client without buffering the full stream
  if (!upstreamResponse.body) {
    res.write(`event: ERROR\ndata: ${JSON.stringify({ error: 'No response stream available' })}\n\n`)
    res.end()
    return
  }

  const reader = upstreamResponse.body.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(value)
      if (typeof res.flush === 'function') {
        res.flush()
      }
    }
  } catch (streamErr) {
    if (!res.writableEnded) {
      res.write(
        `event: ERROR\ndata: ${JSON.stringify({
          error: 'Agent stream interrupted or disconnected from upstream.',
        })}\n\n`
      )
    }
  } finally {
    if (!res.writableEnded) {
      res.end()
    }
  }
}
