// Pure mention-index logic: which entities are named in which chapters.
// Dependency-free and Node-testable. Glossary-driven exact/alias matching
// (word-bounded, case-insensitive) — never fuzzy auto-linking.

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// An entity's surface forms: its name + every alias. An alias may be a plain
// string, OR an object { form, from, until } giving the chapter range in which
// that spelling refers to THIS entity — used when a name is reused after a death
// (a "term end"). `from`/`until` are inclusive chapter numbers; null = open.
// The primary name is always open-ended.
export function aliasEntries(entity) {
  const out = []
  const push = (raw, from = null, until = null) => {
    const form = String(raw || '').trim()
    if (form) out.push({ form, from, until })
  }
  push(entity.name)
  for (const alias of entity.aliases || []) {
    if (alias && typeof alias === 'object') push(alias.form, alias.from ?? null, alias.until ?? null)
    else push(alias)
  }
  return out
}

// Case-insensitive, word-bounded matcher over an entity's name + aliases.
// Longer names first so "Jin Dandan" wins over a bare "Jin".
function entityMatcher(entity) {
  const forms = aliasEntries(entity).map((e) => e.form)
  if (!forms.length) return null
  forms.sort((a, b) => b.length - a.length)
  const alternation = forms.map(escapeRegExp).join('|')
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternation})(?![\\p{L}\\p{N}])`, 'giu')
}

// Build one combined matcher over every entity's forms, for the editor to link
// mentions inline. Returns { source, candidates } — `source` is a regex string
// (build a fresh RegExp per pass so lastIndex never leaks); `candidates` maps a
// lower-cased surface form to the entities that claim it, each with its chapter
// range: [{ id, from, until }]. More than one live candidate = an ambiguous
// mention the author resolves (same name, two characters). Longest names first.
//   entities: [{ id, name, aliases }]
export function buildMentionMatcher(entities) {
  const candidates = new Map()
  const seen = new Set()
  const forms = []
  for (const entity of entities || []) {
    for (const { form, from, until } of aliasEntries(entity)) {
      const key = form.toLowerCase()
      const list = candidates.get(key) || []
      list.push({ id: entity.id, from, until })
      candidates.set(key, list)
      if (!seen.has(key)) { seen.add(key); forms.push(form) }
    }
  }
  if (!forms.length) return null
  forms.sort((a, b) => b.length - a.length)
  const source = `(?<![\\p{L}\\p{N}])(?:${forms.map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}])`
  return { source, candidates }
}

// Resolve which entity a surface form points to at a given chapter. Filters
// candidates by chapter range, then applies the chapter's manual resolution map
// (lower-form -> id) for genuine same-chapter clashes (father/son). Returns
//   { id }                — links straight to that card
// | { form, ids }         — ambiguous; the author picks (light-yellow underline)
// | null                  — no live candidate here.
export function resolveMention(candidates, form, chapterNumber, resolveMap) {
  const key = form.toLowerCase()
  const list = candidates?.get(key)
  if (!list || !list.length) return null
  const inRange = list.filter(({ from, until }) => {
    if (chapterNumber == null) return true
    if (from != null && chapterNumber < from) return false
    if (until != null && chapterNumber > until) return false
    return true
  })
  const pool = inRange.length ? inRange : list
  const ids = [...new Set(pool.map((c) => c.id))]
  if (ids.length === 1) return { id: ids[0] }
  const pinned = resolveMap?.[key]
  if (pinned && ids.includes(pinned)) return { id: pinned }
  return { form: key, ids }
}

export function countMentions(entity, text) {
  const matcher = entityMatcher(entity)
  if (!matcher || !text) return 0
  const matches = String(text).match(matcher)
  return matches ? matches.length : 0
}

export function isMentioned(entity, text) {
  return countMentions(entity, text) > 0
}

// The distinct *surface spellings* of an entity found across the manuscript,
// each with a count. (Kept for tooling/tests; the in-app "unify" banner was
// removed — not a wanted feature for now.)
//   entity: { name, aliases }   chapters: [{ body }]
export function surfaceForms(entity, chapters) {
  const matcher = entityMatcher(entity)
  if (!matcher) return []
  const counts = new Map()
  for (const chapter of chapters) {
    for (const match of String(chapter.body || '').matchAll(matcher)) {
      const form = match[0]
      counts.set(form, (counts.get(form) || 0) + 1)
    }
  }
  return [...counts.entries()].map(([form, count]) => ({ form, count })).sort((a, b) => b.count - a.count)
}

// Build the index across chapters.
//   chapters: [{ id, number, title, body }]
//   entities: [{ id, name, aliases }]
// returns { byEntity: { [entityId]: [{ chapterId, number, title, count }] },
//           firstSeen: { [entityId]: number|null } }
export function buildIndex(chapters, entities) {
  const byEntity = {}
  const firstSeen = {}

  for (const entity of entities) {
    const matcher = entityMatcher(entity)
    const hits = []
    let first = null

    if (matcher) {
      for (const chapter of chapters) {
        const matches = String(chapter.body || '').match(matcher)
        const count = matches ? matches.length : 0
        if (count > 0) {
          hits.push({ chapterId: chapter.id, number: chapter.number ?? null, title: chapter.title, count })
          if (first === null && chapter.number != null) first = chapter.number
        }
      }
    }

    byEntity[entity.id] = hits
    firstSeen[entity.id] = first
  }

  return { byEntity, firstSeen }
}
