import type { Config, Context } from '@netlify/functions'
import { getUser, verifyRequestOrigin } from '@netlify/identity'
import { getStore } from '@netlify/blobs'
import { and, desc, eq, ilike, lt, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDatabase } from '../../db/index.js'
import { bookmarks, comments, likes, posts } from '../../db/schema.js'
import { readSettings, withoutHiddenWords } from '../../db/settings.js'

class RequestError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
}

async function readBody(request: Request, limit: number) {
  const reader = request.body?.getReader()
  if (!reader) throw new RequestError('A request body is required.')
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel()
      throw new RequestError('This upload is too large. Choose media under 4 MB.', 413)
    }
    chunks.push(value)
  }
  const buffer = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length }
  return buffer
}

async function readJson(request: Request) {
  try {
    return JSON.parse(new TextDecoder().decode(await readBody(request, 16_384))) as unknown
  } catch (error) {
    if (error instanceof RequestError) throw error
    throw new RequestError('The request is not valid JSON.')
  }
}

function mediaMatches(bytes: Uint8Array, type: string) {
  const signature = new TextDecoder('latin1').decode(bytes.slice(0, 16))
  if (type === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  if (type === 'image/png') return bytes[0] === 137 && signature.slice(1, 4) === 'PNG' && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10
  if (type === 'image/webp') return signature.startsWith('RIFF') && signature.slice(8, 12) === 'WEBP'
  if (type === 'video/mp4') return signature.slice(4, 8) === 'ftyp'
  if (type === 'video/webm') return bytes[0] === 26 && bytes[1] === 69 && bytes[2] === 223 && bytes[3] === 163
  return false
}

export default async (request: Request, context: Context) => {
  try {
    const user = await getUser()
    if (!user) return json({ error: 'Sign in to join the conversation.' }, 401)
    if (!['GET', 'POST', 'PUT', 'DELETE'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405)
    if (request.method !== 'GET') {
      try { verifyRequestOrigin(request) } catch { return json({ error: 'This request must come from Buzzly.' }, 403) }
    }
    const db = getDatabase()
    const url = new URL(request.url)
    const { id, action } = context.params
    if (id && !z.uuid().safeParse(id).success) throw new RequestError('That post could not be found.', 404)
    const authorName = (user.name || 'Buzzly member').trim().slice(0, 60) || 'Buzzly member'

    if (!id && request.method === 'GET') {
      const view = url.searchParams.get('view') || 'all'
      const conditions = []
      if (view === 'photos') conditions.push(ilike(posts.mediaType, 'image/%'))
      else if (view === 'clips') conditions.push(ilike(posts.mediaType, 'video/%'))
      else if (view === 'mine') conditions.push(eq(posts.authorId, user.id))
      else if (view === 'saved') conditions.push(sql`exists (select 1 from ${bookmarks} where ${bookmarks.postId} = ${posts.id} and ${bookmarks.userId} = ${user.id})`)
      else if (view !== 'all') throw new RequestError('Choose a valid feed.')
      const sharedPost = url.searchParams.get('post')
      if (sharedPost) {
        if (!z.uuid().safeParse(sharedPost).success) throw new RequestError('That shared post could not be found.', 404)
        conditions.push(eq(posts.id, sharedPost))
      }
      const query = url.searchParams.get('q')?.trim().slice(0, 100)
      if (query) {
        const pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`
        conditions.push(or(ilike(posts.content, pattern), ilike(posts.authorName, pattern)))
      }
      const cursor = url.searchParams.get('cursor')
      if (cursor) {
        const [date, postId] = cursor.split('|')
        if (!z.iso.datetime().safeParse(date).success || !z.uuid().safeParse(postId).success) throw new RequestError('Invalid feed cursor.')
        conditions.push(or(lt(posts.createdAt, new Date(date)), and(eq(posts.createdAt, new Date(date)), lt(posts.id, postId))))
      }
      const rows = await db.select({
        id: posts.id, authorId: posts.authorId, authorName: posts.authorName, content: posts.content,
        mediaType: posts.mediaType, mediaAlt: posts.mediaAlt, createdAt: posts.createdAt,
        likeCount: sql<number>`(select count(*)::int from ${likes} where ${likes.postId} = ${posts.id})`,
        commentCount: sql<number>`(select count(*)::int from ${comments} where ${comments.postId} = ${posts.id})`,
        liked: sql<boolean>`exists (select 1 from ${likes} where ${likes.postId} = ${posts.id} and ${likes.userId} = ${user.id})`,
        saved: sql<boolean>`exists (select 1 from ${bookmarks} where ${bookmarks.postId} = ${posts.id} and ${bookmarks.userId} = ${user.id})`,
      }).from(posts).where(and(...conditions)).orderBy(desc(posts.createdAt), desc(posts.id)).limit(21)
      const page = rows.slice(0, 20)
      const last = page.at(-1)
      return json({ posts: page, nextCursor: rows.length > 20 && last ? `${last.createdAt.toISOString()}|${last.id}` : null })
    }

    if (!id && request.method === 'POST') {
      const buffer = await readBody(request, 4 * 1024 * 1024 + 65_536)
      let form: FormData
      try { form = await new Response(buffer, { headers: { 'Content-Type': request.headers.get('content-type') || '' } }).formData() }
      catch { throw new RequestError('Please submit a valid post.') }
      const parsed = z.object({ content: z.string().trim().max(2000), mediaAlt: z.string().trim().max(300) }).safeParse({ content: form.get('content') ?? '', mediaAlt: form.get('mediaAlt') ?? '' })
      if (!parsed.success) throw new RequestError('Use up to 2,000 characters for your post and 300 for the media description.')
      const attachment = form.get('media')
      const file = attachment instanceof File && attachment.size > 0 ? attachment : null
      if (!parsed.data.content && !file) throw new RequestError('Write something or add a photo or clip.')
      const postId = crypto.randomUUID()
      let mediaKey: string | null = null
      let mediaType: string | null = null
      if (file) {
        if (file.size > 4 * 1024 * 1024) throw new RequestError('Choose a photo or clip under 4 MB.', 413)
        const bytes = new Uint8Array(await file.arrayBuffer())
        if (!mediaMatches(bytes, file.type)) throw new RequestError('Choose a valid JPG, PNG, WebP, MP4, or WebM file.')
        if (!parsed.data.mediaAlt) throw new RequestError('Add a description of your photo or clip.')
        mediaKey = postId
        mediaType = file.type
        await getStore({ name: 'buzzly-media', consistency: 'strong' }).set(mediaKey, bytes.buffer)
      }
      try {
        await db.insert(posts).values({ id: postId, authorId: user.id, authorName, content: parsed.data.content, mediaKey, mediaType, mediaAlt: parsed.data.mediaAlt || null })
      } catch (error) {
        if (mediaKey) await getStore('buzzly-media').delete(mediaKey).catch(() => undefined)
        throw error
      }
      return json({ id: postId }, 201)
    }

    if (!id) return json({ error: 'Method not allowed.' }, 405)
    const [post] = await db.select().from(posts).where(eq(posts.id, id)).limit(1)
    if (!post) throw new RequestError('This post is no longer available.', 404)

    if (action === 'media' && request.method === 'GET') {
      if (!post.mediaKey || !post.mediaType) throw new RequestError('This post has no media.', 404)
      const buffer = await getStore({ name: 'buzzly-media', consistency: 'strong' }).get(post.mediaKey, { type: 'arrayBuffer' })
      if (!buffer) throw new RequestError('This media is unavailable.', 404)
      const headers = { 'Content-Type': post.mediaType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes', 'Content-Disposition': 'inline' }
      const range = request.headers.get('range')
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range)
        if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${buffer.byteLength}` } })
        const start = match[1] ? Number(match[1]) : Math.max(0, buffer.byteLength - Number(match[2]))
        const end = match[1] && match[2] ? Math.min(Number(match[2]), buffer.byteLength - 1) : buffer.byteLength - 1
        if (start > end || start >= buffer.byteLength) return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${buffer.byteLength}` } })
        return new Response(buffer.slice(start, end + 1), { status: 206, headers: { ...headers, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${buffer.byteLength}` } })
      }
      return new Response(buffer, { headers: { ...headers, 'Content-Length': String(buffer.byteLength) } })
    }

    if (!action && request.method === 'DELETE') {
      if (post.authorId !== user.id) throw new RequestError('You can only delete your own posts.', 403)
      await db.delete(posts).where(and(eq(posts.id, id), eq(posts.authorId, user.id)))
      if (post.mediaKey) await getStore('buzzly-media').delete(post.mediaKey).catch(() => undefined)
      return json({ deleted: true })
    }

    if ((action === 'like' || action === 'save') && request.method === 'PUT') {
      const input = z.object({ active: z.boolean() }).safeParse(await readJson(request))
      if (!input.success) throw new RequestError('Choose a valid reaction.')
      const table = action === 'like' ? likes : bookmarks
      if (input.data.active) await db.insert(table).values({ postId: id, userId: user.id }).onConflictDoNothing()
      else await db.delete(table).where(and(eq(table.postId, id), eq(table.userId, user.id)))
      const [count] = await db.select({ total: sql<number>`count(*)::int` }).from(likes).where(eq(likes.postId, id))
      return json({ active: input.data.active, likeCount: count.total })
    }

    if (action === 'comments' && request.method === 'GET') {
      const before = url.searchParams.get('before')
      let cursorCondition
      if (before) {
        const [date, commentId] = before.split('|')
        if (!z.iso.datetime().safeParse(date).success || !z.uuid().safeParse(commentId).success) throw new RequestError('Invalid comment cursor.')
        cursorCondition = or(lt(comments.createdAt, new Date(date)), and(eq(comments.createdAt, new Date(date)), lt(comments.id, commentId)))
      }
      const { hiddenWords } = await readSettings(db, user.id)
      const visible = hiddenWords.length ? or(eq(comments.authorId, user.id), withoutHiddenWords(comments.content, hiddenWords)) : undefined
      const rows = await db.select().from(comments).where(and(eq(comments.postId, id), cursorCondition, visible)).orderBy(desc(comments.createdAt), desc(comments.id)).limit(31)
      const page = rows.slice(0, 30)
      const last = page.at(-1)
      return json({ comments: page, nextCursor: rows.length > 30 && last ? `${last.createdAt.toISOString()}|${last.id}` : null })
    }

    if (action === 'comments' && request.method === 'POST') {
      const input = z.object({ content: z.string().trim().min(1).max(1000) }).safeParse(await readJson(request))
      if (!input.success) throw new RequestError('Write a comment between 1 and 1,000 characters.')
      const [comment] = await db.insert(comments).values({ postId: id, authorId: user.id, authorName, content: input.data.content }).returning()
      return json(comment, 201)
    }
    return json({ error: 'Method not allowed.' }, 405)
  } catch (error) {
    if (error instanceof RequestError) return json({ error: error.message }, error.status)
    return json({ error: 'The community is temporarily unavailable. Please try again shortly.' }, 503)
  }
}

export const config: Config = {
  path: ['/api/social', '/api/social/:id', '/api/social/:id/:action'],
  rateLimit: { windowLimit: 250, windowSize: 60, aggregateBy: ['domain', 'ip'] },
}
