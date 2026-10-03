import { writeLocal } from '@/lib/storage'

export type Theme = 'dark' | 'light'

export const themeScript = "try{if(localStorage.getItem('buzzly:theme')==='light')document.documentElement.classList.add('light')}catch(e){}"

export function currentTheme(): Theme {
  return document.documentElement.classList.contains('light') ? 'light' : 'dark'
}

export function setTheme(theme: Theme) {
  document.documentElement.classList.toggle('light', theme === 'light')
  writeLocal('theme', theme === 'light' ? 'light' : '')
}

export function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  const onStorage = (event: StorageEvent) => { if (event.key === 'buzzly:theme') document.documentElement.classList.toggle('light', event.newValue === 'light') }
  window.addEventListener('storage', onStorage)
  return () => { observer.disconnect(); window.removeEventListener('storage', onStorage) }
}
