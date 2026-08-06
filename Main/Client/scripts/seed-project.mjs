// Build a fully-populated Authors Notes test project from the Strongest World
// material so every view is alive — now as a DOCUMENT TREE (cardTree.js): rich
// entities are folders with sub-pages, and bodies carry real worldbuilding text.
// READ-ONLY on the source; writes to OUT only.
//
//   node scripts/seed-project.mjs "C:/path/to/Some Project.project"

import { readdir, readFile, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import * as fmt from '../src/project/format.js'
import * as ct from '../src/project/cardTree.js'

const SB = 'C:/Users/mrmar/Desktop/story board/Strongest World'
const SOURCE_CH = `${SB}/final Revised Chapters`
const OUT = process.argv[2] || 'C:/Users/mrmar/Desktop/Javascript/Authors Notes/Test Project/Strongest World.project'

const ids = {}
const idFor = (key) => (ids[key] ||= fmt.generateId())
const BIBLE = () => join(OUT, fmt.ENTITY_DIR)

async function writeLeaf(meta, body, dirRel = '') {
  const dir = dirRel ? join(BIBLE(), dirRel) : BIBLE()
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, ct.cardLeafName(meta.name, meta.id)), fmt.stringifyDocument(meta, body), 'utf8')
}
async function writeContainer(meta, body, subpages = [], dirRel = '') {
  const folderRel = (dirRel ? `${dirRel}/` : '') + ct.cardFolderName(meta.name, meta.id)
  await mkdir(join(BIBLE(), folderRel), { recursive: true })
  await writeFile(join(BIBLE(), folderRel, ct.INDEX_FILE), fmt.stringifyDocument(meta, body), 'utf8')
  let order = 1
  for (const sp of subpages) await writeLeaf({ ...sp.meta, order: sp.meta.order ?? order++ }, sp.body, folderRel)
}
const rels = (list) => (list.length ? { relationships: list.map(([label, to]) => ({ label, to: idFor(to) })) } : {})

