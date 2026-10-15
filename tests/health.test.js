/**
 * Health Endpoint & Search Validation Integration Tests
 * Responsibility: Verifies the functionality of /api/health and search request validation
 * using Node.js built-in test runner.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { app } from '../src/app.js'

let server
let baseUrl

test.before(async () => {
  return new Promise((resolve) => {
    // Listen on ephemeral port for testing
    server = app.listen(0, () => {
      const port = server.address().port
      baseUrl = `http://localhost:${port}`
      resolve()
    })
  })
})

test.after(async () => {
  return new Promise((resolve) => {
    server.close(() => resolve())
  })
})

test('GET /api/health returns 200 OK with status and service check', async () => {
  const res = await fetch(`${baseUrl}/api/health`)
  assert.equal(res.status, 200)

  const data = await res.json()
  assert.equal(data.status, 'ok')
  assert.equal(typeof data.uptime, 'number')
  assert.equal(typeof data.services?.tinyfishConfigured, 'boolean')
})

test('POST /api/tinyfish/search rejects empty or missing query with 400', async () => {
  const resEmpty = await fetch(`${baseUrl}/api/tinyfish/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: '   ' }),
  })
  assert.equal(resEmpty.status, 400)
  const dataEmpty = await resEmpty.json()
  assert.equal(dataEmpty.error.message, 'Search query cannot be empty.')

  const resMissing = await fetch(`${baseUrl}/api/tinyfish/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  assert.equal(resMissing.status, 400)
  const dataMissing = await resMissing.json()
  assert.equal(dataMissing.error.message, 'Search query must be a string.')
})

test('POST /api/tinyfish/search rejects query exceeding 500 characters with 400', async () => {
  const longQuery = 'a'.repeat(501)
  const res = await fetch(`${baseUrl}/api/tinyfish/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: longQuery }),
  })
  assert.equal(res.status, 400)
  const data = await res.json()
  assert.equal(data.error.message, 'Search query cannot exceed 500 characters.')
})

test('POST /api/tinyfish/search returns 503 when API key is not configured', async () => {
  // If TINYFISH_API_KEY is not configured in environment, it must yield 503
  if (!process.env.TINYFISH_API_KEY) {
    const res = await fetch(`${baseUrl}/api/tinyfish/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'valid search query' }),
    })
    assert.equal(res.status, 503)
    const data = await res.json()
    assert.match(data.error.message, /Server API key is not configured/)
  }
})

test('GET /api/unknown returns 404 with structured error', async () => {
  const res = await fetch(`${baseUrl}/api/nonexistent`)
  assert.equal(res.status, 404)
  const data = await res.json()
  assert.equal(data.error.status, 404)
})
