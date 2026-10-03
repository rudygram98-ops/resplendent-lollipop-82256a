import type { Config, Context } from '@netlify/functions'
import { and, desc, eq, gt, lt, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDatabase } from '../../db/index.js'
import { blocks, conversations, messages, profiles } from '../../db/schema.js'
import { authorize, avatarUrl, ensureProfile, handleError, isBlockedBetween, json, readJson, RequestError } from '../lib/http.js'

function parseCursor(cursor: string) {
  const [date, id] = cursor.split('|')
  if (!z.iso.datetime().safeParse(date).success || !z.uuid().safeParse(id).success) throw new RequestError('Invalid message cursor.')
  return { date: new Date(date), id }
}

export default async (request: Request, context: Context) => {
  try {
    const user = await authorize(request)
    const db = getDatabase()
    const { id } = context.params
    const url = new URL(request.url)
    const otherId = sql<string>`case when ${conversations.userA} = ${user.id} then ${conversations.userB} else ${conversations.userA} end`
    const mine = or(eq(conversations.userA, user.id), eq(conversations.userB, user.id))

    if (!id && request.method === 'GET') {
      const rows = await db.select({
        id: conversations.id, lastMessageAt: conversations.lastMessageAt, otherId,
        username: profiles.username, displayName: profiles.displayName, avatarKey: profiles.avatarKey,
        readAt: sql<string | null>`case when ${conversations.userA} = ${user.id} then ${conversations.readA} else ${conversations.readB} end`,
        lastContent: sql<string | null>`(select ${messages.content} from ${messages} where ${messages.conversationId} = ${conversations.id} order by ${messages.createdAt} desc, ${messages.id} desc limit 1)`,
        lastSender: sql<string | null>`(select ${messages.senderId} from ${messages} where ${messages.conversationId} = ${conversations.id} order by ${messages.createdAt} desc, ${messages.id} desc limit 1)`,
        blocked: sql<boolean>`exists (select 1 from ${blocks} where (${blocks.blockerId} = ${user.id} and ${blocks.blockedId} = ${otherId}) or (${blocks.blockerId} = ${otherId} and ${blocks.blockedId} = ${user.id}))`,
      }).from(conversations).leftJoin(profiles, sql`${profiles.userId} = ${otherId}`)
        .where(and(mine, sql`exists (select 1 from ${messages} where ${messages.conversationId} = ${conversations.id})`))
        .orderBy(desc(conversations.lastMessageAt)).limit(100)
      const list = rows.map(({ avatarKey, readAt, lastSender, otherId: other, ...row }) => ({
        ...row,
        other: { userId: other, username: row.username || 'member', displayName: row.displayName || 'Buzzly member', avatarUrl: avatarUrl(other, avatarKey) },
        unread: Boolean(lastSender && lastSender !== user.id && (!readAt || new Date(readAt) < row.lastMessageAt)),
      })).map(({ username, displayName, ...row }) => row)
      return json({ conversations: list, unreadCount: list.filter((item) => item.unread).length })
    }

    if (!id && request.method === 'POST') {
      const input = z.object({ userId: z.string().min(1).max(100) }).safeParse(await readJson(request))
      if (!input.success) throw new RequestError('Choose someone to message.')
      const recipient = input.data.userId
      if (recipient === user.id) throw new RequestError('You can’t start a conversation with yourself.')
      await ensureProfile(user)
      const [profile] = await db.select({ userId: profiles.userId }).from(profiles).where(eq(profiles.userId, recipient)).limit(1)
      if (!profile) throw new RequestError('This member hasn’t set up messaging yet.', 404)
      if (await isBlockedBetween(user.id, recipient)) throw new RequestError('You can’t message this member.', 403)
      const [userA, userB] = [user.id, recipient].sort()
      await db.insert(conversations).values({ userA, userB }).onConflictDoNothing()
      const [conversation] = await db.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.userA, userA), eq(conversations.userB, userB))).limit(1)
      return json({ id: conversation.id }, 201)
    }

    if (!id || !z.uuid().safeParse(id).success) throw new RequestError('That conversation could not be found.', 404)
    const [conversation] = await db.select().from(conversations).where(and(eq(conversations.id, id), mine)).limit(1)
    if (!conversation) throw new RequestError('That conversation could not be found.', 404)
    const other = conversation.userA === user.id ? conversation.userB : conversation.userA
    const markRead = (date: Date) => conversation.userA === user.id ? { readA: date } : { readB: date }

    if (request.method === 'GET') {
      const after = url.searchParams.get('after')
      const before = url.searchParams.get('before')
      let rows
      let olderCursor: string | null = null
      if (after) {
        const cursor = parseCursor(after)
        rows = await db.select().from(messages).where(and(eq(messages.conversationId, id), or(gt(messages.createdAt, cursor.date), and(eq(messages.createdAt, cursor.date), gt(messages.id, cursor.id)))))
          .orderBy(messages.createdAt, messages.id).limit(100)
      } else {
        const cursor = before ? parseCursor(before) : null
        const older = await db.select().from(messages).where(and(eq(messages.conversationId, id), cursor ? or(lt(messages.createdAt, cursor.date), and(eq(messages.createdAt, cursor.date), lt(messages.id, cursor.id))) : undefined))
          .orderBy(desc(messages.createdAt), desc(messages.id)).limit(51)
        rows = older.slice(0, 50).reverse()
        if (older.length > 50) olderCursor = `${rows[0].createdAt.toISOString()}|${rows[0].id}`
      }
      await db.update(conversations).set(markRead(new Date())).where(eq(conversations.id, id))
      return json({ messages: rows, olderCursor, blocked: await isBlockedBetween(user.id, other) })
    }

    if (request.method === 'POST') {
      const input = z.object({ content: z.string().trim().min(1).max(2000) }).safeParse(await readJson(request))
      if (!input.success) throw new RequestError('Write a message between 1 and 2,000 characters.')
      if (await isBlockedBetween(user.id, other)) throw new RequestError('You can’t message this member.', 403)
      const [message] = await db.insert(messages).values({ conversationId: id, senderId: user.id, content: input.data.content }).returning()
      await db.update(conversations).set({ lastMessageAt: message.createdAt, ...markRead(message.createdAt) }).where(eq(conversations.id, id))
      return json(message, 201)
    }

    return json({ error: 'Method not allowed.' }, 405)
  } catch (error) {
    return handleError(error)
  }
}

export const config: Config = {
  path: ['/api/messages', '/api/messages/:id'],
  rateLimit: { windowLimit: 300, windowSize: 60, aggregateBy: ['domain', 'ip'] },
}
