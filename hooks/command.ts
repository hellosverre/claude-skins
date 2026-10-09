import type { CalmSnapshot, Prefs } from '../types'

export const DEFAULT_PREFS: Prefs = {
  skin: 'noir',
  icons: 'unicode',
  rail: true,
  tables: 'on',
  shimmer: true,
  band: true,
  clipOutput: false,
  markdown: true,
  quiet: false,
  charts: true,
  math: true,
  commands: true,
  shell: true,
  highlight: true,
  hints: true,
  links: true,
  copy: true,
  fold: true,
  calm: null,
}

// The on/off settings, by the word /skin and the settings pane use for each. Tables have a
// third state, `text`, so they are switched on their own.
export const TOGGLES = {
  rail: 'rail',
  shimmer: 'shimmer',
  band: 'band',
  clip: 'clipOutput',
  markdown: 'markdown',
  quiet: 'quiet',
  charts: 'charts',
  math: 'math',
  commands: 'commands',
  shell: 'shell',
  highlight: 'highlight',
  hints: 'hints',
  links: 'links',
  copy: 'copy',
  fold: 'fold',
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

// A stored calm snapshot, or null when it is not one: then calm reads as off.
function calmOf(value: unknown): CalmSnapshot | null {
  const saved = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null

  return saved !== null && typeof saved.shimmer === 'boolean' && typeof saved.rail === 'boolean' && typeof saved.quiet === 'boolean'
    ? { shimmer: saved.shimmer, rail: saved.rail, quiet: saved.quiet }
    : null
}

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
    markdown: flagOr(saved.markdown, DEFAULT_PREFS.markdown),
    quiet: flagOr(saved.quiet, DEFAULT_PREFS.quiet),
    charts: flagOr(saved.charts, DEFAULT_PREFS.charts),
    math: flagOr(saved.math, DEFAULT_PREFS.math),
    commands: flagOr(saved.commands, DEFAULT_PREFS.commands),
    shell: flagOr(saved.shell, DEFAULT_PREFS.shell),
    highlight: flagOr(saved.highlight, DEFAULT_PREFS.highlight),
    hints: flagOr(saved.hints, DEFAULT_PREFS.hints),
    links: flagOr(saved.links, DEFAULT_PREFS.links),
    copy: flagOr(saved.copy, DEFAULT_PREFS.copy),
    fold: flagOr(saved.fold, DEFAULT_PREFS.fold),
    calm: calmOf(saved.calm),
  }
}

// /skin calm: no motion, one line per tool row, read-only output folded. What it changes is
// kept, so calm off puts back what was there before. Failures stay whole either way
// (register.tsx draws them past quiet while calm is on).
export function withCalm(current: Prefs, on: boolean): Prefs {
  if (on) {
    return current.calm !== null
      ? current
      : { ...current, calm: { shimmer: current.shimmer, rail: current.rail, quiet: current.quiet }, shimmer: false, rail: false, quiet: true }
  }

  return current.calm === null ? current : { ...current, ...current.calm, calm: null }
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
      `markdown ${onOff(current.markdown)}`,
      `quiet ${onOff(current.quiet)}`,
      `charts ${onOff(current.charts)}`,
      `math ${onOff(current.math)}`,
      `commands ${onOff(current.commands)}`,
      `shell ${onOff(current.shell)}`,
      `highlight ${onOff(current.highlight)}`,
      `hints ${onOff(current.hints)}`,
      `links ${onOff(current.links)}`,
      `copy ${onOff(current.copy)}`,
      `fold ${onOff(current.fold)}`,
      `calm ${onOff(current.calm !== null)}`,
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
    case 'calm':
      return value === 'on' || value === undefined
        ? changed(withCalm(current, true), current.calm === null ? 'calm on' : 'calm is already on')
        : value === 'off'
          ? changed(withCalm(current, false), current.calm === null ? 'calm is already off' : 'calm off: your settings are back')
          : refused(current, 'usage: /skin calm [on|off]')
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
