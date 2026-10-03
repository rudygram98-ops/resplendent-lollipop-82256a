import type { Config, Context } from '@netlify/functions'
import { getUser, verifyRequestOrigin } from '@netlify/identity'
import { getStore } from '@netlify/blobs'

const maxFileSize = 4 * 1024 * 1024
const contentTypes = ['image/jpeg', 'image/png', 'image/webp']

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
}

function matchesImage(bytes: Uint8Array, type: string) {
  if (bytes.length < 12) return false
  if (type === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  if (type === 'image/png') return [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
  const signature = new TextDecoder('latin1').decode(bytes.slice(0, 12))
  return type === 'image/webp' && signature.startsWith('RIFF') && signature.slice(8, 12) === 'WEBP'
}

export default async (request: Request, context: Context) => {
  try {
    const user = await getUser()
    if (!user) return json({ error: 'Sign in to manage your profile photo.' }, 401)
    if (!['GET', 'POST', 'DELETE'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405)
    if (request.method !== 'GET') {
      try { verifyRequestOrigin(request) } catch { return json({ error: 'This request must come from Buzzly.' }, 403) }
    }
    const store = getStore({ name: 'buzzly-avatars', consistency: 'strong' })
    const avatarId = context.params.id
    if (avatarId && !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/.test(avatarId)) return json({ error: 'Photo not found.' }, 404)
    const key = `${user.id}/${avatarId}`
    if (avatarId && request.method === 'GET') {
      const result = await store.getWithMetadata(key, { type: 'arrayBuffer' })
      if (!result) return json({ error: 'Photo not found.' }, 404)
      const type = result.metadata.contentType
      if (typeof type !== 'string' || !contentTypes.includes(type)) return json({ error: 'Photo unavailable.' }, 404)
      return new Response(result.data, { headers: { 'Content-Type': type, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' } })
    }
    if (avatarId && request.method === 'DELETE') {
      await store.delete(key)
      return json({ deleted: true })
    }
    if (avatarId || request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
    const reader = request.body?.getReader()
    if (!reader) return json({ error: 'Choose a profile photo.' }, 400)
    const chunks: Uint8Array[] = []
    let length = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > maxFileSize + 16_384) {
        await reader.cancel()
        return json({ error: 'Choose a photo up to 4 MB.' }, 413)
      }
      chunks.push(value)
    }
    const body = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length }
    let form: FormData
    try { form = await new Response(body, { headers: { 'Content-Type': request.headers.get('content-type') || '' } }).formData() } catch { return json({ error: 'Invalid photo upload.' }, 400) }
    const file = form.get('file')
    const description = form.get('description')
    if (typeof description !== 'string' || !description.trim() || description.trim().length > 200) return json({ error: 'Add a photo description of up to 200 characters.' }, 400)
    if (!(file instanceof File) || !file.size || file.size > maxFileSize || !contentTypes.includes(file.type)) return json({ error: 'Choose a JPEG, PNG, or WebP photo up to 4 MB.' }, 400)
    const buffer = await file.arrayBuffer()
    if (!matchesImage(new Uint8Array(buffer), file.type)) return json({ error: 'This file is not a supported image.' }, 400)
    const newId = crypto.randomUUID()
    await store.set(`${user.id}/${newId}`, buffer, { metadata: { contentType: file.type, description: description.trim() } })
    return json({ avatarUrl: `/api/profile/avatar/${newId}` }, 201)
  } catch {
    return json({ error: 'Profile photos are temporarily unavailable. Please try again shortly.' }, 503)
  }
}

export const config: Config = {
  path: ['/api/profile/avatar', '/api/profile/avatar/:id'],
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['domain', 'ip'] },
}
