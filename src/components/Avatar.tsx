import { initials } from '@/lib/social'

export default function Avatar({ name, url, size }: { name: string; url?: string | null; size?: 'small' | 'large' }) {
  return <span className={`social-avatar ${size || ''}`} aria-hidden="true">{url ? <img src={url} alt="" loading="lazy" decoding="async" /> : initials(name)}</span>
}
