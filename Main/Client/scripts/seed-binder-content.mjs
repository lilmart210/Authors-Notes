// The binder half of the seeded test project: the Book pages (with the blurb's
// versions from Summary.txt as its published drafts), Plot and Notes page trees,
// and chapter draft history. Used by seed-project.mjs; mirrors the agreed
// prototype (Architecture Maps/UI Artifacts/05 - Binder (proposal).html).
// READ-ONLY on the story board; writes into the project only.

import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import * as fmt from '../src/project/format.js'
import * as ct from '../src/project/cardTree.js'
import * as book from '../src/project/book.js'
import * as drafts from '../src/project/drafts.js'

const SB = 'C:/Users/mrmar/Desktop/story board/Strongest World'

const AUTHOR = 'lilmart210'

export const BOOK_OVERVIEW = {
  title: 'Strongest World', subtitle: '', series: '', seriesNo: '', author: AUTHOR, cover: '',
  titles: ['Strongest World', 'Becoming Mortal', 'A Million Years to Become a Mortal'],
  logline: 'Humans have spent every generation seeking the pinnacle of strength. After watching for a thousand years, Jin Dandan wondered just how she would attain the title of the strongest.',
  tags: ['Cultivation', 'Xianxia', 'Female lead', 'Demons', 'Reincarnation'],
  plan: { arcs: 3, perArc: 20, words: 2500 },
}

// Summary.txt's versions, oldest first; the last is the working blurb.
const BLURBS = [
  ['Final', "The end always justifies the means. Good, bad, evil and rightousness are merely facads to gather strength. Since ancient times, those that gathered enough of it, buried those unknown to the future. In Jin DanDan's pursuit of power, what would become of the world that surrounds her. To become strong, what would she not do?"],
  ['Claude', "In a world where demons and humans vie for power, Jin DanDan awakens as a formless entity, desperate to interact with the realms she's long observed. Possessing the body of a young cultivator, she embarks on a relentless pursuit of strength. As she navigates a treacherous landscape of merging worlds and ancient family secrets, Jin DanDan must decide how far she'll go in her quest for power. In a reality where good and evil are mere illusions, what will become of the world as she rises to unimaginable heights?"],
  ['Summary 5', 'After observing the world since its inception, a wisp of conscious is finally able to interact with the world around it. Limited to a certain space, its mind gets filled with tales of conquest and heroism where strength reigns supreme.\n\nWhat would it be like to be a mortal? A mortal with strength great enough, not even time could erase it!'],
  ['Revisionist', "The end always justifies the means. Good, bad, evil and rightousness are merely facads to gather strength. Since ancient times, those that gathered enough of it, buried those unknown to the future.\n\nIn a world governed by balance, everything exists between the tension between Structure and Decay. To live is to fight entropy; to grow strong is to embrace imbalance.\n\nBorn from the desperation to exist, Jin Dandan steps into the world of emotions and flesh. Experiencing desires, tribulations and grand occasions, she felt the need to cling on, even if it was just a little longer.\n\nBut this wish could not be achieved. Falling into a cycle of decay due to her own imbalance, she will drag anything down with her if it means she can stand back up."],
]

const SYNOPSIS = "A formless consciousness has watched the world since its inception — a mental-energy treasure, a crystal spirit, that cannot touch anything. Its first attempt to live through someone else, the demonic cultivator White, ends with White sweeping the world as Devil King White until the crown prince and his three advisors bring her down. The spirit spills into her killers: those who follow the advisors' will become Imperial Scholars, those who succumb to White's become devils.\n\nReborn into a red demon egg, it hatches early as Jin Dandan, daughter of Jin Guangli and Jin Meixiu. Unable to cultivate until her incubation finishes, she buries herself in history books while Qin Peizhi's hunt for the World Revealing Stone and the auction goods pulls her family into the open.\n\nShe leaves for the human lands and the Cloud Sect, where the history she read and the history that happened stop matching."

const PUBLISHING = {
  platforms: [{ name: 'Royal Road', url: '', note: '' }],
  language: 'English', rating: '', copyright: `© 2026 ${AUTHOR}`, isbnE: '', isbnP: '',
}

