// Headless test for the bible document-tree storage (src/project/cardTree.js).
// Writes a nested card tree to a temp dir, reads it back through loadCardTree,
// and asserts structure, ordering, body round-trip, and resilience.
//
// Run:  node scripts/cardtree-test.mjs

import { mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stringifyDocument } from '../src/project/format.js'
import * as tree from '../src/project/cardTree.js'

const OUT = join(tmpdir(), 'an-cardtree-test')

let failures = 0
const ok = (cond, msg) => { console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`); if (!cond) failures++ }

// A node:fs adapter matching the shape loadCardTree expects.
const fs = {
  join: (...parts) => parts.filter(Boolean).join('/'),
  listDir: async (path) => (await readdir(path, { withFileTypes: true })).map((d) => ({ name: d.name, isDirectory: d.isDirectory() })),
  readText: (path) => readFile(path, 'utf8'),
  exists: async (path) => existsSync(path),
}

async function writeLeaf(dir, meta, body) {
  await writeFile(join(dir, tree.cardLeafName(meta.name, meta.id)), stringifyDocument(meta, body), 'utf8')
}
async function writeContainer(parentDir, meta, body) {
  const folder = join(parentDir, tree.cardFolderName(meta.name, meta.id))
  await mkdir(folder, { recursive: true })
  await writeFile(join(folder, tree.INDEX_FILE), stringifyDocument(meta, body), 'utf8')
  return folder
}

async function main() {
  console.log('\n== Card document-tree storage ==')
  await rm(OUT, { recursive: true, force: true })
  await mkdir(OUT, { recursive: true })

  // Build:
  //   Qin Peizhi           (leaf, order 1)
  //   Red Demon Clan        (container, order 2)
  //     Origin              (leaf, order 1)
  //     Abilities           (container, order 2)
  //       Illusions         (leaf)
  //     Culture             (leaf, order 3)
  const clanBody = '# Red Demon Clan\n\nThey cultivate the demon method.\n\n## Patterns\n\nStraight, Queen’s Physique…'
  await writeLeaf(OUT, { id: 'aaa111', name: 'Qin Peizhi', type: 'Character', order: 1 }, 'A city lord.')
  const clanDir = await writeContainer(OUT, { id: 'bbb222', name: 'Red Demon Clan', type: 'group', order: 2 }, clanBody)
  await writeLeaf(clanDir, { id: 'ccc333', name: 'Origin', type: 'Lore', order: 1 }, 'Where the red demons came from.')
  const abilDir = await writeContainer(clanDir, { id: 'ddd444', name: 'Abilities', type: 'Lore', order: 2 }, 'Illusion and law.')
  await writeLeaf(abilDir, { id: 'eee555', name: 'Illusions', type: 'Lore' }, 'Plane of illusions.')
  await writeLeaf(clanDir, { id: 'fff666', name: 'Culture', type: 'Lore', order: 3 }, 'Journey of a Thousand Years.')

  const loaded = await tree.loadCardTree(fs, OUT)

  // Top level: 2 cards, ordered Qin(1) then Red Demon Clan(2).
  ok(loaded.length === 2, 'two top-level cards')
  ok(loaded[0].meta.name === 'Qin Peizhi' && loaded[1].meta.name === 'Red Demon Clan', 'top level ordered by `order`')
  ok(loaded[0].isContainer === false && loaded[1].isContainer === true, 'leaf vs container detected')

  const clan = loaded[1]
  ok(clan.children.length === 3, 'Red Demon Clan has 3 children')
  ok(clan.children.map((c) => c.meta.name).join(',') === 'Origin,Abilities,Culture', 'children ordered Origin,Abilities,Culture')
  ok(clan.body.includes('## Patterns'), 'container body (long-form) round-trips')

  const abilities = clan.children.find((c) => c.meta.name === 'Abilities')
  ok(abilities?.isContainer && abilities.children.length === 1, 'Abilities is a nested container with 1 child')
  ok(abilities.children[0].meta.name === 'Illusions', 'deep child (Illusions) loads')

  // Flatten: 6 nodes, correct depths.
  const flat = tree.flattenCards(loaded)
  ok(flat.length === 6, 'flatten yields all 6 cards')
  ok(flat.find((r) => r.meta.name === 'Illusions')?.depth === 2, 'Illusions is at depth 2')
  ok(flat.find((r) => r.meta.name === 'Origin')?.parentId === 'bbb222', 'Origin’s parent is the clan')

  // findCard reaches deep.
  ok(tree.findCard(loaded, 'eee555')?.meta.name === 'Illusions', 'findCard reaches a deep node')

  // Resilience 1: no manifest was written or read — the whole tree came from files.
  ok(!existsSync(join(OUT, 'project.json')), 'tree loaded with NO manifest (self-describing)')

  // Resilience 2: a container folder whose _index.md is missing still loads its
  // children and recovers a name from the folder.
  await rm(join(abilDir, tree.INDEX_FILE))
  const reloaded = await tree.loadCardTree(fs, OUT)
  const abil2 = tree.findCard(reloaded, undefined) // (name-recovered container has no id)
  const clan2 = reloaded.find((c) => c.meta.name === 'Red Demon Clan')
  const abilNode = clan2.children.find((c) => c.isContainer)
  ok(abilNode && abilNode.children.length === 1 && abilNode.meta.name.startsWith('abilities'), 'missing _index.md → container still loads children + recovers a name')

  await rm(OUT, { recursive: true, force: true })
  console.log(failures ? `\n  ${failures} FAILED\n` : '\n  all passed\n')
  if (failures) process.exitCode = 1
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
