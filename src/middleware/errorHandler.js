/**
 * Error Handler Middleware
 * Responsibility: Centralized Express error-handling middleware that catches,
 * sanitizes, and formats structured JSON error responses without exposing secrets
 * or internal server traces.
 */
export function errorHandler(err, req, res, next) {
  const status = typeof err.status === 'number' && err.status >= 400 && err.status <= 599
    ? err.status
    : 500

  // Standard sanitized status messages
  let message = err.message || 'An unexpected internal server error occurred.'

  if (status === 500) {
    message = 'An internal server error occurred while processing your request.'
  } else if (status === 401) {
    message = 'Invalid or unauthorized TinyFish API credentials.'
  } else if (status === 402) {
    message = err.message || 'TinyFish service allowance exceeded or insufficient wallet balance on account.'
  } else if (status === 429) {
    message = err.message || 'Rate limit exceeded. Please slow down and try again shortly.'
  } else if (status === 502) {
    message = err.message || 'The upstream TinyFish service is temporarily unavailable or returned an invalid response.'
  } else if (status === 503) {
    message = err.message || 'The requested service is currently unavailable. Server API key is not configured.'
  } else if (status === 504) {
    message = err.message || 'The upstream request timed out.'
  }

  res.status(status).json({
    error: {
      message,
      status,
    },
  })
}
