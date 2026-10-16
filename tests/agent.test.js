/**
 * Agent Endpoint & SSE Streaming Integration Tests
 * Responsibility: Verifies input validation, SSRF security, API key checks,
 * streaming event relay, chunk handling, and failure modes for POST /api/tinyfish/agent/stream.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { app } from '../src/app.js'
import { config } from '../src/config/env.js'

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

test('POST /api/tinyfish/agent/stream rejects missing or invalid starting URL with 400', async () => {
  const resMissing = await fetch(`${baseUrl}/api/tinyfish/agent/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ goal: 'Extract information' }),
  })
  assert.equal(resMissing.status, 400)
  const dMissing = await resMissing.json()
  assert.match(dMissing.error.message, /Starting URL is required/)

  const resLocal = await fetch(`${baseUrl}/api/tinyfish/agent/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'http://localhost:5000', goal: 'Extract information' }),
  })
  assert.equal(resLocal.status, 400)
  const dLocal = await resLocal.json()
  assert.match(dLocal.error.message, /restricted or private destination/i)
})

test('POST /api/tinyfish/agent/stream rejects empty or oversized goal with 400', async () => {
  const resEmpty = await fetch(`${baseUrl}/api/tinyfish/agent/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com', goal: '   ' }),
  })
  assert.equal(resEmpty.status, 400)
  const dEmpty = await resEmpty.json()
  assert.match(dEmpty.error.message, /Goal cannot be empty/)

  const longGoal = 'a'.repeat(2001)
  const resLong = await fetch(`${baseUrl}/api/tinyfish/agent/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com', goal: longGoal }),
  })
  assert.equal(resLong.status, 400)
  const dLong = await resLong.json()
  assert.match(dLong.error.message, /cannot exceed 2000 characters/)
})

test('POST /api/tinyfish/agent/stream returns 503 when API key is not configured', async () => {
  if (!config.tinyfishApiKey) {
    const res = await fetch(`${baseUrl}/api/tinyfish/agent/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://example.com',
        goal: 'Valid safe research goal',
      }),
    })
    assert.equal(res.status, 503)
    const data = await res.json()
    assert.match(data.error.message, /Server API key is not configured/)
  }
})

test('POST /api/tinyfish/agent/stream relays SSE events (STARTED, STREAMING_URL, PROGRESS, HEARTBEAT, COMPLETE)', async (t) => {
  const originalKey = config.tinyfishApiKey
  config.tinyfishApiKey = 'test_mock_agent_key'

  const mockEvents = [
    'event: STARTED\ndata: {"type":"STARTED","run_id":"run_abc123"}\n\n',
    'event: STREAMING_URL\ndata: {"type":"STREAMING_URL","url":"https://streaming.tinyfish.ai/run_abc123","streaming_url":"https://tf-run_abc123.fra0-tinyfish.unikraft.app/stream/0"}\n\n',
    'event: PROGRESS\ndata: {"type":"PROGRESS","message":"Navigating to categories"}\n\n',
    'event: HEARTBEAT\ndata: {"type":"HEARTBEAT"}\n\n',
    'event: COMPLETE\ndata: {"type":"COMPLETE","status":"COMPLETED","num_of_steps":5,"result":{"categories":["Electronics","Books"]}}\n\n',
  ]

  const originalFetch = globalThis.fetch
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (typeof url === 'string' && url.includes('agent.tinyfish.ai')) {
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder()
          for (const ev of mockEvents) {
            controller.enqueue(encoder.encode(ev))
          }
          controller.close()
        },
      })
      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
      })
    }
    return originalFetch(url, options)
  })

  try {
    const res = await fetch(`${baseUrl}/api/tinyfish/agent/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://example.com',
        goal: 'Find categories',
      }),
    })

    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type'), /text\/event-stream/)

    const text = await res.text()
    assert.match(text, /STARTED/)
    assert.match(text, /run_abc123/)
    assert.match(text, /STREAMING_URL/)
    assert.match(text, /streaming_url/)
    assert.match(text, /unikraft\.app/)
    assert.match(text, /PROGRESS/)
    assert.match(text, /HEARTBEAT/)
    assert.match(text, /COMPLETE/)
    assert.match(text, /"num_of_steps":5/)
  } finally {
    config.tinyfishApiKey = originalKey
  }
})

test('POST /api/tinyfish/agent/stream handles upstream 401 error', async (t) => {
  const originalKey = config.tinyfishApiKey
  config.tinyfishApiKey = 'invalid_key'

  const originalFetch = globalThis.fetch
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (typeof url === 'string' && url.includes('agent.tinyfish.ai')) {
      return new Response(JSON.stringify({ error: 'Unauthorized key' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return originalFetch(url, options)
  })

  try {
    const res = await fetch(`${baseUrl}/api/tinyfish/agent/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://example.com',
        goal: 'Find categories',
      }),
    })

    assert.equal(res.status, 401)
    const data = await res.json()
    assert.match(data.error.message, /Invalid or unauthorized TinyFish API/i)
  } finally {
    config.tinyfishApiKey = originalKey
  }
})

test('POST /api/tinyfish/agent/stream handles upstream 402 wallet balance error', async (t) => {
  const originalKey = config.tinyfishApiKey
  config.tinyfishApiKey = 'test_mock_agent_key'

  const originalFetch = globalThis.fetch
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (typeof url === 'string' && url.includes('agent.tinyfish.ai')) {
      return new Response(JSON.stringify({ message: 'Insufficient funds' }), {
        status: 402,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return originalFetch(url, options)
  })

  try {
    const res = await fetch(`${baseUrl}/api/tinyfish/agent/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://example.com',
        goal: 'Find categories',
      }),
    })

    assert.equal(res.status, 402)
    const data = await res.json()
    assert.match(data.error.message, /wallet balance|allowance exhausted/i)
  } finally {
    config.tinyfishApiKey = originalKey
  }
})

test('POST /api/tinyfish/agent/stream rejects concurrent executions with 409 Conflict', async (t) => {
  const originalKey = config.tinyfishApiKey
  config.tinyfishApiKey = 'test_mock_agent_key'

  let resolveFirstStream
  const firstStreamWait = new Promise((resolve) => {
    resolveFirstStream = resolve
  })

  const originalFetch = globalThis.fetch
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (typeof url === 'string' && url.includes('agent.tinyfish.ai')) {
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder()
          controller.enqueue(encoder.encode('event: STARTED\ndata: {"type":"STARTED","run_id":"run_first"}\n\n'))
          await firstStreamWait
          controller.enqueue(encoder.encode('event: COMPLETE\ndata: {"type":"COMPLETE"}\n\n'))
          controller.close()
        },
      })
      return new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }
    return originalFetch(url, options)
  })

  try {
    // Start first run (stays active until resolveFirstStream is called)
    const firstPromise = fetch(`${baseUrl}/api/tinyfish/agent/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com', goal: 'First run' }),
    })

    // Allow first run request to reach the server and engage lock
    await new Promise((r) => setTimeout(r, 60))

    // Attempt second concurrent run
    const secondRes = await fetch(`${baseUrl}/api/tinyfish/agent/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com', goal: 'Second run' }),
    })

    assert.equal(secondRes.status, 409)
    const secondData = await secondRes.json()
    assert.match(secondData.error.message, /Another agent run is currently in progress/i)

    // Release first run
    resolveFirstStream()
    const firstRes = await firstPromise
    assert.equal(firstRes.status, 200)
    await firstRes.text()
  } finally {
    config.tinyfishApiKey = originalKey
  }
})

