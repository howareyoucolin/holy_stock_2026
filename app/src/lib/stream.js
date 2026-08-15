/*
 * A round takes minutes, and until it lands the browser has nothing to show but
 * a spinner. These handlers therefore answer with NDJSON — one JSON object per
 * line — so the sidebar log can report each agent the moment it settles:
 *
 *     {"type":"agent","agent":{"id":"claude","status":"done","ms":139204,...}}
 *     {"type":"agent","agent":{"id":"codex","status":"error",...}}
 *     {"type":"result","effort":"medium","results":[...]}
 *
 * The closing `result` line carries exactly the object the endpoint used to
 * return whole, so the rounds that follow are unchanged — only the wait got
 * narrated.
 */
export function ndjsonRun(run) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let open = true

      const write = (event) => {
        if (!open) return

        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        } catch {
          // The browser hung up mid-round. The abort signal is already tearing
          // the CLIs down; there is simply nowhere left to write.
          open = false
        }
      }

      try {
        write({ type: 'result', ...(await run(write)) })
      } catch (error) {
        // Too late for a 500: the status line went out with the first chunk, so
        // failures have to travel as an event.
        write({ type: 'error', error: error.message })
      }

      open = false

      try {
        controller.close()
      } catch {
        // Already closed by the disconnect.
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      // Buffering anywhere in front of us would defeat the point: the log needs
      // each line as it happens, not the whole round at the end.
      'X-Accel-Buffering': 'no',
    },
  })
}
