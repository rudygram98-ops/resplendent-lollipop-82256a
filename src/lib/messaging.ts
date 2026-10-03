export interface Member {
  id: string
  name: string
  following: boolean
}

export interface Conversation {
  id: string
  peer: { id: string; name: string }
  updatedAt: string
}

export interface DirectMessage {
  id: string
  conversationId: string
  senderId: string
  content: string
  createdAt: string
}

export interface MessagePage {
  messages: DirectMessage[]
  nextCursor: string | null
}

export async function messagingRequest<ResponseData>(path: string, options?: RequestInit): Promise<ResponseData> {
  const response = await fetch(`/api/messaging${path}`, { ...options, credentials: 'same-origin' })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401) throw new Error('Your session has expired. Sign in again to continue.')
    if (response.status === 429) throw new Error('A little too fast. Wait a minute and try again.')
    throw new Error(data?.error || 'Messages are temporarily unavailable. Please try again.')
  }
  return data as ResponseData
}

export function messageCursor(message: DirectMessage) {
  return `${message.createdAt}|${message.id}`
}
