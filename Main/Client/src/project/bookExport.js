// Pure, offline manuscript export — the MVP path from the formats research:
// native Markdown / plain-text concatenation, no external tool. (Pandoc DOCX/EPUB
// layers on later as a sidecar.) Profile-based because web-serial and
// standard-manuscript formatting are near-opposites.
//
// Dependency-free apart from stripGeneratorMarkers, so it runs and tests in Node.
import { stripGeneratorMarkers } from './format.js'

export const EXPORT_PROFILES = {
  'web-serial': {
    label: 'Web serial (.txt)',
    ext: 'txt',
    heading: (_number, title) => title,
    sceneBreak: '* * *',
    separator: '\n\n\n',
  },
  markdown: {
    label: 'Markdown (.md)',
    ext: 'md',
    heading: (number, title) => `# ${number != null ? `Chapter ${number} — ` : ''}${title}`,
    sceneBreak: '***',
    separator: '\n\n',
  },
  plain: {
    label: 'Plain manuscript (.txt)',
    ext: 'txt',
    heading: (number, title) => (number != null ? `Chapter ${number} — ${title}` : title),
    sceneBreak: '* * *',
    separator: '\n\n\n',
  },
  // Pandoc profiles convert the markdown build to a binary/rich format via the
  // bundled Pandoc sidecar. They reuse the markdown heading/scene-break spec.
  docx: {
    label: 'Word · .docx (Pandoc)',
    ext: 'docx',
    pandocTo: 'docx',
    heading: (number, title) => `# ${number != null ? `Chapter ${number} — ` : ''}${title}`,
    sceneBreak: '***',
    separator: '\n\n',
  },
  epub: {
    label: 'EPUB (Pandoc)',
    ext: 'epub',
    pandocTo: 'epub',
    heading: (number, title) => `# ${number != null ? `Chapter ${number} — ` : ''}${title}`,
    sceneBreak: '***',
    separator: '\n\n',
  },
  html: {
    label: 'HTML (Pandoc)',
    ext: 'html',
    pandocTo: 'html',
    heading: (number, title) => `# ${number != null ? `Chapter ${number} — ` : ''}${title}`,
    sceneBreak: '***',
    separator: '\n\n',
  },
}

export const isPandocProfile = (profile) => Boolean(EXPORT_PROFILES[profile]?.pandocTo)

// Strip editorial markup that must never reach a reader: `%` comment / `%~`
// synopsis lines, and render `***` scene-break lines with the profile's glyph.
function cleanBody(body, sceneBreak) {
  return String(body || '')
    .split(/\r?\n/)
    .filter((line) => !/^\s*%/.test(line))
    .map((line) => (line.trim() === '***' ? sceneBreak : line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// chapters: [{ number, title, body }] in reading order.
export function buildExport(chapters, { profile = 'web-serial', includeChapterHeadings = true } = {}) {
  const spec = EXPORT_PROFILES[profile] || EXPORT_PROFILES['web-serial']
  const parts = []
  for (const chapter of chapters) {
    const body = cleanBody(stripGeneratorMarkers(chapter.body), spec.sceneBreak)
    const heading = includeChapterHeadings ? spec.heading(chapter.number, chapter.title) : ''
    parts.push([heading, body].filter(Boolean).join('\n\n'))
  }
  return `${parts.join(spec.separator).trim()}\n`
}

export function exportExtension(profile) {
  return (EXPORT_PROFILES[profile] || EXPORT_PROFILES['web-serial']).ext
}
