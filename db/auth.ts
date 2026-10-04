import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { and, eq, gt, lt } from 'drizzle-orm'
import { getDatabase } from './index.js'
import { accounts, sessions } from './schema.js'

export const sessionCookie = 'buzzly_session'
export const sessionLifetime = 30 * 24 * 60 * 60 * 1000

export interface SessionUser {
  id: string
  email: string
  name: string
}

const keyLength = 64
const cost = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

function derive(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, keyLength, cost, (error, key) => error ? reject(error) : resolve(key))
  })
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const key = await derive(password, salt)
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`
}

const dummyHash = `scrypt$${Buffer.alloc(16).toString('base64')}$${Buffer.alloc(keyLength).toString('base64')}`

export async function verifyPassword(password: string, stored: string | null | undefined) {
  const [scheme, salt, key] = (stored || dummyHash).split('$')
  if (scheme !== 'scrypt' || !salt || !key) return false
  const expected = Buffer.from(key, 'base64')
  const actual = await derive(password, Buffer.from(salt, 'base64'))
  return Boolean(stored) && expected.length === actual.length && timingSafeEqual(expected, actual)
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('base64url')
}

function readCookie(request: Request, name: string) {
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) return value.join('=')
  }
  return ''
}

function cookieAttributes(request: Request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : ''
  return `Path=/; HttpOnly; SameSite=Lax${secure}`
}

export async function createSession(request: Request, accountId: string, revokeOthers = false) {
  const token = randomBytes(32).toString('base64url')
  const db = getDatabase()
  await db.delete(sessions).where(and(eq(sessions.accountId, accountId), revokeOthers ? undefined : lt(sessions.expiresAt, new Date())))
  await db.insert(sessions).values({ tokenHash: hashToken(token), accountId, expiresAt: new Date(Date.now() + sessionLifetime) })
  return `${sessionCookie}=${token}; Max-Age=${sessionLifetime / 1000}; ${cookieAttributes(request)}`
}

export async function endSession(request: Request) {
  const token = readCookie(request, sessionCookie)
  if (token) await getDatabase().delete(sessions).where(eq(sessions.tokenHash, hashToken(token)))
  return `${sessionCookie}=; Max-Age=0; ${cookieAttributes(request)}`
}

export async function getSessionUser(request: Request): Promise<SessionUser | null> {
  const token = readCookie(request, sessionCookie)
  if (!token || token.length > 128) return null
  const [row] = await getDatabase().select({ id: accounts.id, email: accounts.email, name: accounts.displayName })
    .from(sessions).innerJoin(accounts, eq(accounts.id, sessions.accountId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date()))).limit(1)
  return row ?? null
}

export function verifyRequestOrigin(request: Request) {
  const expected = new URL(request.url).origin
  const origin = request.headers.get('origin')
  if (origin) {
    if (origin !== expected) throw new Error('Cross-origin request rejected.')
    return
  }
  const site = request.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin') throw new Error('Cross-origin request rejected.')
  const referer = request.headers.get('referer')
  if (!site && (!referer || new URL(referer).origin !== expected)) throw new Error('Cross-origin request rejected.')
}