// [section, parent, name, { folder, columns, summary, fields, body }]
const PAGES = [
  ['plot', null, 'Threads', { folder: true, columns: ['Status', 'Pays off'] }],
  ['plot', 'Threads', "White's Will & the Imperial Scholars", {
    summary: "White's death spills Jin Dandan's spirit into the emperor and his three advisors.", fields: { Status: 'Seeded', 'Pays off': '' },
    body: "The first Imperial Scholar was the demonic cultivator White. This imperial scholar had an unnatural craving for destruction due to the mc's influence. Because of Jin Dandan, she could not experience normal sensations. One day she realized that she could elicit feelings out of others, experiencing what she could not. White was the main character's first attempt at resurrection. However it was foiled by humans, manifesting into a certain hatred and disdain for them.\n\nUpon her death, those who defeated her had their physiques changed forever. Their bodies had become carriers of Jin Dandan's spirit as it spilt from White's body. Those that succumbed to White's will became devils and those that listened to the will of the other scholars became imperial scholars. Both wills are exactly the same.\n\nSome developed white eyes and white hair, as if suddenly filled with wisdom. Those who succumbed to the devil developed blackened veins.",
  }],
  ['plot', 'Threads', "The Prince's Revenge", {
    summary: 'The ousted prince fails, gains a second soul, and becomes the main antagonist.', fields: { Status: 'Planned', 'Pays off': '' },
    body: "The prince who is fighting for the throne at the same time the main character is ousted eventually fails in his revenge plot. But he is affected by the black energy and the mc's unique energy, and at his moment of death he is gifted a second soul. This second soul is far better than his original one and he becomes the main antagonist of the world.\n\nHe is a follower of the white demon but he doesn't believe in it himself. His true goal was to amass as much of the white demon's power by collecting others that are 'gifted' like him. One of his targets was the mc's son.",
  }],
  ['plot', 'Threads', 'The Sealed World', {
    summary: 'Hidden inside a time-keeper treasure while her sect in the decay is destroyed.', fields: { Status: 'Planned', 'Pays off': '' },
    body: "The mc has been hidden under the guise of training while her sect in the decay was destroyed in her absence. While there, she is trying to figure out the 'mission'. There wasn't a goal; the master lied to her, but she figured out her own goal and broke free.\n\nThis treasure was a 'time keeper' treasure, usually used for oracle work and keeping other treasures preserved. It had an ephemeral world that uses the user's mental powers to create many places of their imagination. Her cultivation is suppressed depending on the world she is in. When worlds are destroyed they reset — the reset is the history being rewritten, and she starts to remember the changes.",
  }],
  ['plot', 'Threads', 'Chaos & the Black Bone', {
    summary: 'Chaos as the source of mutation in the five elements; the Black Bone in her spine.', fields: { Status: 'Idea', 'Pays off': 'around Ch. 500' },
    body: "Chaos is the disharmony in the world, but that doesn't mean it destroys things. The opposite of chaos is the five elements. Chaos is the source of 'mutation' in the five elements — variant abilities and special bloodlines are the results of chaotic energy interfering with them.\n\nThe Black Bone will be in the spinal column of the mc and cause her to suffer from the affliction of chaos. It lets her travel between 'folds' at a lower cultivation level and fight people above her level. The drawback: it is not suitable with the five elements and threatens her physical existence.",
  }],
  ['plot', null, 'After the 2nd realm', {
    summary: 'The crumpled paper theory, the god realm, and her fractured core.',
    body: "After the Demon World Creature explains the crumpled paper theory, she advises that the mc go into the neighboring world, known as the 'god realm'. The mc's power is still incomplete. Cultivating in the human world, she learned to go against heaven's path and take the world energies for her own, but her inheritance is from the demon world, which believes in going with the natural flow.\n\nFor the mc, whose core has fractured into many separate pieces, cultivating to higher levels will be impossible unless she fixes her core.",
  }],

  ['notes', null, 'Ideas', {
    body: 'After gaining a physical form, the first thing it wanted to do was simply read a book…\n\nOrange-eyed demon’s name — Rudeau, Oriheim, Viktunder. “Jin Viktunder” isn’t bad.',
  }],
  ['notes', null, 'Research', { folder: true, columns: ['Link'] }],
  ['notes', 'Research', 'Chinese town names', { fields: { Link: 'https://donjon.bin.sh/name/#type=as;as=chinese_town' } }],
  ['notes', 'Research', 'Mandarin name generator', { fields: { Link: 'https://blog.reedsy.com/character-name-generator/language/mandarin-chinese/' } }],
  ['notes', 'Research', 'Top 100 Chinese surnames', { fields: { Link: 'https://www.sinosplice.com/learn-chinese/chinese-vocabulary-lists/the-top-100-chinese-surnames' } }],
  ['notes', 'Research', 'Cultivation realms', { fields: { Link: 'https://immortal-mortal.fandom.com/wiki/Cultivation_Realms' } }],
  ['notes', null, 'Scraps', { folder: true, columns: ['From'] }],
  ['notes', 'Scraps', 'The real beginning', { fields: { From: 'perfect beginning.txt' },
    body: 'The mc enters the space of the world severing sword and is for the first time able to interact with things, but the space is limited around the book and secret inheritance. There it reads the exploits of the user of the secret inheritance, paying no attention to the inheritance itself.' }],
  ['notes', 'Scraps', 'Qin’s advice to ShouShan', { fields: { From: 'scrapped.txt' },
    body: '"I have little advice, but if you still struggle to see the light maybe these words can help. Do not run. To live, you must have everything within your control, whether or not it truly is."' }],
  ['notes', 'Scraps', 'The ancestor and the orange-eyed demon', { fields: { From: 'random dialogues' },
    body: '"The moment you spoke, i knew you spoke the truth. It was simple as that."\n\n"Then why, Why didn\'t you stop this?"' }],
  ['notes', null, 'Style guide', { summary: 'Dialogue, narration and thought.',
    body: 'Text that is spoken by a character needs to be quoted.\n\nText that is spoken by the narrator is plain text.\n\nThoughts of a character need to be separated from the thoughts of the narrator. That text can be bracketed.\n\nCharacter narration describes the scene from the character’s point of view. Use I sparingly.' }],
]