async function main() {
  await rm(OUT, { recursive: true, force: true })
  await mkdir(join(OUT, fmt.CHAPTER_DIR), { recursive: true })
  await mkdir(BIBLE(), { recursive: true })
  await mkdir(join(OUT, fmt.BANK_DIR), { recursive: true })

  const manifest = fmt.createManifest({ name: 'Strongest World', author: 'lilmart210' })
  const group = manifest.tree[0]

  // ---- chapters (imported from the real .txt) ----
  const files = (await readdir(SOURCE_CH)).filter((f) => f.toLowerCase().endsWith('.txt'))
  const parsed = []
  for (const name of files) parsed.push(fmt.parseSourceChapter(name, await readFile(join(SOURCE_CH, name), 'utf8')))
  parsed.sort((a, b) => (a.number ?? 1e9) - (b.number ?? 1e9) || a.sourceName.localeCompare(b.sourceName))
  for (let i = 0; i < parsed.length; i++) {
    const doc = parsed[i]
    const id = fmt.generateId()
    const number = doc.number ?? i + 1
    const arc = number <= 5 ? 'The Auction' : number <= 19 ? 'The Jin Family' : 'Lost History'
    const pov = number <= 5 ? 'Qin Peizhi' : number <= 8 ? 'Jin Meixiu' : ''
    const meta = { id, title: doc.title, type: 'chapter', number, status: i < 4 ? 'revised' : 'draft', arc }
    if (pov) meta.pov = pov
    if (i === 0) {
      meta.summary = 'Qin Peizhi learns his prisoners escaped with the auction goods. He toys with his terrified manager ShouShan, then reveals he already holds the World Revealing Stone.'
      meta.objective = 'Establish Qin as ruthless & ahead of everyone; seed the Stone and the pursuit that drives Act 1.'
      meta.topics = [
        { title: 'The bad news', note: '“So they escaped after all…”', done: true },
        { title: 'The reveal', note: 'Qin already holds the Stone', done: false },
      ]
    }
    await writeFile(join(OUT, fmt.CHAPTER_DIR, fmt.chapterFileName(doc.title, id)), fmt.stringifyDocument(meta, doc.body), 'utf8')
    group.children.push({ id, kind: 'chapter', file: fmt.chapterFileName(doc.title, id), title: doc.title })
  }

  // ---- leaf entity cards (bodies carry the real material) ----
  // [ key, name, type, aliases, role, body, rels, extraMeta ]
  const LEAVES = [
    ['qin', 'Qin Peizhi', 'Character', ['Qin'], 'City lord',
      'City lord of Extreme Path City. Vicious but generous to his own circle. He already holds the World Revealing Stone and stays a step ahead of everyone chasing it — he toys with his terrified manager ShouShan rather than punish him outright.',
      [['manager', 'shou'], ['governs', 'extremepath'], ['holds', 'worldstone']], { Affiliation: 'Extreme Path City' }],
    ['shou', 'ShouShan', 'Character', ['Shoushan', 'Chen ShouShan'], 'Manager',
      'Qin Peizhi’s manager, terrified for his life after the prisoners escaped with the auction goods. Offers an Earth Realm favor to buy his way out of blame.',
      [['master', 'qin']], { Affiliation: 'Extreme Path City' }],
    ['lei', 'Young Master Lei', 'Character', ['Lei'], 'Clan heir',
      'Sole inheritor of the Lei clan — strong, handsome, sharp. Introduced as Qin steps out into the city.', [], { Affiliation: 'Extreme Path City' }],
    ['guangli', 'Jin Guangli', 'Character', [], 'MC’s father',
      'A sword cultivator of the Jin family. Wields the Blue Mountain sword technique, which follows the flight of the blue mountain swallowtail butterfly. His physique leans toward the Sword Heart pattern rather than a red-demon marking.',
      [['wife', 'meixiu'], ['son', 'hai'], ['daughter', 'dandan'], ['technique', 'bluemountain']],
      { 'Physique Pattern': 'Sword Heart', Race: 'Red Demon', Family: 'Jin Family' }],
    ['meixiu', 'Jin Meixiu', 'Character', [], 'MC’s mother',
      'Establishes the Jin Family City after clashing with the nameless desert group. A red demon of the Queen’s Physique. Her power is the Plane of Illusions — she can create pockets of space that entrap people inside, a hidden world or a lethal illusion. Her sword art runs First move: Thousand Catty Stance (tremendous pressure), Second: Mountain Uplift (a rising strike), Third: Retrieval (a downward strike), and Fourth-through-sixth: a sword dance executed in series.',
      [['husband', 'guangli'], ['son', 'hai'], ['daughter', 'dandan'], ['technique', 'planeofillusions']],
      { 'Physique Pattern': 'Queen’s Physique', Race: 'Red Demon', Family: 'Jin Family' }],
    ['hai', 'Jin Hai', 'Character', [], 'MC’s brother',
      'Studies his bloodline memories, cultivating in the hidden space of the cave world. His left eye weakens — it can break material apart; his right eye strengthens — it can reinforce material. For demons, abilities dye the eyes first, then sometimes the hair, nails, or aura.',
      [['father', 'guangli'], ['mother', 'meixiu'], ['sister', 'dandan']],
      { 'Physique Pattern': 'Bloodline Memories', Race: 'Red Demon', Family: 'Jin Family' }],
    ['dandan', 'Jin Dandan', 'Character', ["Xiao Dan'er", 'Xiao Dan', "Dan'er"], 'Protagonist',
      'The main character — a mental-energy treasure (a crystal spirit) reborn into a demon egg. She hatched early, at five, so she cannot cultivate until her incubation finishes and her knowledge of the world is incomplete; she buries herself in history books. Fiercely intelligent, obsessed with war chess. She originally inhabited Mei Lin’s body; Devil King White was her first resurrection attempt. Her ability, Divine Spiritual Awareness, is an abnormal variant — she can “take” pale-blue spirit-light from creatures to sharpen her senses. Her appearance shifts with cultivation: black hair and red eyes; then white hair and cloudy-white blind eyes; then silver-white hair and silver eyes. (Later: a Black Bone in her spine afflicts her with chaos; her blood turns golden as she balances the five elements.)',
      [['mother', 'meixiu'], ['father', 'guangli'], ['brother', 'hai'], ['previous body', 'meilin'], ['first resurrection', 'white'], ['grandfather', 'patriarch']],
      { 'Physique Pattern': 'Queen’s Physique', status: 'Sealed — “dead” Ch.27', Race: 'Red Demon', Family: 'Jin Family' }],
    ['patriarch', 'Red Demon Patriarch', 'Character', ['The Ancestor'], 'Grandfather · Axiom realm',
      'Jin Dandan’s grandfather, who reached the Axiom realm by fighting a void beast. Absorbing the chaos energy that permeates the beast, his variant ability “well” — a burst of power beyond his realm, letting him display many red-demon forms at once — mutated into “endless well”: a permanent, passive state that constantly raises his cultivation and displays all the clan’s techniques endlessly. Sits slumped before the library, hiding his eyes from the sun.',
      [['grandchild', 'dandan']], { Race: 'Red Demon' }],
    ['oriheim', 'Oriheim', 'Character', ['Orange Eyed Demon'], 'Red demon youth',
      'A red-demon youth bound to his clan by a heavy web of ties; he hesitates where others act. The ancestor offers to remake his past, and unlike Dan’er he cannot simply walk away from what holds him.',
      [['ancestor', 'patriarch']], { Race: 'Red Demon' }],
    ['white', 'Devil King White', 'Character', ['Imperial Scholar White'], 'Antagonist (past)',
      'The first Imperial Scholar, a demonic cultivator with an unnatural craving for destruction born of Jin Dandan’s influence — she could not feel normal sensation, but found that killing elicited feeling. She swept the world as “Devil King White” before her defeat at the hands of the crown-prince-turned-emperor and his three advisors. On her death, Jin Dandan’s spirit spilt from her body into her defeaters, seeding the two lineages: those who take the will become Imperial Scholars (white hair and eyes, filled with wisdom); those who succumb become Devils (blackened veins as the body destroys itself).',
      [['origin', 'dandan']], { Alignment: 'Antagonist' }],
    ['fourseasons', 'Four Seasons Immortal', 'Character', [], 'Chaos-realm cultivator',
      'A being from the chaotic space beyond the five elements. His weapon is the Four Seasons Pot, which refines everything between heaven and earth. He set up a smelting array to melt the MC and her world; his incarnation died setting it up while she fought him, and he is surprised to meet her again in the demon realm.',
      [['wields', 'fourseasonspot']], { Alignment: 'Antagonist' }],
    ['meilin', 'Mei Lin', 'Character', [], 'Previous body',
      'The girl whose body the MC first inhabited. Her family carries a regeneration bloodline she was unaware of — which is why Devil King White wondered that she could not control regeneration as freely as Mei Lin could.',
      [['current soul', 'dandan']], {}],
    ['longyan', 'Long Yan', 'Character', [], 'Tier-2 disciple',
      'A promising tier-2 disciple of the Traveling Cloud Sect.', [], { Sect: 'Traveling Cloud Sect', Tier: 'Tier 2' }],
    ['dingtao', 'Ding Tao', 'Character', ['Deacon Tao'], 'Deacon',
      'A deacon of the Traveling Cloud Sect and, at once, a disciple of the inner sect’s health faction — two roles held at the same time. Foundation Establishment.',
      [], { Sect: 'Traveling Cloud Sect', Tier: 'Deacon' }],

    ['extremepath', 'Extreme Path City', 'Location', [], '', 'The city Qin Peizhi governs; heart of many factions.', [], {}],
    ['jincity', 'Jin Family City', 'Location', [], '', 'Established by Jin Meixiu after clashing with the nameless desert group.', [], {}],
    ['realm', 'Realm of the Great Ocean', 'Location', [], '', 'A lower dimension: a world of water with sixteen continents. The Cloud Sect dominates one of them.', [], {}],

    ['worldstone', 'World Revealing Stone', 'Item', [], '', 'Points to a fixed place in the world; its arrow shifts when disturbed. A diviner can read the shifting arrow to track a target.', [], { Tier: 'Earth' }],
    ['spiritstone', 'Spirit Stone', 'Item', [], '', 'Crystallized energy — manifested energy with no dye. Its crystallization makes spirit “move slower”, delaying fatigue and promoting vitality. High-quality spirit stones can hold techniques.', [], { Tier: 'Mortal' }],
    ['fourseasonspot', 'Four Seasons Pot', 'Item', [], '', 'The Four Seasons Immortal’s natal treasure. It contains a world and refines everything between heaven and earth.', [], { Tier: 'Heaven' }],
    ['jadecrystal', 'Jade Crystals', 'Item', [], '', 'Store information.', [], { Tier: 'Mortal' }],
    ['soullights', 'Soul Lights', 'Item', [], '', 'Candles that reflect the life of the user bound to them.', [], { Tier: 'Earth' }],

    ['bluemountain', 'Blue Mountain Sword', 'Technique', [], '', 'Jin Guangli’s sword technique; it follows the flight of the blue mountain swallowtail butterfly.', [], {}],
    ['planeofillusions', 'Plane of Illusions', 'Technique', [], '', 'Jin Meixiu’s power — things inside the illusion act as if inside another world; it can be molded and changed at will. Used as a hidden world or a lethal trap.', [], {}],
    ['heavenlyreversal', 'Heavenly Reversal', 'Technique', [], '', 'All things under heaven take on the properties of other elements — water no longer saturates, breathing air becomes toxic, the sky fractures like brittle earth.', [], {}],
    ['soulwalk', 'Soul Walk', 'Technique', [], '', 'A very high-level technique that lets someone with a large spirit act purely on the spirit plane. Others of similar imbalance become aware of it; time passes differently there. Its lesser form is Introspection.', [], {}],
    ['distantcloud', 'Distant Cloud Steps', 'Technique', [], '', 'A Cloud Sect movement technique used to span large distances.', [], {}],

    ['stonebear', 'Stone Clawing Bear', 'Creature', [], '', 'A bear that inhabits caves, burrowing into exposed rock. Strong enough to crush raw stone; High Qi to mid Spirit Building. It prefers to flee into its burrow — but is terrifyingly well adapted to fighting in narrow spaces.', [], {}],
    ['voidbeast', 'Void Beast', 'Creature', [], '', 'A chaotic entity that inhabits the space between intersections. It cannot be defeated by the five elements alone; only variant abilities born of chaos can harm it. Its body carries absorbable chaos energy.', [], {}],

    ['queensphysique', 'Queen’s Physique', 'Term', [], '', 'A red-demon pattern: many eye-marks across the body except the forehead.', [], {}],
    ['spiritbuilding', 'Spirit Building', 'Term', [], '', 'The stage where the mind palace establishes itself; cultivation becomes easier and you can begin to introspect the body.', [], {}],
  ]
  for (const [key, name, type, aliases, role, body, r, extra] of LEAVES) {
    const meta = { id: idFor(key), name, type, aliases, status: 'new', ...extra, ...rels(r) }
    if (role) meta.role = role
    await writeLeaf(meta, body)
  }

  // ---- Power System — a Lore DOCUMENT with sub-pages (the essay finally lives here) ----
  await writeContainer(
    { id: idFor('powersys'), name: 'Power System', type: 'Lore', aliases: [], status: 'new', role: 'Worldbuilding' },
    'The world is built on **balance**. Matter is composed of two categories — Structure, which supports life and lets it grow, and Decay, which breaks things into pieces. Above both sits Spirit, which holds Structure and Decay together in a zero-sum game: increase one and the other falls. Cultivation is the art of using one’s innate spirit to create an imbalance within oneself. See the pages below.',
    [
      { meta: { id: fmt.generateId(), name: 'Structure & Decay', type: 'Lore' },
        body: 'Structure is composed of **vitality** (the resilience of a material — a low accumulation of fatigue) and **core** (its elemental makeup). Decay is made of **fatigue** (the incurred debt of existence over time) and **impurities** (the dregs within the elemental makeup). Between them lies a degree of homogeny that permits **manifestation** — phenomena occurring in reality when core elements are mixed into certain shapes and concentrations. Fully-structured or fully-decayed matter devolves into another system, balancing itself out.' },
      { meta: { id: fmt.generateId(), name: 'Spirit & Manifestation', type: 'Lore' },
        body: 'Spirit has no physical presence and no quantity — it is subjective, universally present, and relies on understanding. You cannot increase the amount of spirit in an area; you alter it through understanding and physical properties (e.g. absorbing spirit stones). Living beings can’t project spirit, but they can share understanding — which lets them manifest attacks and phenomena. Where understanding breaks, manifestation occurs; **Dreg** is Decay’s manifestation — homogenous, boundary-less matter.' },
      { meta: { id: fmt.generateId(), name: 'The Two Methods', type: 'Lore' },
        body: 'The **Human Method** creates a *temporary* imbalance: cultivators manifest pure energy and store it in origin points (spirit cores). The **Demon Method** is a *constant* imbalance (superior) — demons have a spirit core and refine it by stacking layers, energy leaching into the surrounding body. “Demon” means born with a spirit core; “human” means without one. Some demons practise human techniques by never strengthening their core while young, trading longevity for versatility.' },
      { meta: { id: fmt.generateId(), name: 'Cultivation Stages', type: 'Lore' },
        body: 'Ranks per level: low, mid, high, peak, half-step.\n\n**Humans** — [Mortal] Qi Gathering → Spirit Building → Bloodline Awakening; [Earth] Foundation Establishment → Core Condensation → True Lake; [Heaven] Revolving Core → … → True God.\n\n**Demons** — Flood Demon → Awakening → Manifestation → Ascension.\n\nThe two ladders converge at **Worldly King** (undying body) → **Spirit King** (undying spirit) → Harmony/Unification → Distraction → **Creator** (the strongest state — able to destroy whole folds). A Flood Demon is roughly a peak Bloodline-awakened human.' },
    ],
  )

  // ---- Red Demons — a collection (rule: Race = Red Demon) AND a document with sub-pages ----
  await writeContainer(
    { id: idFor('reddemons'), name: 'Red Demons', type: 'group', aliases: [], status: 'new', role: 'Race',
      memberRule: { key: 'Race', value: 'Red Demon' },
      attributes: [{ key: 'Aura Color', mode: 'fixed', value: 'Red' }, { key: 'Pattern', mode: 'per-member', value: '' }] },
    'A demon race whose abilities are normally split between **illusions** and **world/law utilization** (like the five elements). A red demon’s power dyes the eyes first, then the hair, nails, and aura in red. Members carry a **pattern** that shapes their gifts.',
    [
      { meta: { id: fmt.generateId(), name: 'Patterns', type: 'Lore' },
        body: 'The **Queen’s Physique** is a straight/eye-mark pattern: many eye-marks across the body except the forehead. Jin Meixiu and Jin Dandan both bear it. Patterns are per-member — a red demon may instead carry a Sword-Heart lean (Jin Guangli) or Bloodline-Memory gift (Jin Hai).' },
      { meta: { id: fmt.generateId(), name: 'Abilities', type: 'Lore' },
        body: 'Red-demon power manifests as colour — beginning in the eyes, sometimes spreading to hair, nails, or aura. Their two branches are **illusions** (Jin Meixiu’s Plane of Illusions) and **law/element utilization** — wielding the elements by force, tearing apart the laws that hold them together (Heavenly Reversal).' },
      { meta: { id: fmt.generateId(), name: 'Journey of a Thousand Years', type: 'Lore' },
        body: 'An ancient red-demon ceremony of approval: a demon must go and conquer a world to prove his worth to the clan.' },
    ],
  )

  // ---- leaf collections (mostly DERIVED by attribute; a few explicit) ----
  // [ key, name, role, explicitMemberKeys, attributes, rels, inheritsKey, memberRule ]
  const COLLECTIONS = [
    ['jinfamily', 'Jin Family', 'Family', [],
      [['Surname', 'fixed', 'Jin'], ['Physique Pattern', 'per-member', ''], ['Home', 'fixed', 'Jin Family City']],
      [['guangli', 'meixiu', 'married'], ['guangli', 'hai', 'father'], ['guangli', 'dandan', 'father'], ['meixiu', 'hai', 'mother'], ['meixiu', 'dandan', 'mother'], ['hai', 'dandan', 'sibling']],
      'reddemons', { key: 'Family', value: 'Jin Family' }],
    ['cloudsect', 'Cloud Sect', 'Sect', ['hiddencloud', 'travelingcloud'],
      [['Continent', 'fixed', 'Realm of the Great Ocean']], [], null, null],
    ['hiddencloud', 'Hidden Cloud Mountain', 'Sect', [], [], [], null, null],
    ['travelingcloud', 'Traveling Cloud Sect', 'Sect', [], [['Tier', 'per-member', '']], [], null, { key: 'Sect', value: 'Traveling Cloud Sect' }],
    ['qinfaction', 'House of Qin Peizhi', 'Faction', [], [], [], null, { key: 'Affiliation', value: 'Extreme Path City' }],
    ['antagonists', 'Antagonists', 'Faction', [], [], [], null, { key: 'Alignment', value: 'Antagonist' }],
    ['treasures', 'Treasures', 'Collection', [], [['Tier', 'per-member', '']], [], null, { key: 'type', value: 'Item' }],
    ['techniquesc', 'Techniques', 'Collection', [], [], [], null, { key: 'type', value: 'Technique' }],
    ['bestiary', 'Bestiary', 'Collection', [], [], [], null, { key: 'type', value: 'Creature' }],
    ['places', 'Places', 'Collection', [], [], [], null, { key: 'type', value: 'Location' }],
    ['glossary', 'Glossary', 'Collection', [], [], [], null, { key: 'type', value: 'Term' }],
  ]
  for (const [key, name, role, memberKeys, attrs, r, inherits, memberRule] of COLLECTIONS) {
    const meta = {
      id: idFor(key), name, type: 'group', aliases: [], status: 'new', role,
      members: memberKeys.map(idFor),
      attributes: attrs.map(([k, mode, value]) => ({ key: k, mode, value })),
      relationships: r.map(([from, to, label]) => ({ from: idFor(from), to: idFor(to), label })),
    }
    if (inherits) meta.inherits = idFor(inherits)
    if (memberRule) meta.memberRule = memberRule
    await writeLeaf(meta, '')
  }

  // ---- data banks ----
  const banks = {
    cities: ['Extreme Path City', 'Verdant Hollow', 'Ninefold Ridge', 'Cloud Reach', 'Ashen Port', 'Stonewell', 'Mistfall'],
    surnames: ['Jin', 'Lei', 'Hua', 'Li', 'Qin', 'Gao', 'Hong', 'Yao', 'Liu', 'Xue', 'He', 'Gong'],
    'given-names': ['Peizhi', 'Meixiu', 'Guangli', 'Dandan', 'Shuang', 'Bao', 'Song', 'Feng', 'Rong', 'Bai', 'Tingfeng'],
  }
  for (const [name, entries] of Object.entries(banks)) {
    await writeFile(join(OUT, fmt.BANK_DIR, fmt.bankFileName(name)), entries.join('\n'), 'utf8')
  }

  await writeFile(join(OUT, fmt.MANIFEST_FILE), fmt.serializeManifest(manifest), 'utf8')
  console.log(`\n  ✓ seeded project at:\n    ${OUT}`)
  console.log(`    ${group.children.length} chapters · ${LEAVES.length} entities · 2 document containers (w/ sub-pages) · ${COLLECTIONS.length} collections · ${Object.keys(banks).length} banks\n`)
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
