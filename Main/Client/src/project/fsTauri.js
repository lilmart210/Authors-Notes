// Thin filesystem adapter over the Tauri fs plugin.
//
// Everything the app touches on disk goes through here, so the project service
// stays decoupled from Tauri specifics (and could be pointed at a mock in tests).
// Atomic writes (temp file → rename) protect against a crash mid-save leaving a
// half-written chapter — part of the resilient project model.

import {
  readTextFile,
  writeTextFile,
  readDir,
  mkdir,
  exists,
  remove,
  rename,
  copyFile,
} from '@tauri-apps/plugin-fs'

export function joinPath(...parts) {
  return parts.filter(Boolean).join('/')
}

export async function readText(path) {
  return readTextFile(path)
}

let tempSeq = 0
export async function writeTextAtomic(path, contents) {
  // Unique temp name per write: if two saves of the same file overlap, they each
  // rename their OWN temp — otherwise one moves the shared .tmp and the other
  // fails with "cannot find the file" (os error 2).
  const temp = `${path}.${Date.now().toString(36)}-${tempSeq++}.tmp`
  await writeTextFile(temp, contents)
  await rename(temp, path)
}

export async function listDir(path) {
  return readDir(path)
}

export async function ensureDir(path) {
  if (!(await exists(path))) await mkdir(path, { recursive: true })
}

export async function pathExists(path) {
  return exists(path)
}

export async function removePath(path) {
  return remove(path, { recursive: true })
}

// Copy a (binary) file, e.g. a picked image into the project's media folder.
export async function copyBinary(source, dest) {
  return copyFile(source, dest)
}
