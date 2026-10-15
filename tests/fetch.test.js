/**
 * Fetch Endpoint & URL Security Integration Tests
 * Responsibility: Verifies input validation, SSRF security guards, format checks,
 * API key enforcement, and mocked upstream response handling for POST /api/tinyfish/fetch.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { app } from '../src/app.js'
import { config } from '../src/config/env.js'
import { validateFetchUrl } from '../src/utils/urlValidator.js'

let server
let baseUrl

test.before(async () => {
  return new Promise((resolve) => {
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

test('validateFetchUrl correctly identifies public and restricted URLs', () => {
  // Valid public URLs
  assert.equal(validateFetchUrl('https://example.com').valid, true)
  assert.equal(validateFetchUrl('http://sub.domain.org/path?q=1').valid, true)
  assert.equal(validateFetchUrl('https://docs.tinyfish.ai/reference').valid, true)

  // Malformed or non-http
  assert.equal(validateFetchUrl('not-a-url').valid, false)
  assert.equal(validateFetchUrl('ftp://example.com').valid, false)
  assert.equal(validateFetchUrl('').valid, false)

  // Localhost & loopback
  assert.equal(validateFetchUrl('http://localhost:3000').valid, false)
  assert.equal(validateFetchUrl('http://app.localhost').valid, false)
  assert.equal(validateFetchUrl('http://127.0.0.1:5000').valid, false)
  assert.equal(validateFetchUrl('http://127.0.0.2').valid, false)
  assert.equal(validateFetchUrl('http://[::1]').valid, false)

  // Private RFC 1918 ranges
  assert.equal(validateFetchUrl('http://10.0.0.1/admin').valid, false)
  assert.equal(validateFetchUrl('http://172.16.0.1').valid, false)
  assert.equal(validateFetchUrl('http://192.168.1.1').valid, false)

  // Link-local & Cloud metadata
  assert.equal(validateFetchUrl('http://169.254.169.254/latest/meta-data').valid, false)
  assert.equal(validateFetchUrl('http://metadata.google.internal').valid, false)
})

test('POST /api/tinyfish/fetch rejects non-array or empty urls with 400', async () => {
  const res1 = await fetch(`${baseUrl}/api/tinyfish/fetch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls: 'https://example.com' }),
  })
  assert.equal(res1.status, 400)
  const d1 = await res1.json()
  assert.match(d1.error.message, /must be an array/)

  const res2 = await fetch(`${baseUrl}/api/tinyfish/fetch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls: [] }),
  })
  assert.equal(res2.status, 400)
  const d2 = await res2.json()
  assert.match(d2.error.message, /at least one URL/)
})

test('POST /api/tinyfish/fetch rejects more than 10 URLs with 400', async () => {
  const tooManyUrls = Array.from({ length: 11 }, (_, i) => `https://example${i}.com`)
  const res = await fetch(`${baseUrl}/api/tinyfish/fetch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls: tooManyUrls }),
  })
  assert.equal(res.status, 400)
  const data = await res.json()
  assert.match(data.error.message, /Cannot fetch more than 10 URLs/)
})

test('POST /api/tinyfish/fetch rejects restricted and invalid URLs with 400', async () => {
  const resLocal = await fetch(`${baseUrl}/api/tinyfish/fetch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls: ['http://localhost:5000/api/health'] }),
  })
  assert.equal(resLocal.status, 400)
  const dLocal = await resLocal.json()
  assert.match(dLocal.error.message, /restricted or private destination/i)

  const resMeta = await fetch(`${baseUrl}/api/tinyfish/fetch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls: ['http://169.254.169.254/metadata'] }),
  })
  assert.equal(resMeta.status, 400)
  const dMeta = await resMeta.json()
  assert.match(dMeta.error.message, /Private or loopback IP destination/i)
})

test('POST /api/tinyfish/fetch rejects unsupported format with 400', async () => {
  const res = await fetch(`${baseUrl}/api/tinyfish/fetch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      urls: ['https://example.com'],
      format: 'xml',
    }),
  })
  assert.equal(res.status, 400)
  const data = await res.json()
  assert.match(data.error.message, /Invalid format "xml"/)
})

test('POST /api/tinyfish/fetch rejects purpose longer than 2000 characters with 400', async () => {
  const longPurpose = 'x'.repeat(2001)
  const res = await fetch(`${baseUrl}/api/tinyfish/fetch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      urls: ['https://example.com'],
      purpose: longPurpose,
    }),
  })
  assert.equal(res.status, 400)
  const data = await res.json()
  assert.match(data.error.message, /cannot exceed 2000 characters/)
})

test('POST /api/tinyfish/fetch returns 503 when API key is not configured', async () => {
  if (!config.tinyfishApiKey) {
    const res = await fetch(`${baseUrl}/api/tinyfish/fetch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: ['https://example.com'] }),
    })
    assert.equal(res.status, 503)
    const data = await res.json()
    assert.match(data.error.message, /Server API key is not configured/)
  }
})

test('POST /api/tinyfish/fetch handles successful upstream response with mock', async (t) => {
  const originalKey = config.tinyfishApiKey
  config.tinyfishApiKey = 'test_mock_api_key'

  const originalFetch = globalThis.fetch
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (typeof url === 'string' && url.includes('api.fetch.tinyfish.ai')) {
      return new Response(
        JSON.stringify({
          results: [
            {
              url: 'https://example.com',
              final_url: 'https://example.com/',
              title: 'Example Domain',
              description: 'Example website',
              language: 'en',
              text: '# Example Domain\n\nThis is the extracted content.',
              format: 'markdown',
            },
          ],
          errors: [],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }
    return originalFetch(url, options)
  })

  try {
    const res = await fetch(`${baseUrl}/api/tinyfish/fetch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        urls: ['https://example.com'],
        format: 'markdown',
      }),
    })

    assert.equal(res.status, 200)
    const data = await res.json()
    assert.equal(Array.isArray(data.results), true)
    assert.equal(data.results.length, 1)
    assert.equal(data.results[0].title, 'Example Domain')
    assert.equal(data.errors.length, 0)
  } finally {
    config.tinyfishApiKey = originalKey
  }
})

test('POST /api/tinyfish/fetch handles mixed successful and failed URLs with mock', async (t) => {
  const originalKey = config.tinyfishApiKey
  config.tinyfishApiKey = 'test_mock_api_key'

  const originalFetch = globalThis.fetch
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (typeof url === 'string' && url.includes('api.fetch.tinyfish.ai')) {
      return new Response(
        JSON.stringify({
          results: [
            {
              url: 'https://site-a.com',
              title: 'Site A',
              text: 'Content of Site A',
              format: 'markdown',
            },
          ],
          errors: [
            {
              url: 'https://site-b.com',
              error: 'Target server returned 404 Not Found',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }
    return originalFetch(url, options)
  })

  try {
    const res = await fetch(`${baseUrl}/api/tinyfish/fetch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        urls: ['https://site-a.com', 'https://site-b.com'],
      }),
    })

    assert.equal(res.status, 200)
    const data = await res.json()
    assert.equal(data.results.length, 1)
    assert.equal(data.results[0].url, 'https://site-a.com')
    assert.equal(data.errors.length, 1)
    assert.equal(data.errors[0].url, 'https://site-b.com')
  } finally {
    config.tinyfishApiKey = originalKey
  }
})

test('POST /api/tinyfish/fetch maps upstream 402 allowance error with mock', async (t) => {
  const originalKey = config.tinyfishApiKey
  config.tinyfishApiKey = 'test_mock_api_key'

  const originalFetch = globalThis.fetch
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (typeof url === 'string' && url.includes('api.fetch.tinyfish.ai')) {
      return new Response(JSON.stringify({ message: 'Insufficient balance' }), {
        status: 402,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return originalFetch(url, options)
  })

  try {
    const res = await fetch(`${baseUrl}/api/tinyfish/fetch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: ['https://example.com'] }),
    })

    assert.equal(res.status, 402)
    const data = await res.json()
    assert.match(data.error.message, /allowance exhausted|insufficient wallet balance/i)
  } finally {
    config.tinyfishApiKey = originalKey
  }
})
