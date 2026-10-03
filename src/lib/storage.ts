const prefix = 'buzzly:'

export function readLocal(key: string) {
  try { return window.localStorage.getItem(prefix + key) ?? '' } catch { return '' }
}

export function writeLocal(key: string, value: string) {
  try {
    if (value) window.localStorage.setItem(prefix + key, value)
    else window.localStorage.removeItem(prefix + key)
  } catch {}
}

export function clearLocalDrafts() {
  try {
    Object.keys(window.localStorage).filter((key) => key.startsWith(`${prefix}draft:`)).forEach((key) => window.localStorage.removeItem(key))
  } catch {}
}
