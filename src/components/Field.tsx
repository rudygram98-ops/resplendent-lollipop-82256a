import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export default function Field({ label, name, value, onChange, icon: Icon, type = 'text', placeholder, error, autoComplete, disabled, minLength, maxLength }: {
  label: string
  name: string
  value: string
  onChange: (value: string) => void
  icon: LucideIcon
  type?: string
  placeholder: string
  error?: string
  autoComplete?: string
  disabled?: boolean
  minLength?: number
  maxLength?: number
}) {
  const [visible, setVisible] = useState(false)
  const password = type === 'password'
  return <div className="field">
    <label htmlFor={name}>{label}</label>
    <div className={`input-wrap ${error ? 'invalid' : ''}`}><Icon size={18} strokeWidth={1.7} /><input id={name} name={name} value={value} onChange={(event) => onChange(event.target.value)} type={password && visible ? 'text' : type} placeholder={placeholder} autoComplete={autoComplete} disabled={disabled} required minLength={minLength} maxLength={maxLength} aria-invalid={Boolean(error)} aria-describedby={error ? `${name}-error` : undefined} />{password && <button type="button" className="visibility-button" onClick={() => setVisible(!visible)} aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} aria-pressed={visible} disabled={disabled}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>}</div>
    {error && <p className="field-error" id={`${name}-error`}>{error}</p>}
  </div>
}
