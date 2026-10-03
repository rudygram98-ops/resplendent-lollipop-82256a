import type { Config, Context } from '@netlify/functions'
import { getStore } from '@netlify/blobs'
import { and, desc, eq, ilike, lt, or, sql } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { getDatabase } from '../../db/index.js'
import { blocks, bookmarks, comments, likes, posts, profiles } from '../../db/schema.js'
import { authorize, avatarUrl, ensureProfile, handleError, isBlockedBetween, json, mediaMatches, readForm, readJson, RequestError } from '../lib/http.js'

function notBlocked(column: AnyPgColumn, userId: string) {
  return sql`not exists (select 1 from ${blocks} where (${blocks.blockerId} = ${userId} and ${blocks.blockedId} = ${column}) or (${blocks.blockerId} = ${column} and ${blocks.blockedId} = ${userId}))`
}

function withAvatar<Row extends { authorId: string; avatarKey: string | null }>({ avatarKey, ...row }: Row) {
  return { ...row, authorAvatar: avatarUrl(row.authorId, avatarKey) }
}

export default async (request: Request, context: Context) => {
  try {
    const user = await authorize(request)
    const db = getDatabase()
    const url = new URL(request.url)
    const { id, action } = context.params
    if (id && !z.uuid().safeParse(id).success) throw new RequestError('That post could not be found.', 404)

    if (!id && request.method === 'GET') {
      const view = url.searchParams.get('view') || 'all'
      const conditions = [notBlocked(posts.authorId, user.id)]
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
        conditions.push(or(ilike(posts.content, pattern), ilike(sql`coalesce(${profiles.displayName}, ${posts.authorName})`, pattern), ilike(profiles.username, pattern)))
      }
      const cursor = url.searchParams.get('cursor')
      if (cursor) {
        const [date, postId] = cursor.split('|')
        if (!z.iso.datetime().safeParse(date).success || !z.uuid().safeParse(postId).success) throw new RequestError('Invalid feed cursor.')
        conditions.push(or(lt(posts.createdAt, new Date(date)), and(eq(posts.createdAt, new Date(date)), lt(posts.id, postId))))
      }
      const rows = await db.select({
        id: posts.id, authorId: posts.authorId, authorName: sql<string>`coalesce(${profiles.displayName}, ${posts.authorName})`,
        authorUsername: profiles.username, avatarKey: profiles.avatarKey, content: posts.content,
        mediaType: posts.mediaType, mediaAlt: posts.mediaAlt, createdAt: posts.createdAt,
        likeCount: sql<number>`(select count(*)::int from ${likes} where ${likes.postId} = ${posts.id})`,
        commentCount: sql<number>`(select count(*)::int from ${comments} where ${comments.postId} = ${posts.id})`,
        liked: sql<boolean>`exists (select 1 from ${likes} where ${likes.postId} = ${posts.id} and ${likes.userId} = ${user.id})`,
        saved: sql<boolean>`exists (select 1 from ${bookmarks} where ${bookmarks.postId} = ${posts.id} and ${bookmarks.userId} = ${user.id})`,
      }).from(posts).leftJoin(profiles, eq(profiles.userId, posts.authorId)).where(and(...conditions)).orderBy(desc(posts.createdAt), desc(posts.id)).limit(21)
      const page = rows.slice(0, 20)
      const last = page.at(-1)
      return json({ posts: page.map(withAvatar), nextCursor: rows.length > 20 && last ? `${last.createdAt.toISOString()}|${last.id}` : null })
    }

    if (!id && request.method === 'POST') {
      const form = await readForm(request, 4 * 1024 * 1024 + 65_536)
      const profile = await ensureProfile(user)
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
        await db.insert(posts).values({ id: postId, authorId: user.id, authorName: profile.displayName, content: parsed.data.content, mediaKey, mediaType, mediaAlt: parsed.data.mediaAlt || null })
      } catch (error) {
        if (mediaKey) await getStore('buzzly-media').delete(mediaKey).catch(() => undefined)
        throw error
      }
      return json({ id: postId }, 201)
    }

    if (!id) return json({ error: 'Method not allowed.' }, 405)
    const [post] = await db.select().from(posts).where(eq(posts.id, id)).limit(1)
    if (!post || (post.authorId !== user.id && await isBlockedBetween(user.id, post.authorId))) throw new RequestError('This post is no longer available.', 404)

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
      const rows = await db.select({
        id: comments.id, authorId: comments.authorId, authorName: sql<string>`coalesce(${profiles.displayName}, ${comments.authorName})`,
        authorUsername: profiles.username, avatarKey: profiles.avatarKey, content: comments.content, createdAt: comments.createdAt,
      }).from(comments).leftJoin(profiles, eq(profiles.userId, comments.authorId)).where(and(eq(comments.postId, id), notBlocked(comments.authorId, user.id), cursorCondition)).orderBy(desc(comments.createdAt), desc(comments.id)).limit(31)
      const page = rows.slice(0, 30)
      const last = page.at(-1)
      return json({ comments: page.map(withAvatar), nextCursor: rows.length > 30 && last ? `${last.createdAt.toISOString()}|${last.id}` : null })
    }

    if (action === 'comments' && request.method === 'POST') {
      const input = z.object({ content: z.string().trim().min(1).max(1000) }).safeParse(await readJson(request))
      if (!input.success) throw new RequestError('Write a comment between 1 and 1,000 characters.')
      const profile = await ensureProfile(user)
      const [comment] = await db.insert(comments).values({ postId: id, authorId: user.id, authorName: profile.displayName, content: input.data.content }).returning()
      return json({ ...comment, authorUsername: profile.username, authorAvatar: avatarUrl(user.id, profile.avatarKey) }, 201)
    }
    return json({ error: 'Method not allowed.' }, 405)
  } catch (error) {
    return handleError(error)
  }
}

export const config: Config = {
  path: ['/api/social', '/api/social/:id', '/api/social/:id/:action'],
  rateLimit: { windowLimit: 250, windowSize: 60, aggregateBy: ['domain', 'ip'] },
}
