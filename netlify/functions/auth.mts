import type { Config, Context } from '@netlify/functions'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { createSession, endSession, getSessionUser, hashPassword, verifyPassword, verifyRequestOrigin } from '../../db/auth.js'
import { getDatabase } from '../../db/index.js'
import { accounts, members } from '../../db/schema.js'

class RequestError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

function json(data: unknown, status = 200, cookie?: string) {
  const headers = new Headers({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' })
  if (cookie) headers.append('Set-Cookie', cookie)
  return Response.json(data, { status, headers })
}

async function readJson(request: Request) {
  const text = await request.text()
  if (text.length > 16_384) throw new RequestError('This request is too large.', 413)
  try { return JSON.parse(text) as unknown } catch { throw new RequestError('Invalid request.') }
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  if ('code' in error && error.code === '23505') return true
  return 'cause' in error && isUniqueViolation(error.cause)
}

const email = z.string().trim().toLowerCase().max(254).pipe(z.email())
const password = z.string().min(8).max(200)
const name = z.string().trim().min(2).max(60)

const signupInput = z.object({ name, email, password })
const loginInput = z.object({ email, password: z.string().min(1).max(200) })
const profileInput = z.object({
  name,
  email,
  phone: z.string().trim().max(30).refine((value) => !value || /^\+?[\d\s().-]{7,30}$/.test(value)),
  bio: z.string().trim().max(500),
  avatarUrl: z.string().regex(/^\/api\/profile\/avatar\/[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/).nullable(),
  avatarAlt: z.string().trim().max(200),
  currentPassword: z.string().max(200).optional(),
  newPassword: password.optional(),
})

const profileColumns = {
  id: accounts.id, email: accounts.email, name: accounts.displayName, phone: accounts.phone, bio: accounts.bio,
  avatarUrl: accounts.avatarUrl, avatarAlt: accounts.avatarAlt, createdAt: accounts.createdAt,
}

async function readProfile(db: ReturnType<typeof getDatabase>, id: string) {
  const [profile] = await db.select(profileColumns).from(accounts).where(eq(accounts.id, id)).limit(1)
  return profile ?? null
}

export default async (request: Request, context: Context) => {
  try {
    const { action } = context.params
    const db = getDatabase()

    if (action === 'session' && request.method === 'GET') {
      const user = await getSessionUser(request)
      return json({ user: user ? await readProfile(db, user.id) : null })
    }

    if (!['POST', 'PUT'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405)
    try { verifyRequestOrigin(request) } catch { return json({ error: 'This request must come from Buzzly.' }, 403) }

    if (action === 'signup' && request.method === 'POST') {
      const input = signupInput.safeParse(await readJson(request))
      if (!input.success) throw new RequestError('Enter your name, a valid email, and a password of at least 8 characters.', 422)
      const id = crypto.randomUUID()
      const passwordHash = await hashPassword(input.data.password)
      try {
        await db.transaction(async (transaction) => {
          await transaction.insert(accounts).values({ id, email: input.data.email, passwordHash, displayName: input.data.name })
          await transaction.insert(members).values({ userId: id, displayName: input.data.name }).onConflictDoNothing()
        })
      } catch (error) {
        if (isUniqueViolation(error)) throw new RequestError('An account with this email already exists. Sign in instead.', 409)
        throw error
      }
      return json({ user: await readProfile(db, id) }, 201, await createSession(request, id))
    }

    if (action === 'login' && request.method === 'POST') {
      const input = loginInput.safeParse(await readJson(request))
      if (!input.success) throw new RequestError('Check your email and password and try again.', 401)
      const [account] = await db.select({ id: accounts.id, passwordHash: accounts.passwordHash }).from(accounts).where(eq(accounts.email, input.data.email)).limit(1)
      if (!await verifyPassword(input.data.password, account?.passwordHash) || !account) throw new RequestError('Check your email and password and try again.', 401)
      return json({ user: await readProfile(db, account.id) }, 200, await createSession(request, account.id))
    }

    if (action === 'logout' && request.method === 'POST') {
      return json({ signedOut: true }, 200, await endSession(request))
    }

    if (action === 'profile' && request.method === 'PUT') {
      const user = await getSessionUser(request)
      if (!user) return json({ error: 'Your session has expired. Sign in again to save your profile.' }, 401)
      const input = profileInput.safeParse(await readJson(request))
      if (!input.success) throw new RequestError('Check your details: a name of 2–60 characters, a valid email and phone number, and a new password of at least 8 characters.', 422)
      const { currentPassword, newPassword, ...profile } = input.data
      const emailChanged = profile.email !== user.email
      let passwordHash: string | undefined
      if (emailChanged || newPassword) {
        const [account] = await db.select({ passwordHash: accounts.passwordHash }).from(accounts).where(eq(accounts.id, user.id)).limit(1)
        if (!currentPassword || !await verifyPassword(currentPassword, account?.passwordHash)) throw new RequestError('Enter your current password to change your email or password.', 403)
        if (newPassword) passwordHash = await hashPassword(newPassword)
      }
      try {
        await db.transaction(async (transaction) => {
          await transaction.update(accounts).set({
            displayName: profile.name, email: profile.email, phone: profile.phone, bio: profile.bio,
            avatarUrl: profile.avatarUrl, avatarAlt: profile.avatarUrl ? profile.avatarAlt : '',
            ...(passwordHash ? { passwordHash } : {}), updatedAt: new Date(),
          }).where(eq(accounts.id, user.id))
          await transaction.update(members).set({ displayName: profile.name, updatedAt: new Date() }).where(eq(members.userId, user.id))
        })
      } catch (error) {
        if (isUniqueViolation(error)) throw new RequestError('That email is already used by another account.', 409)
        throw error
      }
      return json({ user: await readProfile(db, user.id) }, 200, passwordHash ? await createSession(request, user.id, true) : undefined)
    }

    return json({ error: 'Not found.' }, 404)
  } catch (error) {
    if (error instanceof RequestError) return json({ error: error.message }, error.status)
    return json({ error: 'Account services are temporarily unavailable. Please try again shortly.' }, 503)
  }
}

export const config: Config = {
  path: '/api/auth/:action',
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ['domain', 'ip'] },
}
