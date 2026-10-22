import type { CustomSkin, SkinSlot } from '../types'
import type { Skin } from './skin'
import { SKINS } from './themes'

export const SLOTS: readonly SkinSlot[] = [
  'user',
  'fg',
  'muted',
  'surface',
  'zebra',
  'ok',
  'err',
  'warn',
  'read',
  'write',
  'run',
  'search',
  'web',
  'mcp',
  'other',
]

// What each slot paints, for the settings pane and the agent's tool.
export const SLOT_HELP: Readonly<Record<SkinSlot, string>> = {
  user: 'accent: the rail, your prompt marker, the spinner',
  fg: 'body text',
  muted: 'secondary text: commands, paths, timings',
  surface: 'band behind a table header',
  zebra: 'every other table row; keep it a step off the background',
  ok: 'a finished call',
  err: 'a failed call',
  warn: 'an interrupted call',
  read: 'Read',
  write: 'Edit and Write',
  run: 'Bash and PowerShell',
  search: 'Glob and Grep',
  web: 'WebFetch and WebSearch',
  mcp: 'MCP tools',
  other: 'anything else in a group',
}

export type Customs = Readonly<Record<string, CustomSkin>>

const HEX = /^#[0-9a-f]{6}$/i
const NAME = /^[a-z0-9][a-z0-9-]{0,31}$/
const MAX_WORDS = 12
const MAX_WORD = 24

const builtIn = (name: string): Skin | undefined => SKINS.find(skin => skin.name === name)

export const skinNames = (custom: Customs): string[] => [
  ...SKINS.map(skin => skin.name),
  ...Object.keys(custom).filter(name => builtIn(name) === undefined),
]

// A made skin is its base with the slots and words it changed laid over it.
export function resolveSkin(name: string, custom: Customs): Skin | undefined {
  const own = builtIn(name)

  if (own !== undefined) {
    return own
  }

  const made = custom[name]
  const base = made === undefined ? undefined : (builtIn(made.base) ?? SKINS[0])

  if (made === undefined || base === undefined) {
    return undefined
  }

  return {
    name: made.name,
    label: made.label,
    palette: { ...base.palette, ...made.palette },
    spinner: made.spinner.length > 0 ? made.spinner : base.spinner,
    done: made.done.length > 0 ? made.done : base.done,
    ...(base.ansi === undefined ? {} : { ansi: { ...base.ansi, ...made.palette } }),
  }
}

export type Draft = {
  name?: unknown
  label?: unknown
  base?: unknown
  palette?: unknown
  spinner?: unknown
  done?: unknown
}

function words(value: unknown, field: string, fallback: string[]): string[] | string {
  if (value === undefined) {
    return fallback
  }

  const valid =
    Array.isArray(value) &&
    value.length <= MAX_WORDS &&
    value.every(word => typeof word === 'string' && word.trim() !== '' && word.length <= MAX_WORD)

  return valid
    ? (value as string[]).map(word => word.trim())
    : `${field} must be up to ${MAX_WORDS} words of 1-${MAX_WORD} characters`
}

function palette(value: unknown, fallback: CustomSkin['palette']): CustomSkin['palette'] | string {
  if (value === undefined) {
    return fallback
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return 'palette must be an object of slot: "#rrggbb"'
  }

  const entries = Object.entries(value as Record<string, unknown>)
  const bad = entries.filter(
    ([slot, hex]) => !SLOTS.includes(slot as SkinSlot) || typeof hex !== 'string' || !HEX.test(hex),
  )

  if (bad.length > 0) {
    return `bad palette entries: ${bad.map(([slot]) => slot).join(', ')}. Slots: ${SLOTS.join(', ')}; values #rrggbb`
  }

  return { ...fallback, ...Object.fromEntries(entries.map(([slot, hex]) => [slot, (hex as string).toLowerCase()])) }
}

// Builds a made skin from what the agent or the pane sent, or says what is wrong with it.
export function buildCustom(draft: Draft, existing: CustomSkin | undefined): CustomSkin | string {
  const name = typeof draft.name === 'string' ? draft.name.trim().toLowerCase() : ''

  if (!NAME.test(name)) {
    return 'name must be 1-32 lowercase letters, digits or hyphens'
  }

  if (builtIn(name) !== undefined || name === 'off') {
    return `"${name}" is taken by a built-in skin; pick another name`
  }

  const base = typeof draft.base === 'string' ? draft.base : (existing?.base ?? SKINS[0]?.name ?? '')

  if (builtIn(base) === undefined) {
    return `base must be one of ${SKINS.map(skin => skin.name).join(', ')}`
  }

  const label = typeof draft.label === 'string' && draft.label.trim() !== '' ? draft.label.trim().slice(0, 32) : (existing?.label ?? name)
  const colours = palette(draft.palette, existing?.palette ?? {})
  const spinner = words(draft.spinner, 'spinner', existing?.spinner ?? [])
  const done = words(draft.done, 'done', existing?.done ?? [])

  for (const result of [colours, spinner, done]) {
    if (typeof result === 'string') {
      return result
    }
  }

  return {
    name,
    label,
    base,
    palette: colours as CustomSkin['palette'],
    spinner: spinner as string[],
    done: done as string[],
  }
}

// One slot changed from the settings pane: a built-in skin forks into `my-<name>`.
export function withSlot(
  current: string,
  custom: Customs,
  slot: SkinSlot,
  hex: string,
): { name: string; skin: CustomSkin } | string {
  if (!HEX.test(hex)) {
    return 'use a colour like #7aa2f7'
  }

  const made = custom[current]
  const name = made === undefined ? `my-${current}` : current
  const base = made?.base ?? current
  const skin = buildCustom(
    { name, base, label: made?.label ?? `My ${current}`, palette: { [slot]: hex } },
    custom[name],
  )

  return typeof skin === 'string' ? skin : { name, skin }
}
