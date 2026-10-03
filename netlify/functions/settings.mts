import type { Config } from '@netlify/functions'
import { getUser, verifyRequestOrigin } from '@netlify/identity'
import { z } from 'zod'
import { getDatabase } from '../../db/index.js'
import { memberSettings, members } from '../../db/schema.js'
import { messagePolicies, readSettings, screenTimeOptions } from '../../db/settings.js'

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
}

const settingsInput = z.object({
  messagePolicy: z.enum(messagePolicies),
  hiddenWords: z.array(z.string().trim().max(40)).max(80).transform((words) => [...new Set(words.map((word) => word.toLowerCase()).filter(Boolean))]).pipe(z.array(z.string()).max(50)),
  screenTimeMinutes: z.number().refine((value) => (screenTimeOptions as readonly number[]).includes(value)),
})

export default async (request: Request) => {
  try {
    const user = await getUser()
    if (!user) return json({ error: 'Sign in to manage your settings.' }, 401)
    const db = getDatabase()
    if (request.method === 'GET') return json(await readSettings(db, user.id))
    if (request.method !== 'PUT') return json({ error: 'Method not allowed.' }, 405)
    try { verifyRequestOrigin(request) } catch { return json({ error: 'This request must come from Buzzly.' }, 403) }
    const text = await request.text()
    if (text.length > 16_384) return json({ error: 'These settings are too large.' }, 413)
    let body: unknown
    try { body = JSON.parse(text) } catch { return json({ error: 'Invalid request.' }, 400) }
    const input = settingsInput.safeParse(body)
    if (!input.success) return json({ error: 'Use up to 50 hidden words of 40 characters or fewer, and choose valid options.' }, 400)
    const displayName = (user.name || 'Buzzly member').trim().slice(0, 60) || 'Buzzly member'
    const values = { ...input.data, updatedAt: new Date() }
    await db.transaction(async (transaction) => {
      await transaction.insert(members).values({ userId: user.id, displayName }).onConflictDoNothing()
      await transaction.insert(memberSettings).values({ userId: user.id, ...values }).onConflictDoUpdate({ target: memberSettings.userId, set: values })
    })
    return json(input.data)
  } catch {
    return json({ error: 'Settings are temporarily unavailable. Please try again shortly.' }, 503)
  }
}

export const config: Config = {
  path: '/api/settings',
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['domain', 'ip'] },
}
