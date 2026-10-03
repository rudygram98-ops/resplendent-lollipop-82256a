import { getUser, verifyRequestOrigin } from '@netlify/identity'
import { and, eq, or } from 'drizzle-orm'
import { getDatabase } from '../../db/index.js'
import { blocks, profiles } from '../../db/schema.js'

export class RequestError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
}

export async function readBody(request: Request, limit: number, tooLarge = 'This upload is too large. Choose media under 4 MB.') {
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
      throw new RequestError(tooLarge, 413)
    }
    chunks.push(value)
  }
  const buffer = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length }
  return buffer
}

export async function readJson(request: Request) {
  try {
    return JSON.parse(new TextDecoder().decode(await readBody(request, 16_384))) as unknown
  } catch (error) {
    if (error instanceof RequestError) throw error
    throw new RequestError('The request is not valid JSON.')
  }
}

export async function readForm(request: Request, limit: number, tooLarge?: string) {
  const buffer = await readBody(request, limit, tooLarge)
  try { return await new Response(buffer, { headers: { 'Content-Type': request.headers.get('content-type') || '' } }).formData() }
  catch { throw new RequestError('Please submit a valid form.') }
}

export function mediaMatches(bytes: Uint8Array, type: string) {
  const signature = new TextDecoder('latin1').decode(bytes.slice(0, 16))
  if (type === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  if (type === 'image/png') return bytes[0] === 137 && signature.slice(1, 4) === 'PNG' && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10
  if (type === 'image/webp') return signature.startsWith('RIFF') && signature.slice(8, 12) === 'WEBP'
  if (type === 'video/mp4') return signature.slice(4, 8) === 'ftyp'
  if (type === 'video/webm') return bytes[0] === 26 && bytes[1] === 69 && bytes[2] === 223 && bytes[3] === 163
  return false
}

export async function authorize(request: Request) {
  const user = await getUser()
  if (!user) throw new RequestError('Sign in to join the conversation.', 401)
  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(request.method)) throw new RequestError('Method not allowed.', 405)
  if (request.method !== 'GET') {
    try { verifyRequestOrigin(request) } catch { throw new RequestError('This request must come from Buzzly.', 403) }
  }
  return user
}

export function handleError(error: unknown) {
  if (error instanceof RequestError) return json({ error: error.message }, error.status)
  return json({ error: 'The community is temporarily unavailable. Please try again shortly.' }, 503)
}

export function avatarUrl(userId: string, avatarKey: string | null) {
  return avatarKey ? `/api/profile/avatar/${encodeURIComponent(userId)}?v=${encodeURIComponent(avatarKey.split('/').at(-1) || '')}` : null
}

function baseUsername(source: string) {
  const cleaned = source.toLowerCase().normalize('NFKD').replace(/[^a-z0-9_]+/g, '').slice(0, 20)
  return cleaned.length >= 3 ? cleaned : `member${cleaned}`
}

export async function ensureProfile(user: { id: string; name?: string; email?: string }) {
  const db = getDatabase()
  const [existing] = await db.select().from(profiles).where(eq(profiles.userId, user.id)).limit(1)
  if (existing) return existing
  const displayName = (user.name || 'Buzzly member').trim().slice(0, 60) || 'Buzzly member'
  const base = baseUsername(user.name || user.email?.split('@')[0] || 'member')
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const username = attempt === 0 ? base : `${base.slice(0, 20)}${Math.floor(1000 + Math.random() * 9000)}`
    const [created] = await db.insert(profiles).values({ userId: user.id, username, displayName }).onConflictDoNothing().returning()
    if (created) return created
    const [raced] = await db.select().from(profiles).where(eq(profiles.userId, user.id)).limit(1)
    if (raced) return raced
  }
  throw new RequestError('We couldn’t set up your profile. Please try again.', 503)
}

export async function isBlockedBetween(first: string, second: string) {
  const [row] = await getDatabase().select({ blockerId: blocks.blockerId }).from(blocks).where(or(
    and(eq(blocks.blockerId, first), eq(blocks.blockedId, second)),
    and(eq(blocks.blockerId, second), eq(blocks.blockedId, first)),
  )).limit(1)
  return Boolean(row)
}
