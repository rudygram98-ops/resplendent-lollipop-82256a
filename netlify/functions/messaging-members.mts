import type { UserDeletedEvent, UserModifiedEvent } from '@netlify/functions'
import { eq } from 'drizzle-orm'
import { getDatabase } from '../../db/index.js'
import { members } from '../../db/schema.js'

export default {
  async userModified(event: UserModifiedEvent) {
    const displayName = (event.user.name || 'Buzzly member').trim().slice(0, 60) || 'Buzzly member'
    await getDatabase().update(members).set({ displayName, updatedAt: new Date() }).where(eq(members.userId, event.user.id)).catch(() => undefined)
  },
  async userDeleted(event: UserDeletedEvent) {
    await getDatabase().delete(members).where(eq(members.userId, event.user.id))
  },
}
