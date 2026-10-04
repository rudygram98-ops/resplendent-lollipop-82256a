export interface User {
  id: string
  email: string
  name: string
  phone: string
  bio: string
  avatarUrl: string | null
  avatarAlt: string
  createdAt: string
}

export interface ProfileUpdate {
  name: string
  email: string
  phone: string
  bio: string
  avatarUrl: string | null
  avatarAlt: string
  currentPassword?: string
  newPassword?: string
}

export class AuthError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

async function authRequest(action: string, options: RequestInit = {}) {
  let response: Response
  try {
    response = await fetch(`/api/auth/${action}`, { ...options, credentials: 'same-origin', headers: options.body ? { 'Content-Type': 'application/json' } : undefined })
  } catch {
    throw new AuthError('We couldn’t connect to account services. Please check your connection and try again.', 0)
  }
  const data = await response.json().catch(() => null) as { user?: User | null; error?: string } | null
  if (!response.ok) throw new AuthError(data?.error || 'Account services are temporarily unavailable. Please try again shortly.', response.status)
  return data?.user ?? null
}

export function getUser() {
  return authRequest('session')
}

export async function signup(name: string, email: string, password: string) {
  return await authRequest('signup', { method: 'POST', body: JSON.stringify({ name, email, password }) }) as User
}

export async function login(email: string, password: string) {
  return await authRequest('login', { method: 'POST', body: JSON.stringify({ email, password }) }) as User
}

export async function logout() {
  await authRequest('logout', { method: 'POST' })
}

export async function updateProfile(update: ProfileUpdate) {
  return await authRequest('profile', { method: 'PUT', body: JSON.stringify(update) }) as User
}

export function authErrorMessage(error: unknown): string {
  if (error instanceof AuthError) {
    if (error.status === 429) return 'A few too many attempts. Please wait a moment and try again.'
    return error.message
  }
  return 'We couldn’t connect to account services. Please check your connection and try again.'
}
