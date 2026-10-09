import type { Prefs } from '../types'

export const DEFAULT_PREFS: Prefs = {
  skin: 'noir',
  icons: 'unicode',
  rail: true,
  tables: 'on',
  shimmer: true,
  band: true,
  clipOutput: false,
}

// The on/off settings, by the word /skin and the settings pane use for each. Tables have a
// third state, `text`, so they are switched on their own.
export const TOGGLES = {
  rail: 'rail',
  shimmer: 'shimmer',
  band: 'band',
  clip: 'clipOutput',
} as const satisfies Record<string, keyof Prefs>

export type ToggleWord = keyof typeof TOGGLES

export type Outcome = {
  prefs: Prefs
  message: string
  // `row` prints a transcript line (listings, mistakes); `toast` confirms a change quietly.
  channel: 'row' | 'toast'
}

const flagOr = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback

export const TABLE_MODES = ['on', 'text', 'off'] as const satisfies readonly Prefs['tables'][]

// Tables were on/off before `text`, so a stored boolean still reads.
export function tablesOr(value: unknown, fallback: Prefs['tables']): Prefs['tables'] {
  if (typeof value === 'boolean') {
    return value ? 'on' : 'off'
  }

  return TABLE_MODES.find(mode => mode === value) ?? fallback
}

// The settings pane's tables button steps through the modes in order.
export const nextTables = (mode: Prefs['tables']): Prefs['tables'] =>
  TABLE_MODES[(TABLE_MODES.indexOf(mode) + 1) % TABLE_MODES.length] ?? 'on'

// What the store hands back may be old, hand-edited or from another version.
export function parsePrefs(raw: unknown, names: readonly string[]): Prefs {
  const saved = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const skin = saved.skin

  return {
    skin:
      typeof skin === 'string' && (skin === 'off' || names.includes(skin))
        ? skin
        : DEFAULT_PREFS.skin,
    icons: saved.icons === 'ascii' ? 'ascii' : 'unicode',
    rail: flagOr(saved.rail, DEFAULT_PREFS.rail),
    tables: tablesOr(saved.tables, DEFAULT_PREFS.tables),
    shimmer: flagOr(saved.shimmer, DEFAULT_PREFS.shimmer),
    band: flagOr(saved.band, DEFAULT_PREFS.band),
    clipOutput: flagOr(saved.clipOutput, DEFAULT_PREFS.clipOutput),
  }
}

const changed = (prefs: Prefs, message: string): Outcome => ({ prefs, message, channel: 'toast' })

const refused = (prefs: Prefs, message: string): Outcome => ({ prefs, message, channel: 'row' })

const onOff = (on: boolean): string => (on ? 'on' : 'off')

export const listing = (current: Prefs, names: readonly string[]): string =>
  [
    ...names.map(name => `${name === current.skin ? '●' : '○'} ${name}`),
    `${current.skin === 'off' ? '●' : '○'} off`,
    [
      `icons ${current.icons}`,
      `rail ${onOff(current.rail)}`,
      `tables ${current.tables}`,
      `shimmer ${onOff(current.shimmer)}`,
      `band ${onOff(current.band)}`,
      `clip ${onOff(current.clipOutput)}`,
    ].join(' · '),
  ].join('\n')

const isToggle = (word: string): word is ToggleWord => Object.hasOwn(TOGGLES, word)

// Every argument but none: with none, /skin opens the settings pane instead.
export function runSkinCommand(args: string, current: Prefs, names: readonly string[]): Outcome {
  const [head = '', value] = args.trim().toLowerCase().split(/\s+/)

  if (isToggle(head)) {
    const field = TOGGLES[head]

    return value === 'on' || value === 'off'
      ? changed({ ...current, [field]: value === 'on' }, `${head} ${value}`)
      : refused(current, `usage: /skin ${head} on|off`)
  }

  switch (head) {
    case 'list':
      return refused(current, listing(current, names))
    // `default` and `stock` are what people reach for when they want Claude Code's own look.
    case 'off':
    case 'default':
    case 'stock':
      return changed({ ...current, skin: 'off' }, 'skins off')
    case 'on':
      return current.skin === 'off'
        ? changed({ ...current, skin: DEFAULT_PREFS.skin }, `skin: ${DEFAULT_PREFS.skin}`)
        : changed(current, `skin: ${current.skin}`)
    case 'tables':
      return value === 'on' || value === 'text' || value === 'off'
        ? changed({ ...current, tables: value }, `tables ${value}`)
        : refused(current, 'usage: /skin tables on|text|off')
    case 'icons':
      return value === 'unicode' || value === 'ascii'
        ? changed({ ...current, icons: value }, `icons: ${value}`)
        : refused(current, 'usage: /skin icons unicode|ascii')
    default:
      return names.includes(head)
        ? changed({ ...current, skin: head }, `skin: ${head}`)
        : refused(current, `unknown skin "${head}". /skin list shows them`)
  }
}