async function writeDoc(path, meta, body) {
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, fmt.stringifyDocument(meta, body), 'utf8')
}

// Published drafts into <draftDir>/NNN.md; returns the stamp for the newest.
export async function writeDrafts(projectDir, draftDir, list) {
  for (const [index, draft] of list.entries()) {
    await writeDoc(join(projectDir, draftDir, drafts.draftFileName(index + 1)), { n: index + 1, date: draft.date, note: draft.note || '' }, draft.text)
  }
  const last = list[list.length - 1]
  return drafts.lastDraftStamp(list.length, last.text, last.date)
}

export const chapterDraftDir = (file) => `${fmt.CHAPTER_DIR}/${drafts.DRAFTS_DIR}/${file.replace(/\.md$/i, '')}`

// A story-board chapter file as prose: CRLF → LF, the indented title line dropped.
function storyBoardText(raw) {
  const lines = String(raw).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')
  const first = lines.findIndex((line) => line.trim())
  if (first >= 0 && /^\s+\S/.test(lines[first]) && lines[first].trim().length < 60) lines.splice(first, 1)
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// Chapter 1's real history: the original and reviewed files, then today's text.
export async function chapterOneHistory(currentText) {
  const original = storyBoardText(await readFile(`${SB}/original chapters/chapter 1.txt`, 'utf8'))
  const reviewed = storyBoardText(await readFile(`${SB}/reviewed chapters/chapter1.txt`, 'utf8'))
  return [
    { date: '2023-03-08T12:00:00.000Z', note: 'Original draft', text: original },
    { date: '2023-05-15T12:00:00.000Z', note: 'Reviewed', text: reviewed },
    { date: '2026-07-28T12:00:00.000Z', note: '', text: currentText },
  ]
}

export async function writeBinderContent(projectDir) {
  // Book pages
  const bookDir = join(projectDir, book.BOOK_DIR)
  const blurbDrafts = BLURBS.map(([label, text]) => ({ date: '2026-08-03T12:00:00.000Z', note: `Summary.txt · ${label}`, text }))
  const blurbStamp = await writeDrafts(projectDir, `${book.BOOK_DIR}/${drafts.DRAFTS_DIR}/blurb`, blurbDrafts)
  await writeDoc(join(bookDir, book.bookPageFile('overview')), BOOK_OVERVIEW, '')
  await writeDoc(join(bookDir, book.bookPageFile('blurb')), { lastDraft: blurbStamp }, BLURBS[BLURBS.length - 1][1])
  await writeDoc(join(bookDir, book.bookPageFile('synopsis')), {}, SYNOPSIS)
  await writeDoc(join(bookDir, book.bookPageFile('publishing')), PUBLISHING, '')

  // Plot and Notes page trees (a folder is a directory with _index.md)
  const folders = {} // name → directory of its children
  const orders = {}
  let count = 0
  for (const [section, parent, name, options] of PAGES) {
    const root = join(projectDir, fmt.SECTION_ROOT[section])
    const dir = parent ? folders[parent] : root
    const orderKey = `${section}/${parent || ''}`
    orders[orderKey] = (orders[orderKey] || 0) + 1
    const meta = { id: fmt.generateId(), name, type: options.folder ? 'folder' : 'page', aliases: [], order: orders[orderKey] }
    if (options.summary) meta.summary = options.summary
    if (options.columns) meta.columns = options.columns
    Object.assign(meta, options.fields || {})
    if (options.folder) {
      folders[name] = join(dir, ct.cardFolderName(name, meta.id))
      await writeDoc(join(folders[name], ct.INDEX_FILE), meta, options.body || '')
    } else {
      await writeDoc(join(dir, ct.cardLeafName(name, meta.id)), meta, options.body || '')
    }
    count++
  }
  return { pages: count, blurbDrafts: BLURBS.length }
}
