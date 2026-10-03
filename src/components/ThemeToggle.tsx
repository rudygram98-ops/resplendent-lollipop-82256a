import { useSyncExternalStore } from 'react'
import { Moon, Sun } from 'lucide-react'
import { currentTheme, setTheme, subscribeTheme } from '@/lib/theme'

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => 'dark' as const)
  const next = theme === 'dark' ? 'light' : 'dark'
  const label = next === 'light' ? 'Light mode' : 'Dark mode'
  return <button type="button" className={`theme-toggle ${className}`.trim()} onClick={() => setTheme(next)} aria-label={`Switch to ${label.toLowerCase()}`} title={`Switch to ${label.toLowerCase()}`}>
    {next === 'light' ? <Sun size={16} /> : <Moon size={16} />}<span>{label}</span>
  </button>
}
