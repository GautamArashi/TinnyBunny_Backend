/**
 * TinyFish Controller
 * Responsibility: Handles incoming HTTP requests for TinyFish operations,
 * validates parameters, delegates to tinyfish.service, and formats HTTP responses.
 */
import {
  executeSearch,
  executeFetch,
  streamAgentRun,
} from '../services/tinyfish.service.js'

export async function searchHandler(req, res, next) {
  try {
    const query = req.sanitizedQuery || req.body.query
    const searchData = await executeSearch({ query })
    res.status(200).json(searchData)
  } catch (error) {
    next(error)
  }
}

export async function fetchHandler(req, res, next) {
  try {
    const { urls, format, purpose } = req.sanitizedFetch || req.body
    const fetchData = await executeFetch({ urls, format, purpose })
    res.status(200).json(fetchData)
  } catch (error) {
    next(error)
  }
}

// Concurrency guard: only one active agent execution permitted at a time
let isAgentRunActive = false

export function getIsAgentRunActive() {
  return isAgentRunActive
}

export function resetAgentRunLock() {
  isAgentRunActive = false
}

export async function agentStreamHandler(req, res, next) {
  if (isAgentRunActive) {
    const error = new Error(
      'Another agent run is currently in progress. Only one concurrent agent execution is permitted to protect wallet funds.'
    )
    error.status = 409
    return next(error)
  }

  isAgentRunActive = true
  let lockReleased = false

  const releaseLock = () => {
    if (!lockReleased) {
      lockReleased = true
      isAgentRunActive = false
    }
  }

  // Ensure lock is released if client aborts or stream closes
  res.on('close', releaseLock)
  res.on('finish', releaseLock)

  try {
    const { url, goal, max_duration_seconds } = req.sanitizedAgent || req.body
    const clientSignal = req.signal
    await streamAgentRun({ url, goal, max_duration_seconds }, res, clientSignal)
  } catch (error) {
    releaseLock()
    if (!res.headersSent) {
      next(error)
    } else if (!res.writableEnded) {
      res.write(`event: ERROR\ndata: ${JSON.stringify({ error: error.message })}\n\n`)
      res.end()
    }
  } finally {
    releaseLock()
  }
}
