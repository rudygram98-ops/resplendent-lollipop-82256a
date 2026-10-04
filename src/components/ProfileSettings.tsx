import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { authErrorMessage, updateProfile } from '@/lib/auth'
import type { User } from '@/lib/auth'
import { Check, ImagePlus } from 'lucide-react'
import { initials } from '@/lib/social'

async function avatarRequest(path: string, options: RequestInit) {
  const response = await fetch(path, { ...options, credentials: 'same-origin' })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || 'Unable to save your photo. Please try again.')
  return data as { avatarUrl: string }
}

export default function ProfileSettings({ user, onSaved, onCancel, onBusyChange }: {
  user: User
  onSaved: (user: User, message: string) => void
  onCancel: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const [profile, setProfile] = useState({ username: user.name || '', email: user.email, phone: user.phone, bio: user.bio, avatarAlt: user.avatarAlt, currentPassword: '', newPassword: '' })
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submitLock = useRef(false)

  useEffect(() => {
    if (!file) { setPreview(''); return }
    const objectUrl = URL.createObjectURL(file)
    setPreview(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])

  function handleChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = event.target
    setProfile((current) => ({ ...current, [name]: value }))
    setError('')
  }

  function handleImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0]
    setError('')
    if (!selected) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type) || selected.size === 0 || selected.size > 4 * 1024 * 1024) {
      setError('Choose a JPEG, PNG, or WebP photo up to 4 MB.')
      event.target.value = ''
      return
    }
    setFile(selected)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitLock.current) return
    if (profile.username.trim().length < 2) { setError('Use at least 2 characters for your username.'); return }
    if (profile.phone.trim() && !/^\+?[\d\s().-]{7,30}$/.test(profile.phone.trim())) { setError('Enter a valid phone number, or leave it blank.'); return }
    if (file && !profile.avatarAlt.trim()) { setError('Add a description for your profile photo.'); return }
    submitLock.current = true
    setBusy(true)
    onBusyChange(true)
    setError('')
    let uploadedUrl = ''
    try {
      if (file) {
        const body = new FormData()
        body.set('file', file)
        body.set('description', profile.avatarAlt.trim())
        uploadedUrl = (await avatarRequest('/api/profile/avatar', { method: 'POST', body })).avatarUrl
      }
      const emailChanged = profile.email.trim().toLowerCase() !== user.email
      const updated = await updateProfile({
        name: profile.username.trim(), email: profile.email.trim(), phone: profile.phone.trim(), bio: profile.bio.trim(),
        avatarUrl: uploadedUrl || user.avatarUrl, avatarAlt: profile.avatarAlt.trim(),
        ...(emailChanged || profile.newPassword ? { currentPassword: profile.currentPassword } : {}),
        ...(profile.newPassword ? { newPassword: profile.newPassword } : {}),
      })
      const oldAvatar = user.avatarUrl
      const savedUpload = uploadedUrl
      uploadedUrl = ''
      if (savedUpload && oldAvatar && /^\/api\/profile\/avatar\/[\da-f-]{36}$/.test(oldAvatar)) {
        void avatarRequest(oldAvatar, { method: 'DELETE' }).catch(() => undefined)
      }
      onSaved(updated, 'Profile updated successfully!')
    } catch (caught) {
      if (uploadedUrl) void avatarRequest(uploadedUrl, { method: 'DELETE' }).catch(() => undefined)
      setError(caught instanceof Error && caught.name === 'Error' ? caught.message : caught ? authErrorMessage(caught) : caught instanceof Error ? caught.message : 'Unable to update your profile. Please try again.')
    } finally {
      submitLock.current = false
      setBusy(false)
      onBusyChange(false)
    }
  }

  const avatarUrl = preview || user.avatarUrl
  return <form className="profile-form profile-settings" onSubmit={handleSubmit} aria-labelledby="profile-settings-title" aria-busy={busy}>
    <h3 id="profile-settings-title">Profile settings<span>.</span></h3>
    <p className="profile-hint">A little more you. Make this space your own.</p>
    <div className="profile-photo-row">
      <div className="profile-photo">{avatarUrl ? <img src={avatarUrl} alt={profile.avatarAlt || 'Your profile photo'} /> : <span aria-label="Your initials">{initials(profile.username)}</span>}</div>
      <div className="profile-photo-control"><label htmlFor="profile-avatar"><ImagePlus size={16} />Choose a photo</label><input id="profile-avatar" name="avatar" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageUpload} disabled={busy} aria-describedby="profile-photo-help" /><p id="profile-photo-help">JPEG, PNG or WebP · up to 4 MB</p></div>
    </div>
    {(file || user.avatarUrl) && <div className="field"><label htmlFor="profile-avatar-alt">Photo description</label><input id="profile-avatar-alt" name="avatarAlt" value={profile.avatarAlt} onChange={handleChange} maxLength={200} required={Boolean(file)} disabled={busy} placeholder="Describe your photo for screen readers" /></div>}
    <div className="field"><label htmlFor="profile-username">Username <span className="profile-optional">display name, not a unique handle</span></label><input id="profile-username" name="username" value={profile.username} onChange={handleChange} minLength={2} maxLength={60} autoComplete="nickname" required disabled={busy} /></div>
    <div className="field"><label htmlFor="profile-email">Email</label><input id="profile-email" name="email" type="email" value={profile.email} onChange={handleChange} maxLength={254} autoComplete="email" required disabled={busy} aria-describedby="profile-email-help" /><p id="profile-email-help" className="profile-hint">Changing your email requires your current password.</p></div>
    <div className="field"><label htmlFor="profile-new-password">New password <span className="profile-optional">optional</span></label><input id="profile-new-password" name="newPassword" type="password" value={profile.newPassword} onChange={handleChange} minLength={8} maxLength={200} autoComplete="new-password" disabled={busy} /></div>
    <div className="field"><label htmlFor="profile-current-password">Current password <span className="profile-optional">needed for email or password changes</span></label><input id="profile-current-password" name="currentPassword" type="password" value={profile.currentPassword} onChange={handleChange} maxLength={200} autoComplete="current-password" disabled={busy} /></div>
    <div className="field"><label htmlFor="profile-phone">Phone number <span className="profile-optional">optional · private</span></label><input id="profile-phone" name="phone" type="tel" value={profile.phone} onChange={handleChange} maxLength={30} autoComplete="tel" disabled={busy} placeholder="+1 234 567 8900" /></div>
    <div className="field"><label htmlFor="profile-bio">Bio <span className="profile-optional">optional</span></label><textarea id="profile-bio" name="bio" value={profile.bio} onChange={handleChange} maxLength={500} rows={3} disabled={busy} placeholder="A few words about you…" /><p className="profile-hint">{profile.bio.length}/500 characters</p></div>
    {error && <div className="error-message" role="alert">{error}</div>}
    <div className="profile-actions"><button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}<Check size={16} /></button></div>
  </form>
}
