import { readFileSync } from 'node:fs'
import path from 'node:path'

/*
 * The publishing key, read from `.secrets` at the project root — beside `.env`
 * and `.agents`, and gitignored like them.
 *
 * It is read here, server-side, and forwarded to the PHP endpoint. It is never
 * sent to the browser: the console's own POST carries no key, so the secret
 * never leaves this machine except over HTTPS to the site that validates it.
 *
 * Accepted formats, so the file can be a one-liner or an env-style block:
 *
 *     publish_secret=xxxxxxxx
 *     xxxxxxxx
 */
const SECRETS_FILE = () => path.resolve(process.cwd(), '..', '.secrets')

const KEY_NAME = 'publish_secret'

export function readPublishSecret() {
  let contents

  try {
    contents = readFileSync(SECRETS_FILE(), 'utf8')
  } catch {
    return null
  }

  let bareLine = null

  for (const rawLine of contents.split('\n')) {
    const line = rawLine.replace(/#.*$/, '').trim()

    if (line === '') continue

    const separator = line.indexOf('=')

    if (separator === -1) {
      // Remember the first bare line, but keep looking for an explicit key.
      bareLine ??= line
      continue
    }

    if (line.slice(0, separator).trim().toLowerCase() === KEY_NAME) {
      const value = line.slice(separator + 1).trim()

      if (value !== '') return value
    }
  }

  return bareLine
}
