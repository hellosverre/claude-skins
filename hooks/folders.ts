import type { Prefs } from '../types'
import { parsePrefs } from './command'

// Folders that keep their own look, by the session's directory. A folder not named
// here follows the default prefs.
export type Folders = Record<string, Prefs>

export function parseFolders(raw: unknown, names: readonly string[]): Folders {
  const saved = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}

  return Object.fromEntries(Object.entries(saved).map(([folder, prefs]) => [folder, parsePrefs(prefs, names)]))
}

export const prefsFor = (folder: string, folders: Folders, fallback: Prefs): Prefs =>
  (Object.hasOwn(folders, folder) ? folders[folder] : undefined) ?? fallback

export const withFolder = (folders: Folders, folder: string, prefs: Prefs): Folders => ({ ...folders, [folder]: prefs })

export const withoutFolder = (folders: Folders, folder: string): Folders =>
  Object.fromEntries(Object.entries(folders).filter(([name]) => name !== folder))
