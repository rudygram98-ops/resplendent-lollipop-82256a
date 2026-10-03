import type { Config, Context } from '@netlify/functions'
import { getUser, verifyRequestOrigin } from '@netlify/identity'
import { and, asc, desc, eq, gt, ilike, lt, ne, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDatabase } from '../../db/index.js'
import { conversations, directMessages, follows, members } from '../../db/schema.js'

class RequestError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
}

async function readJson(request: Request) {
  const reader = request.body?.getReader()
  if (!reader) throw new RequestError('A request body is required.')
  const chunks: Uint8Array[] = []
  let length = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    length += value.byteLength
    if (length > 16_384) { await reader.cancel(); throw new RequestError('This message is too large.', 413) }
    chunks.push(value)
  }
  const body = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length }
  try { return JSON.parse(new TextDecoder().decode(body)) as unknown } catch { throw new RequestError('Invalid request.') }
}

function parseCursor(value: string) {
  const parts = value.split('|')
  if (parts.length !== 2 || !z.iso.datetime().safeParse(parts[0]).success || !z.uuid().safeParse(parts[1]).success) throw new RequestError('Invalid conversation cursor.')
  return { date: new Date(parts[0]), id: parts[1] }
}

export default async (request: Request, context: Context) => {
  try {
    const user = await getUser()
    if (!user) return json({ error: 'Sign in to use private messages.' }, 401)
    if (!['GET', 'POST', 'PUT'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405)
    if (request.method !== 'GET') {
      try { verifyRequestOrigin(request) } catch { return json({ error: 'This request must come from Buzzly.' }, 403) }
    }
    const db = getDatabase()
    const url = new URL(request.url)
    const { section, id, action } = context.params

    if (section === 'session' && !id && request.method === 'POST') {
      const displayName = (user.name || 'Buzzly member').trim().slice(0, 60) || 'Buzzly member'
      await db.insert(members).values({ userId: user.id, displayName }).onConflictDoUpdate({ target: members.userId, set: { displayName, updatedAt: new Date() } })
      return json({ ready: true })
    }

    if (section === 'members' && !id && request.method === 'GET') {
      const query = url.searchParams.get('q')?.trim() || ''
      if (query.length > 100) throw new RequestError('Search with up to 100 characters.')
      const followingOnly = url.searchParams.get('following') === 'true'
      const cursor = url.searchParams.get('cursor')
      if (cursor && cursor.length > 128) throw new RequestError('Invalid member cursor.')
      const followingCondition = sql<boolean>`exists (select 1 from ${follows} where ${follows.followerId} = ${user.id} and ${follows.followingId} = ${members.userId})`
      const rows = await db.select({ id: members.userId, name: members.displayName, following: followingCondition }).from(members).where(and(
        ne(members.userId, user.id),
        query ? ilike(members.displayName, `%${query.replace(/[\\%_]/g, '\\$&')}%`) : undefined,
        followingOnly ? followingCondition : undefined,
        cursor ? gt(members.userId, cursor) : undefined,
      )).orderBy(asc(members.userId)).limit(31)
      const page = rows.slice(0, 30)
      return json({ members: page, nextCursor: rows.length > 30 ? page.at(-1)?.id : null })
    }

    if (section === 'members' && id && action === 'follow' && request.method === 'PUT') {
      if (id === user.id) throw new RequestError('You cannot follow yourself.')
      const input = z.object({ active: z.boolean() }).safeParse(await readJson(request))
      if (!input.success) throw new RequestError('Choose a valid follow action.')
      const [member] = await db.select({ id: members.userId }).from(members).where(eq(members.userId, id)).limit(1)
      if (!member) throw new RequestError('This member is unavailable.', 404)
      const [self] = await db.select({ id: members.userId }).from(members).where(eq(members.userId, user.id)).limit(1)
      if (!self) throw new RequestError('Open Messages again to join the directory.', 409)
      if (input.data.active) await db.insert(follows).values({ followerId: user.id, followingId: id }).onConflictDoNothing()
      else await db.delete(follows).where(and(eq(follows.followerId, user.id), eq(follows.followingId, id)))
      return json({ active: input.data.active })
    }

    const participant = or(eq(conversations.memberOne, user.id), eq(conversations.memberTwo, user.id))
    if (section === 'conversations' && !id && request.method === 'GET') {
      const rawCursor = url.searchParams.get('cursor')
      const cursor = rawCursor ? parseCursor(rawCursor) : null
      const peerId = sql<string>`case when ${conversations.memberOne} = ${user.id} then ${conversations.memberTwo} else ${conversations.memberOne} end`
      const rows = await db.select({ id: conversations.id, peer: { id: members.userId, name: members.displayName }, updatedAt: conversations.updatedAt }).from(conversations).innerJoin(members, eq(members.userId, peerId)).where(and(
        participant,
        cursor ? or(lt(conversations.updatedAt, cursor.date), and(eq(conversations.updatedAt, cursor.date), lt(conversations.id, cursor.id))) : undefined,
      )).orderBy(desc(conversations.updatedAt), desc(conversations.id)).limit(31)
      const page = rows.slice(0, 30)
      const last = page.at(-1)
      return json({ conversations: page, nextCursor: rows.length > 30 && last ? `${last.updatedAt.toISOString()}|${last.id}` : null })
    }

    if (section === 'conversations' && !id && request.method === 'POST') {
      const input = z.object({ recipientId: z.string().min(1).max(128) }).safeParse(await readJson(request))
      if (!input.success || input.data.recipientId === user.id) throw new RequestError('Choose another member to message.')
      const recipientId = input.data.recipientId
      const conversation = await db.transaction(async (transaction) => {
        const [peer] = await transaction.select({ id: members.userId, name: members.displayName }).from(members).where(eq(members.userId, recipientId)).limit(1)
        if (!peer) throw new RequestError('This member is unavailable.', 404)
        const [self] = await transaction.select({ id: members.userId }).from(members).where(eq(members.userId, user.id)).limit(1)
        if (!self) throw new RequestError('Open Messages again to join the directory.', 409)
        const [memberOne, memberTwo] = [user.id, recipientId].sort()
        await transaction.insert(conversations).values({ memberOne, memberTwo }).onConflictDoNothing()
        const [thread] = await transaction.select().from(conversations).where(and(eq(conversations.memberOne, memberOne), eq(conversations.memberTwo, memberTwo))).limit(1)
        return { id: thread.id, peer, updatedAt: thread.updatedAt }
      })
      return json(conversation)
    }

    if (section !== 'conversations' || !id || !z.uuid().safeParse(id).success || action !== 'messages') return json({ error: 'Not found.' }, 404)
    const [conversation] = await db.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.id, id), participant)).limit(1)
    if (!conversation) throw new RequestError('This conversation is unavailable.', 404)

    if (request.method === 'GET') {
      const before = url.searchParams.get('before')
      const after = url.searchParams.get('after')
      if (before && after) throw new RequestError('Choose one message cursor.')
      const cursor = before || after ? parseCursor((before || after)!) : null
      const cursorCondition = cursor ? after
        ? or(gt(directMessages.createdAt, cursor.date), and(eq(directMessages.createdAt, cursor.date), gt(directMessages.id, cursor.id)))
        : or(lt(directMessages.createdAt, cursor.date), and(eq(directMessages.createdAt, cursor.date), lt(directMessages.id, cursor.id))) : undefined
      const order = after ? asc : desc
      const rows = await db.select({ id: directMessages.id, conversationId: directMessages.conversationId, senderId: directMessages.senderId, content: directMessages.content, createdAt: directMessages.createdAt }).from(directMessages).where(and(eq(directMessages.conversationId, id), cursorCondition)).orderBy(order(directMessages.createdAt), order(directMessages.id)).limit(51)
      const page = rows.slice(0, 50)
      const last = page.at(-1)
      return json({ messages: after ? page : page.reverse(), nextCursor: rows.length > 50 && last ? `${last.createdAt.toISOString()}|${last.id}` : null })
    }

    if (request.method === 'POST') {
      const input = z.object({ content: z.string().trim().min(1).max(2000), clientId: z.uuid() }).safeParse(await readJson(request))
      if (!input.success) throw new RequestError('Write a message between 1 and 2,000 characters.')
      const message = await db.transaction(async (transaction) => {
        const [created] = await transaction.insert(directMessages).values({ conversationId: id, senderId: user.id, content: input.data.content, clientId: input.data.clientId }).onConflictDoNothing({ target: [directMessages.senderId, directMessages.clientId] }).returning()
        if (created) {
          await transaction.update(conversations).set({ updatedAt: sql`greatest(${conversations.updatedAt}, ${created.createdAt.toISOString()}::timestamptz)` }).where(eq(conversations.id, id))
          return created
        }
        const [existing] = await transaction.select().from(directMessages).where(and(eq(directMessages.senderId, user.id), eq(directMessages.clientId, input.data.clientId))).limit(1)
        if (!existing || existing.conversationId !== id || existing.content !== input.data.content) throw new RequestError('This send attempt has changed. Please try again.', 409)
        return existing
      })
      return json({ id: message.id, conversationId: message.conversationId, senderId: message.senderId, content: message.content, createdAt: message.createdAt }, 201)
    }
    return json({ error: 'Method not allowed.' }, 405)
  } catch (error) {
    if (error instanceof RequestError) return json({ error: error.message }, error.status)
    return json({ error: 'Messages are temporarily unavailable. Please try again shortly.' }, 503)
  }
}

export const config: Config = {
  path: ['/api/messaging/:section', '/api/messaging/:section/:id/:action'],
  rateLimit: { windowLimit: 180, windowSize: 60, aggregateBy: ['domain', 'ip'] },
}
