import type { Config, Context } from '@netlify/functions'
import { getStore } from '@netlify/blobs'
import { and, asc, desc, eq, ilike, ne, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDatabase } from '../../db/index.js'
import { blocks, profiles } from '../../db/schema.js'
import { authorize, avatarUrl, ensureProfile, handleError, json, mediaMatches, readForm, readJson, RequestError } from '../lib/http.js'

const avatarTypes = ['image/jpeg', 'image/png', 'image/webp']
const usernamePattern = /^[a-z0-9_]{3,20}$/

function publicProfile(profile: { userId: string; username: string; displayName: string; avatarKey: string | null }) {
  return { userId: profile.userId, username: profile.username, displayName: profile.displayName, avatarUrl: avatarUrl(profile.userId, profile.avatarKey) }
}

function avatarStore() {
  return getStore({ name: 'buzzly-avatars', consistency: 'strong' })
}

export default async (request: Request, context: Context) => {
  try {
    const user = await authorize(request)
    const db = getDatabase()
    const { section, target } = context.params
    const url = new URL(request.url)

    if (section === 'me' && !target && request.method === 'GET') {
      const profile = await ensureProfile(user)
      const blocked = await db.select({ userId: profiles.userId, username: profiles.username, displayName: profiles.displayName, avatarKey: profiles.avatarKey })
        .from(blocks).innerJoin(profiles, eq(profiles.userId, blocks.blockedId)).where(eq(blocks.blockerId, user.id)).orderBy(desc(blocks.createdAt))
      return json({ profile: publicProfile(profile), blocked: blocked.map(publicProfile) })
    }

    if (section === 'me' && !target && request.method === 'PUT') {
      await ensureProfile(user)
      const input = z.object({ username: z.string().trim().toLowerCase(), displayName: z.string().trim().min(2).max(60) }).safeParse(await readJson(request))
      if (!input.success) throw new RequestError('Use 2 to 60 characters for your display name.')
      if (!usernamePattern.test(input.data.username)) throw new RequestError('Usernames use 3 to 20 lowercase letters, numbers, or underscores.')
      const [taken] = await db.select({ userId: profiles.userId }).from(profiles).where(and(sql`lower(${profiles.username}) = ${input.data.username}`, ne(profiles.userId, user.id))).limit(1)
      if (taken) throw new RequestError('That username is already taken. Try another.', 409)
      try {
        const [updated] = await db.update(profiles).set({ username: input.data.username, displayName: input.data.displayName, updatedAt: new Date() }).where(eq(profiles.userId, user.id)).returning()
        return json({ profile: publicProfile(updated) })
      } catch {
        throw new RequestError('That username is already taken. Try another.', 409)
      }
    }

    if (section === 'me' && target === 'avatar' && (request.method === 'PUT' || request.method === 'DELETE')) {
      const profile = await ensureProfile(user)
      let avatarKey: string | null = null
      if (request.method === 'PUT') {
        const form = await readForm(request, 2 * 1024 * 1024 + 16_384, 'Choose a profile picture under 2 MB.')
        const file = form.get('avatar')
        if (!(file instanceof File) || !file.size) throw new RequestError('Choose a photo for your profile picture.')
        if (file.size > 2 * 1024 * 1024) throw new RequestError('Choose a profile picture under 2 MB.', 413)
        const bytes = new Uint8Array(await file.arrayBuffer())
        if (!avatarTypes.includes(file.type) || !mediaMatches(bytes, file.type)) throw new RequestError('Choose a valid JPG, PNG, or WebP photo.')
        avatarKey = `${user.id}/${crypto.randomUUID()}`
        await avatarStore().set(avatarKey, bytes.buffer, { metadata: { type: file.type } })
      }
      const [updated] = await db.update(profiles).set({ avatarKey, updatedAt: new Date() }).where(eq(profiles.userId, user.id)).returning()
      if (profile.avatarKey) await avatarStore().delete(profile.avatarKey).catch(() => undefined)
      return json({ profile: publicProfile(updated) })
    }

    if (section === 'avatar' && target && request.method === 'GET') {
      const [profile] = await db.select({ avatarKey: profiles.avatarKey }).from(profiles).where(eq(profiles.userId, target)).limit(1)
      if (!profile?.avatarKey) throw new RequestError('No profile picture.', 404)
      const result = await avatarStore().getWithMetadata(profile.avatarKey, { type: 'arrayBuffer' })
      const type = String(result?.metadata.type || '')
      if (!result || !avatarTypes.includes(type)) throw new RequestError('No profile picture.', 404)
      return new Response(result.data, { headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' } })
    }

    if (section === 'search' && !target && request.method === 'GET') {
      const query = url.searchParams.get('q')?.trim().replace(/^@/, '').slice(0, 60) || ''
      if (!query) return json({ people: [] })
      const pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`
      const rows = await db.select().from(profiles).where(and(
        ne(profiles.userId, user.id),
        or(ilike(profiles.username, pattern), ilike(profiles.displayName, pattern)),
        sql`not exists (select 1 from ${blocks} where (${blocks.blockerId} = ${user.id} and ${blocks.blockedId} = ${profiles.userId}) or (${blocks.blockerId} = ${profiles.userId} and ${blocks.blockedId} = ${user.id}))`,
      )).orderBy(asc(profiles.username)).limit(20)
      return json({ people: rows.map(publicProfile) })
    }

    if (section === 'blocks' && target && (request.method === 'PUT' || request.method === 'DELETE')) {
      if (target === user.id) throw new RequestError('You can’t block yourself.')
      if (request.method === 'PUT') {
        const [profile] = await db.select({ userId: profiles.userId }).from(profiles).where(eq(profiles.userId, target)).limit(1)
        if (!profile) throw new RequestError('That member could not be found.', 404)
        await db.insert(blocks).values({ blockerId: user.id, blockedId: target }).onConflictDoNothing()
      } else {
        await db.delete(blocks).where(and(eq(blocks.blockerId, user.id), eq(blocks.blockedId, target)))
      }
      return json({ blocked: request.method === 'PUT' })
    }

    return json({ error: 'Method not allowed.' }, 405)
  } catch (error) {
    return handleError(error)
  }
}

export const config: Config = {
  path: ['/api/profile/:section', '/api/profile/:section/:target'],
  rateLimit: { windowLimit: 300, windowSize: 60, aggregateBy: ['domain', 'ip'] },
}
