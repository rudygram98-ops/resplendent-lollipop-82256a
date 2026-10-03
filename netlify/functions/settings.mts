import type { Config } from '@netlify/functions'
import { getUser, verifyRequestOrigin } from '@netlify/identity'
import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDatabase } from '../../db/index.js'
import { followRequests, follows, memberSettings, members } from '../../db/schema.js'
import { isQuietNow, isValidTimeZone, messagePolicies, readSettings, screenTimeOptions } from '../../db/settings.js'

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
}

const minuteOfDay = z.number().int().min(0).max(1439)

const settingsInput = z.object({
  messagePolicy: z.enum(messagePolicies),
  hiddenWords: z.array(z.string().trim().max(40)).max(80).transform((words) => [...new Set(words.map((word) => word.toLowerCase()).filter(Boolean))]).pipe(z.array(z.string()).max(50)),
  screenTimeMinutes: z.number().refine((value) => (screenTimeOptions as readonly number[]).includes(value)),
  isPrivate: z.boolean(),
  reviewTags: z.boolean(),
  allowDownloads: z.boolean(),
  allowRemixes: z.boolean(),
  quietMode: z.boolean(),
  quietStart: minuteOfDay,
  quietEnd: minuteOfDay,
  timeZone: z.string().min(1).max(64).refine(isValidTimeZone),
})

async function readAll(db: ReturnType<typeof getDatabase>, userId: string) {
  const settings = await readSettings(db, userId)
  const [member] = await db.select({ isPrivate: members.isPrivate }).from(members).where(eq(members.userId, userId)).limit(1)
  const [pending] = await db.select({ total: sql<number>`count(*)::int` }).from(followRequests).where(eq(followRequests.targetId, userId))
  return { ...settings, isPrivate: member?.isPrivate ?? false, quietNow: isQuietNow(settings), pendingRequests: pending.total }
}

export default async (request: Request) => {
  try {
    const user = await getUser()
    if (!user) return json({ error: 'Sign in to manage your settings.' }, 401)
    const db = getDatabase()
    if (request.method === 'GET') return json(await readAll(db, user.id))
    if (request.method !== 'PUT') return json({ error: 'Method not allowed.' }, 405)
    try { verifyRequestOrigin(request) } catch { return json({ error: 'This request must come from Buzzly.' }, 403) }
    const text = await request.text()
    if (text.length > 16_384) return json({ error: 'These settings are too large.' }, 413)
    let body: unknown
    try { body = JSON.parse(text) } catch { return json({ error: 'Invalid request.' }, 400) }
    const input = settingsInput.safeParse(body)
    if (!input.success) return json({ error: 'Use up to 50 hidden words of 40 characters or fewer, and choose valid options.' }, 400)
    const displayName = (user.name || 'Buzzly member').trim().slice(0, 60) || 'Buzzly member'
    const { isPrivate, ...settings } = input.data
    const values = { ...settings, updatedAt: new Date() }
    await db.transaction(async (transaction) => {
      await transaction.insert(members).values({ userId: user.id, displayName, isPrivate }).onConflictDoUpdate({ target: members.userId, set: { isPrivate } })
      await transaction.insert(memberSettings).values({ userId: user.id, ...values }).onConflictDoUpdate({ target: memberSettings.userId, set: values })
      if (!isPrivate) {
        const pending = await transaction.delete(followRequests).where(eq(followRequests.targetId, user.id)).returning({ requesterId: followRequests.requesterId })
        if (pending.length) await transaction.insert(follows).values(pending.map(({ requesterId }) => ({ followerId: requesterId, followingId: user.id }))).onConflictDoNothing()
      }
    })
    return json(await readAll(db, user.id))
  } catch {
    return json({ error: 'Settings are temporarily unavailable. Please try again shortly.' }, 503)
  }
}

export const config: Config = {
  path: '/api/settings',
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['domain', 'ip'] },
}
