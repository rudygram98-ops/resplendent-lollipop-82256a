import type { Config, Context } from '@netlify/functions'
import { getUser, verifyRequestOrigin } from '@netlify/identity'
import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDatabase } from '../../db/index.js'
import { followRequests, members, notifications } from '../../db/schema.js'
import { isQuietNow, readSettings } from '../../db/settings.js'

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
}

export default async (request: Request, context: Context) => {
  try {
    const user = await getUser()
    if (!user) return json({ error: 'Sign in to see your notifications.' }, 401)
    const db = getDatabase()
    const { action } = context.params
    const mine = eq(notifications.recipientId, user.id)

    if (action === 'summary' && request.method === 'GET') {
      const quiet = isQuietNow(await readSettings(db, user.id))
      const [unread] = await db.select({ total: sql<number>`count(*)::int` }).from(notifications).where(and(mine, isNull(notifications.readAt)))
      return json({ unread: unread.total, alerts: quiet ? 0 : unread.total, quiet })
    }

    if (action === 'read' && request.method === 'POST') {
      try { verifyRequestOrigin(request) } catch { return json({ error: 'This request must come from Buzzly.' }, 403) }
      await db.update(notifications).set({ readAt: new Date() }).where(and(mine, isNull(notifications.readAt)))
      return json({ read: true })
    }

    if (!action && request.method === 'GET') {
      const raw = new URL(request.url).searchParams.get('cursor')
      let cursor
      if (raw) {
        const [date, id] = raw.split('|')
        if (!z.iso.datetime().safeParse(date).success || !z.uuid().safeParse(id).success) return json({ error: 'Invalid notification cursor.' }, 400)
        cursor = or(lt(notifications.createdAt, new Date(date)), and(eq(notifications.createdAt, new Date(date)), lt(notifications.id, id)))
      }
      const rows = await db.select({
        id: notifications.id, type: notifications.type, postId: notifications.postId, createdAt: notifications.createdAt,
        read: sql<boolean>`${notifications.readAt} is not null`,
        actor: { id: members.userId, name: members.displayName },
        pending: sql<boolean>`exists (select 1 from ${followRequests} where ${followRequests.requesterId} = ${notifications.actorId} and ${followRequests.targetId} = ${user.id})`,
      }).from(notifications).innerJoin(members, eq(members.userId, notifications.actorId)).where(and(mine, cursor)).orderBy(desc(notifications.createdAt), desc(notifications.id)).limit(31)
      const page = rows.slice(0, 30)
      const last = page.at(-1)
      return json({ notifications: page.map((row) => ({ ...row, pending: row.type === 'follow_request' && row.pending })), nextCursor: rows.length > 30 && last ? `${last.createdAt.toISOString()}|${last.id}` : null })
    }
    return json({ error: 'Not found.' }, 404)
  } catch {
    return json({ error: 'Notifications are temporarily unavailable. Please try again shortly.' }, 503)
  }
}

export const config: Config = {
  path: ['/api/notifications', '/api/notifications/:action'],
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ['domain', 'ip'] },
}
