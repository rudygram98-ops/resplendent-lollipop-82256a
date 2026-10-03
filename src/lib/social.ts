export type FeedView = 'all' | 'photos' | 'clips' | 'saved' | 'mine'

export interface SocialPost {
  id: string
  authorId: string
  authorName: string
  authorUsername: string | null
  authorAvatar: string | null
  content: string
  mediaType: string | null
  mediaAlt: string | null
  createdAt: string
  likeCount: number
  commentCount: number
  liked: boolean
  saved: boolean
}

export interface SocialComment {
  id: string
  authorId: string
  authorName: string
  authorUsername: string | null
  authorAvatar: string | null
  content: string
  createdAt: string
}

export interface PublicProfile {
  userId: string
  username: string
  displayName: string
  avatarUrl: string | null
}

export interface Conversation {
  id: string
  lastMessageAt: string
  lastContent: string | null
  blocked: boolean
  unread: boolean
  other: PublicProfile
}

export interface ChatMessage {
  id: string
  conversationId: string
  senderId: string
  content: string
  createdAt: string
}

export function socialRequest<ResponseData>(path: string, options?: RequestInit): Promise<ResponseData> {
  return apiRequest<ResponseData>(`/api/social${path}`, options)
}

export async function apiRequest<ResponseData>(path: string, options?: RequestInit): Promise<ResponseData> {
  const response = await fetch(path, { ...options, credentials: 'same-origin' })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 429) throw new Error('You’re moving a little fast. Wait a minute and try again.')
    throw new Error(response.status === 401 ? 'Your session has expired. Sign in again to continue.' : data?.error || 'Something went wrong. Please try again.')
  }
  return data as ResponseData
}

export function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'B'
}

export function jsonOptions(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

export function errorText(failure: unknown, fallback: string) {
  return failure instanceof Error ? failure.message : fallback
}
