import { and, eq, isNull } from 'drizzle-orm'
import type { getDatabase } from './index.js'
import { members, notifications } from './schema.js'

export type NotificationType = 'follow_request' | 'follow_accepted' | 'tag' | 'comment' | 'like' | 'remix' | 'message'

export async function notify(db: ReturnType<typeof getDatabase>, input: { recipientId: string; actorId: string; actorName: string; type: NotificationType; postId?: string | null; collapse?: boolean }) {
  if (input.recipientId === input.actorId) return
  try {
    const [recipient] = await db.select({ id: members.userId }).from(members).where(eq(members.userId, input.recipientId)).limit(1)
    if (!recipient) return
    await db.insert(members).values({ userId: input.actorId, displayName: input.actorName }).onConflictDoNothing()
    if (input.collapse) {
      const [unread] = await db.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.recipientId, input.recipientId), eq(notifications.actorId, input.actorId), eq(notifications.type, input.type), isNull(notifications.readAt))).limit(1)
      if (unread) return
    }
    await db.insert(notifications).values({ recipientId: input.recipientId, actorId: input.actorId, type: input.type, postId: input.postId ?? null })
  } catch {}
}
