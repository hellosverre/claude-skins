// Whether an installed copy is behind. A release is the version bump on main, so main's
// plugin.json is the latest. register.tsx does the fetching, since $ stays in that file.
export const LATEST_URL = 'https://raw.githubusercontent.com/hellosverre/claude-skins/main/.claude-plugin/plugin.json'
const DAY_MS = 24 * 60 * 60 * 1000
const PLUGIN_ID = 'skins@hellosverre-mods'

export type Checked = { at: number }

export const versionOf = (json: string): string | undefined => {
  const parsed: unknown = JSON.parse(json)
  const version = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>).version : undefined

  return typeof version === 'string' ? version : undefined
}

const partsOf = (version: string): number[] | undefined => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim())

  return match === null ? undefined : match.slice(1).map(Number)
}

// Plain x.y.z only; anything else is never called newer, so a bad file cannot nag.
export function isNewer(latest: string, current: string): boolean {
  const a = partsOf(latest)
  const b = partsOf(current)

  if (a === undefined || b === undefined) {
    return false
  }

  const at = a.findIndex((part, i) => part !== b[i])

  return at !== -1 && (a[at] ?? 0) > (b[at] ?? 0)
}

export const updateNotice = (latest: string, current: string): string =>
  `skins ${latest} is out (you have ${current}). Run: claude plugin update ${PLUGIN_ID}, then restart`

export const isDue = (raw: unknown, now: number): boolean => {
  const at = typeof raw === 'object' && raw !== null ? (raw as Partial<Checked>).at : undefined

  return typeof at !== 'number' || now - at >= DAY_MS
}
