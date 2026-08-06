// Deterministic avatar color + initial for an entity, so the same entity always
// looks the same across the browser, cast dock, and graphs.

const AVATAR_COLORS = [
  '#b5713a', '#5c7a4a', '#4a6a8a', '#8a5a6a',
  '#7a5a3a', '#6a4a6a', '#3f7a55', '#7a5aa0',
]

export function avatarColor(id) {
  let hash = 0
  for (const char of String(id || '')) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

export function avatarInitial(name) {
  return String(name || '?').trim().charAt(0).toUpperCase() || '?'
}
