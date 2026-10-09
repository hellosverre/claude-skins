import type { CustomSkin, Prefs } from '../types'
import { DEFAULT_PREFS } from './command'
import { buildCustom, resolveSkin, SLOT_HELP, skinNames } from './custom'
import { SKINS } from './themes'

// The tool the person's own agent calls to design a skin with them.
export const DESIGN_TOOL = {
  name: 'design',
  description: [
    'Design, change and apply skins for the skins mod, which restyles this Claude Code transcript:',
    'tool rows on a timeline rail, tables, the spinner, the turn footer. Changes show at once.',
    'Call {"action":"show"} first: it returns the current skin, every slot with what it paints, and the names in use.',
    '"save" makes or updates a skin: name (lowercase, hyphens), base (a built-in skin it starts from),',
    'palette ({slot: "#rrggbb"}, only the slots to change), spinner (gerunds, like "Brewing"),',
    'done (past tense, like "Brewed"), apply (default true).',
    '"apply" switches to a skin by name, "delete" removes a made one,',
    '"settings" switches rail, tables, shimmer, band, clip, markdown, quiet (booleans) and icons ("unicode" or "ascii").',
    'Good skins keep fg and muted readable on a dark background, and surface and zebra one small step off it.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['show', 'save', 'apply', 'delete', 'settings'] },
      name: { type: 'string' },
      label: { type: 'string' },
      base: { type: 'string', enum: SKINS.map(skin => skin.name) },
      palette: { type: 'object', additionalProperties: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' } },
      spinner: { type: 'array', items: { type: 'string' }, maxItems: 12 },
      done: { type: 'array', items: { type: 'string' }, maxItems: 12 },
      apply: { type: 'boolean' },
      settings: {
        type: 'object',
        properties: {
          rail: { type: 'boolean' },
          tables: { type: 'boolean' },
          shimmer: { type: 'boolean' },
          band: { type: 'boolean' },
          clip: { type: 'boolean' },
          markdown: { type: 'boolean' },
          quiet: { type: 'boolean' },
          icons: { type: 'string', enum: ['unicode', 'ascii'] },
        },
      },
    },
    required: ['action'],
  },
} as const

export type DesignState = { prefs: Prefs; custom: Record<string, CustomSkin> }

export type DesignOutcome = { text: string; state: DesignState; isError: boolean }

type Input = Record<string, unknown>

const fail = (state: DesignState, text: string): DesignOutcome => ({ text, state, isError: true })

const ok = (state: DesignState, text: string): DesignOutcome => ({ text, state, isError: false })

function show(state: DesignState): DesignOutcome {
  const skin = resolveSkin(state.prefs.skin, state.custom)

  return ok(
    state,
    JSON.stringify({
      current: state.prefs.skin,
      palette: skin?.palette ?? null,
      spinner: skin?.spinner ?? [],
      done: skin?.done ?? [],
      builtIn: SKINS.map(one => one.name),
      made: Object.keys(state.custom),
      slots: SLOT_HELP,
      settings: state.prefs,
    }),
  )
}

function save(input: Input, state: DesignState): DesignOutcome {
  const name = typeof input.name === 'string' ? input.name.trim().toLowerCase() : ''
  const skin = buildCustom(input, state.custom[name])

  if (typeof skin === 'string') {
    return fail(state, skin)
  }

  const custom = { ...state.custom, [skin.name]: skin }
  const prefs = input.apply === false ? state.prefs : { ...state.prefs, skin: skin.name }

  return ok({ prefs, custom }, `saved ${skin.name}${input.apply === false ? '' : ' and applied it'}`)
}

function settings(input: Input, state: DesignState): DesignOutcome {
  const asked = (typeof input.settings === 'object' && input.settings !== null ? input.settings : {}) as Input
  const flag = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback)
  const icons = asked.icons === 'ascii' || asked.icons === 'unicode' ? asked.icons : state.prefs.icons
  const prefs: Prefs = {
    ...state.prefs,
    rail: flag(asked.rail, state.prefs.rail),
    tables: flag(asked.tables, state.prefs.tables),
    shimmer: flag(asked.shimmer, state.prefs.shimmer),
    band: flag(asked.band, state.prefs.band),
    clipOutput: flag(asked.clip, state.prefs.clipOutput),
    markdown: flag(asked.markdown, state.prefs.markdown),
    quiet: flag(asked.quiet, state.prefs.quiet),
    icons,
  }

  return ok({ ...state, prefs }, `settings: ${JSON.stringify(prefs)}`)
}

export function runDesign(raw: unknown, state: DesignState): DesignOutcome {
  const input = (typeof raw === 'object' && raw !== null ? raw : {}) as Input
  const name = typeof input.name === 'string' ? input.name.trim().toLowerCase() : ''

  switch (input.action) {
    case 'show':
      return show(state)
    case 'save':
      return save(input, state)
    case 'apply':
      return skinNames(state.custom).includes(name)
        ? ok({ ...state, prefs: { ...state.prefs, skin: name } }, `applied ${name}`)
        : fail(state, `no skin named "${name}"; show lists them`)
    case 'delete': {
      if (state.custom[name] === undefined) {
        return fail(state, `"${name}" is not a made skin; built-in skins cannot be deleted`)
      }

      const custom = Object.fromEntries(Object.entries(state.custom).filter(([key]) => key !== name))
      const prefs = state.prefs.skin === name ? { ...state.prefs, skin: DEFAULT_PREFS.skin } : state.prefs

      return ok({ prefs, custom }, `deleted ${name}`)
    }
    case 'settings':
      return settings(input, state)
    default:
      return fail(state, 'action must be show, save, apply, delete or settings')
  }
}
