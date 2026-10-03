export type FeedView = 'all' | 'photos' | 'clips' | 'saved' | 'mine' | 'tagged'

export interface TaggedMember {
  id: string
  name: string
}

export interface RemixSource {
  id: string
  authorName: string
  content: string
  mediaType: string | null
  createdAt: string
}

export interface SocialPost {
  id: string
  authorId: string
  authorName: string
  content: string
  mediaType: string | null
  mediaAlt: string | null
  createdAt: string
  likeCount: number
  commentCount: number
  liked: boolean
  saved: boolean
  allowDownloads: boolean
  allowRemixes: boolean
  tags: TaggedMember[]
  myTag: 'approved' | 'pending' | null
  remixOf: RemixSource | null
}

export interface SocialComment {
  id: string
  authorId: string
  authorName: string
  content: string
  createdAt: string
}

export async function socialRequest<ResponseData>(path: string, options?: RequestInit): Promise<ResponseData> {
  const response = await fetch(`/api/social${path}`, { ...options, credentials: 'same-origin' })
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
