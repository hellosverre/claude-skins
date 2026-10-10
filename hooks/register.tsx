import { atom, memberOf, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderSurface, Timer } from 'claude-code'

import type { CustomSkin, Disclosure, Prefs, SkinSlot, SkinsMarkdownArgs, Touch, TurnStats, UsageSnap } from '../types'
import { DEFAULT_PREFS, nextTables, parsePrefs, runSkinCommand, TOGGLES, withCalm } from './command'
import { buildCustom, resolveSkin, skinNames, withSlot } from './custom'
import { forTheme, gnomeDark, macDark, resolveLight, windowsDark } from './light'
import { parseFolders, prefsFor, withFolder, withoutFolder } from './folders'
import { DESIGN_TOOL, runDesign } from './designer'
import type { DesignState } from './designer'
import { clipLines, diffstat, pick } from './format'
import { bodyOf, inputFields, isOpen } from './detail'
import { disclosedRow, openedRows } from './detail-rows'
import { copyOf } from './markdown'
import { CHART_HINT } from './mermaid'
import { commandSegments } from './command-output'
import { askBand, desktopSpinnerRow, diffCard, footerRow, terminalCard, usageBand, groupRow, promptRow, quietResult, replyRows, spinnerRow, toolRow } from './rows'
import type { Look, SvgElement, Ui } from './rows'
import { galleryPane } from './gallery'
import { keepsOwnRow, SHELLS, shellResultOf } from './shell'
import { OUTPUT_FOLD, shellRows } from './shell-rows'
import { settingsPane } from './settings'
import { sightings } from './sightings'
import { ICONS } from './skin'
import type { Skin } from './skin'
import { hunksOf } from './svg-diff'
import { shellOutputOf } from './svg-terminal'
import { limitLabel, metersOf } from './svg-usage'
import { shortenPath } from './format'
import { kindOf, summarize, toolLabel } from './tools'
import { commandOf, errorLine, isQuiet, quietLabel } from './quiet'
import { MAX_MARKDOWN, replySegments } from './reply'
import { isDue, isNewer, LATEST_URL, updateNotice, versionOf } from './updates'
import { hyperlinksFrom, touchOf } from './links'
import type { Checked } from './updates'

const SETTINGS = 'skins-settings'
const GALLERY = 'skins-gallery'
const DESIGN = `mcp__skins__${DESIGN_TOOL.name}`
const DESIGN_MATCH = /^mcp__skins__design$/

// A longer prompt keeps Claude Code's own drawing, which folds a big paste.
const MAX_PROMPT = 4000

const CLIP_HEAD = 8
const CLIP_TAIL = 4
const FRAME_MS = 90
const SETTLE_LEAD_MS = FRAME_MS
const FAST_RETRIES = 4
const RETRY_MAX_MS = 1000
const STALE_AHEAD_MS = RETRY_MAX_MS + 1000
const KEPT_TURNS = 40
// How often an `auto` theme asks the system again: nothing tells a plugin it changed.
const APPEARANCE_MS = 5000

const prefsAtom = atom({ plugin: 'skins', key: 'prefs' } as const, DEFAULT_PREFS)
const customAtom = atom({ plugin: 'skins', key: 'custom' } as const, {})
const startedAtom = atom({ plugin: 'skins', key: 'startedAt' } as const, 0)
const frameAtom = atom({ plugin: 'skins', key: 'frame' } as const, 0)
const turnsAtom = atom({ plugin: 'skins', key: 'turns' } as const, {})
const durationAtom = atom({ plugin: 'skins', key: 'duration' } as const, -1)
const editingAtom = atom({ plugin: 'skins', key: 'editing' } as const, 'user' as SkinSlot)
const lightAtom = atom({ plugin: 'skins', key: 'isLight' } as const, false)
const imagesAtom = atom({ plugin: 'skins', key: 'images' } as const, false)
// Whether a call only looked, so quiet output folds its result away.
const quietAtom = atom({ plugin: 'skins', key: 'quiet' } as const, false)
const commandAtom = atom({ plugin: 'skins', key: 'command' } as const, '')
const usageAtom = atom({ plugin: 'skins', key: 'usage' } as const, { context: null, limits: [] } as UsageSnap)
const compactingAtom = atom({ plugin: 'skins', key: 'compacting' } as const, false)
const pinnedAtom = atom({ plugin: 'skins', key: 'pinned' } as const, false)
const settleAtom = atom({ plugin: 'skins', key: 'settle' } as const, 0)
// Whether each tool row is open, as the person left it; `auto` opens a failed call.
const disclosureAtom = atom({ plugin: 'skins', key: 'disclosure' } as const, 'auto' as Disclosure)
// Whether an opened row shows its answer whole, past the fold.
const allAtom = atom({ plugin: 'skins', key: 'showAll' } as const, false)
// Files this turn created or edited, by absolute path.
const touchedAtom = atom({ plugin: 'skins', key: 'touched' } as const, {} as Record<string, Touch>)
// Per drawing, the blocks the person unfolded.
const foldsAtom = atom({ plugin: 'skins', key: 'folds' } as const, [] as string[])
// The main loop's last answer, for `/skin copy`.
const lastReplyAtom = atom({ plugin: 'skins', key: 'lastReply' } as const, '')

const EDITS = new Set(['Edit', 'MultiEdit', 'Write'])
const WRITES = new Set([...EDITS, 'NotebookEdit'])

// Only a person's own typing becomes a prompt row: a task notification or a peer's
// message is not theirs to dress as theirs.
const TYPED = new Set(['composer', 'bridge', 'sdk'])

type Active = { prefs: Prefs; skin: Skin; custom: Record<string, CustomSkin> }

const NO_STATS: TurnStats = { tools: 0, added: 0, removed: 0 }

async function activeSkin($: EngineInterface): Promise<Active | null> {
  const prefs = await read($, prefsAtom)
  const custom = await read($, customAtom)
  const skin = resolveSkin(prefs.skin, custom)

  return skin === undefined ? null : { prefs, skin: forTheme(skin, await read($, lightAtom)), custom }
}

// Where each system keeps its appearance, and how to read the answer.
const PROBES = [
  { argv: ['defaults', 'read', '-g', 'AppleInterfaceStyle'], dark: macDark },
  {
    argv: ['reg', 'query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', '/v', 'AppsUseLightTheme'],
    dark: windowsDark,
  },
  { argv: ['gsettings', 'get', 'org.gnome.desktop.interface', 'color-scheme'], dark: gnomeDark },
] as const

// Read once a session or a turn and kept here: each read through `$` is a dispatch, and
// every row draws often. Whether the terminal draws OSC 8 links, the session's folder, and
// whether this turn has touched a file at all (the list itself is `touchedAtom`).
let hyperlinks = false
let sessionCwd: string | undefined
let hasTouched = false

const cwdOf = async ($: EngineInterface): Promise<string> => sessionCwd ?? (await $.session.cwd())

// The probe that answered last, so the timer asks one system rather than all three.
let answering: (typeof PROBES)[number] | undefined

// The system's appearance, for an `auto` theme. Undefined when no probe answers.
async function systemDark($: EngineInterface): Promise<boolean | undefined> {
  for (const probe of answering === undefined ? PROBES : [answering, ...PROBES]) {
    try {
      const dark = probe.dark(await $.process.run([...probe.argv], { timeoutMs: 2000 }))

      if (dark !== undefined) {
        answering = probe
        return dark
      }
    } catch {
      // The other systems' tools are missing here; that is expected, not a failure.
    }
  }

  answering = undefined
  return undefined
}

// Claude Code's own theme decides whether skins draw for a light or a dark background:
// `SKINS_THEME` first, then the theme setting, and for `auto` the terminal and the system.
// `theme` is a value just written, which `$.config.list()` does not answer with yet.
// Resolves true when the answer came from the system's appearance, which can change under it.
async function refreshTheme($: EngineInterface, theme?: unknown): Promise<boolean> {
  const hints = {
    override: await $.env.get('SKINS_THEME'),
    theme: theme ?? (await $.config.list()).find(row => row.key === 'theme')?.value,
    colorfgbg: await $.env.get('COLORFGBG'),
  }
  // Asks the system only when nothing before it decided.
  const needsSystem = resolveLight(hints) !== resolveLight({ ...hints, systemDark: false })
  const dark = needsSystem ? await systemDark($) : undefined
  const isLight = resolveLight({ ...hints, systemDark: dark })

  // A write redraws every row, and the system is asked again every few seconds.
  if ((await read($, lightAtom)) !== isLight) {
    await update($, lightAtom, () => isLight)
  }

  return dark !== undefined
}

// Asks the system again on a timer while the theme follows it; any other theme stops it.
let appearance: Timer | undefined

async function followTheme($: EngineInterface, theme?: unknown): Promise<void> {
  const followsSystem = await refreshTheme($, theme)

  appearance?.cancel()
  appearance = followsSystem
    ? $.clock.every(APPEARANCE_MS, () => {
        void refreshTheme($).catch((error: unknown) => {
          $.ui.log(error instanceof Error ? error.message : String(error), { to: 'debug' })
        })
      })
    : undefined
}

// Every surface's element table names Svg, but the terminal draws it as nothing, so
// vector icons are for the other surfaces only.
const lookOf = (
  ui: Ui & { Svg?: SvgElement },
  active: Active,
  surface: RenderSurface,
  copy?: (text: string) => void,
): Look => ({
  ui,
  skin: active.skin,
  icons: ICONS[active.prefs.icons],
  prefs: active.prefs,
  surface,
  ...(surface !== 'terminal' && ui.Svg !== undefined ? { svg: ui.Svg } : {}),
  // `/skin copy off` takes every copy button away.
  ...(copy === undefined || !active.prefs.copy ? {} : { copy }),
})

// What a drawing adds to its look from the session: links where they can be drawn, this
// turn's files, and the blocks the person unfolded in it. Each is a read on every draw, so
// a drawing asks only for what it can show.
type Needs = { links?: boolean; touched?: boolean; folds?: boolean; cwd?: string }

async function sessionLook($: EngineInterface, e: { requestId: string; surface: RenderSurface }, look: Look, needs: Needs): Promise<Look> {
  const folds = memberOf(foldsAtom, e)
  const links = needs.links === true && look.prefs.links && (e.surface !== 'terminal' || hyperlinks)
  const touched = needs.touched === true && hasTouched ? { files: await read($, touchedAtom), cwd: needs.cwd ?? (await cwdOf($)) } : undefined
  const open = needs.folds === true && look.prefs.fold ? new Set(await read($, folds)) : undefined

  return {
    ...look,
    links,
    ...(touched === undefined ? {} : { touched }),
    ...(open === undefined
      ? {}
      : {
          folds: {
            open,
            toggle: (key: string) =>
              void update($, folds, keys => (keys.includes(key) ? keys.filter(kept => kept !== key) : [...keys, key])),
          },
        }),
  }
}

// What a reply's blocks can show: links where it has a URL, file colours where it names a
// path, fold controls where it has code or a table.
const replyNeeds = (text: string, segments: readonly { kind: string }[]): Needs => ({
  links: /https?:\/\//.test(text),
  touched: /[\w.-]\/[\w.-]|\w\.[A-Za-z]{1,5}\b/.test(text),
  folds: segments.some(segment => segment.kind === 'code' || segment.kind === 'table'),
})

// Whether the terminal draws OSC 8 links, from the environment it was started in.
async function readHyperlinks($: EngineInterface): Promise<void> {
  // Each name spelled out: the engine lists the variables a module reads from its source.
  const supported = hyperlinksFrom({
    FORCE_HYPERLINK: await $.env.get('FORCE_HYPERLINK'),
    TERM_PROGRAM: await $.env.get('TERM_PROGRAM'),
    TERM_PROGRAM_VERSION: await $.env.get('TERM_PROGRAM_VERSION'),
    TERM: await $.env.get('TERM'),
    WT_SESSION: await $.env.get('WT_SESSION'),
    VTE_VERSION: await $.env.get('VTE_VERSION'),
    KONSOLE_VERSION: await $.env.get('KONSOLE_VERSION'),
    TMUX: await $.env.get('TMUX'),
    CI: await $.env.get('CI'),
  })

  hyperlinks = supported
}

// A drawing's cards animate on their first draw only, keyed by the drawing's instance
// (the message id, the tool_use_id) so two replies never share a card.
const seenCards = sightings()
const settling = new Map<string, { at: number; cards: string[] }>()
let settlingNow = new Set<string>()
let refusals = 0

const drawingOf = (e: { surface: RenderSurface; requestId: string }): string => `${e.surface}:${e.requestId}`

const drawnBy = (drawing: string, drawnAt: number) => (key: string, entranceMs: number) => {
  const card = `${drawing}:${key}`

  if (settlingNow.delete(card)) {
    seenCards(card)

    return false
  }

  const isFirst = seenCards(card)

  if (isFirst) {
    const pending = settling.get(drawing)

    settling.set(drawing, {
      at: Math.max(pending?.at ?? 0, drawnAt + entranceMs - SETTLE_LEAD_MS),
      cards: [...(pending?.cards ?? []), card],
    })
  }

  return isFirst
}

// Calm draws every card settled, its first draw included.
async function firstDraws($: EngineInterface, e: { surface: RenderSurface; requestId: string }, prefs: Prefs): Promise<(key: string, entranceMs: number) => boolean> {
  const drawing = drawingOf(e)
  settling.delete(drawing)

  return prefs.calm === null ? drawnBy(drawing, await $.clock.now()) : () => false
}

async function withSettle<T>($: EngineInterface, e: { surface: RenderSurface; requestId: string }, drawn: T): Promise<T> {
  if (settling.has(drawingOf(e))) {
    await read($, settleAtom)
  }

  return drawn
}

async function settleEntrances($: EngineInterface, isForced = false): Promise<boolean> {
  const now = await $.clock.now()
  const isDue = (at: number): boolean => at <= now || at > now + STALE_AHEAD_MS

  if (settling.size === 0 || (!isForced && ![...settling.values()].some(pending => isDue(pending.at)))) {
    return true
  }

  const moved = [...settling]
  settlingNow = new Set(moved.flatMap(([, pending]) => pending.cards))
  settling.clear()

  return update($, settleAtom, round => round + 1).then(
    () => {
      refusals = 0

      return true
    },
    (error: unknown) => {
      refusals += 1
      const retryAt = now + Math.min(RETRY_MAX_MS, refusals <= FAST_RETRIES ? 0 : FRAME_MS * 2 ** (refusals - FAST_RETRIES))

      for (const [drawing, pending] of moved) {
        if (!settling.has(drawing)) {
          settling.set(drawing, { ...pending, at: retryAt })
        }
      }

      $.ui.log(`settle: ${error instanceof Error ? error.message : String(error)}`, { to: 'debug' })

      return false
    },
  )
}

// Made skins from the store, each checked again: the store may hold an older shape.
function parseCustom(raw: unknown): Record<string, CustomSkin> {
  const saved = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}

  return Object.fromEntries(
    Object.values(saved)
      .map(draft => buildCustom(draft as Record<string, unknown>, undefined))
      .filter((skin): skin is CustomSkin => typeof skin !== 'string')
      .map(skin => [skin.name, skin]),
  )
}

async function load($: EngineInterface): Promise<void> {
  const custom = parseCustom(await $.store.get('custom'))
  const names = skinNames(custom)
  const folders = parseFolders(await $.store.get('folders'), names)
  const folder = await $.session.cwd()
  sessionCwd = folder
  const prefs = prefsFor(folder, folders, parsePrefs(await $.store.get('prefs'), names))

  await update($, customAtom, () => custom)
  await update($, prefsAtom, () => prefs)
  await update($, pinnedAtom, () => Object.hasOwn(folders, folder))
  // Links stay text if the environment cannot be read; the look loads either way.
  await readHyperlinks($).catch((error: unknown) => {
    $.ui.log(`hyperlink check: ${error instanceof Error ? error.message : String(error)}`, { to: 'debug' })
  })
}

// A pinned folder keeps its prefs to itself; every other folder shares the default.
async function savePrefs($: EngineInterface, prefs: Prefs): Promise<void> {
  if (!(await read($, pinnedAtom))) {
    await $.store.set('prefs', prefs)

    return
  }

  const names = skinNames(await read($, customAtom))
  const folders = parseFolders(await $.store.get('folders'), names)
  await $.store.set('folders', withFolder(folders, await $.session.cwd(), prefs))
}

// /skin pin, unpin and share: this folder's own look, or the default.
async function runFolderCommand($: EngineInterface, word: string): Promise<string> {
  const folder = await $.session.cwd()
  const custom = await read($, customAtom)
  const names = skinNames(custom)
  const folders = parseFolders(await $.store.get('folders'), names)
  const prefs = await read($, prefsAtom)

  switch (word) {
    case 'pin':
      await $.store.set('folders', withFolder(folders, folder, prefs))
      await update($, pinnedAtom, () => true)

      return 'this folder keeps its own look'
    case 'unpin': {
      const fallback = parsePrefs(await $.store.get('prefs'), names)
      await $.store.set('folders', withoutFolder(folders, folder))
      await update($, pinnedAtom, () => false)
      await update($, prefsAtom, () => fallback)

      return `this folder follows the default: ${fallback.skin}`
    }
    default:
      await $.store.set('prefs', prefs)

      return `default look: ${prefs.skin}`
  }
}

async function refreshUsage($: EngineInterface): Promise<void> {
  const usage = await $.session.usage()
  const snap: UsageSnap = {
    context: usage.context.percent ?? null,
    limits: usage.rateLimits.map(limit => ({ label: limitLabel(limit.kind), percent: limit.percentUsed })),
  }

  if (JSON.stringify(metersOf(await read($, usageAtom))) === JSON.stringify(metersOf(snap))) {
    return
  }

  await settleEntrances($, true)
  await update($, usageAtom, () => snap)
}

async function checkForUpdate($: EngineInterface): Promise<void> {
  const now = await $.clock.now()

  if (!isDue(await $.store.get('updateCheck'), now)) {
    return
  }

  // Stamped before the fetch, so an offline machine is not asked again every session.
  await $.store.set('updateCheck', { at: now } satisfies Checked)

  const current = versionOf(await $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`))
  const response = await $.http.fetch(LATEST_URL)

  if (!response.ok) {
    throw new Error(`update check: ${LATEST_URL} answered ${response.status}`)
  }

  const latest = versionOf(response.text)

  if (current !== undefined && latest !== undefined && isNewer(latest, current)) {
    $.ui.toast(updateNotice(latest, current), { timeoutMs: 12_000 })
  }
}

async function commit($: EngineInterface, state: DesignState): Promise<void> {
  await update($, customAtom, () => state.custom)
  await update($, prefsAtom, () => state.prefs)
  await $.store.set('custom', state.custom)
  await savePrefs($, state.prefs)
}

async function designState($: EngineInterface): Promise<DesignState> {
  return { prefs: await read($, prefsAtom), custom: await read($, customAtom) }
}

const SURFACES: readonly RenderSurface[] = ['terminal', 'desktop', 'vscode', 'mobile']

// `$.skins.markdown`: markdown drawn the way the skin draws a reply, for another mod's
// drawing. Undefined when the skin is off or the text holds nothing it draws. No copy or
// fold controls: a press cannot cross from one mod's tree to another's.
async function drawMarkdown($: EngineInterface, args: SkinsMarkdownArgs): Promise<RenderElement | undefined> {
  if (!SURFACES.includes(args.surface) || typeof args.text !== 'string' || !Number.isFinite(args.columns)) {
    throw new Error('skins.markdown takes { surface, text, columns }: a surface name, a string and a number')
  }

  const active = await activeSkin($)
  const segments = active === null || args.text.length > MAX_MARKDOWN * 4 ? null : replySegments(args.text, active.prefs, args.surface)

  if (active === null || segments === null) {
    return undefined
  }

  const ui = $.ui.resolve({ surface: args.surface, component: 'AssistantMessage' })
  const svg = args.surface !== 'terminal' && active.prefs.tables === 'on' && 'Svg' in ui ? ui.Svg : undefined
  const links = active.prefs.links && (args.surface !== 'terminal' || hyperlinks)

  return replyRows({ ...lookOf(ui, active, args.surface), links, isFirstDraw: () => false }, segments, Math.max(20, Math.floor(args.columns)), svg)
}

export const register: Register = on => {
  // Adds `$.skins` for other mods. A call is the `skins.markdown` event, which the hook
  // below answers with this session's `$`; the method itself is the chain's floor.
  on('engine.create', async ($, e, next) => {
    const built = await next(e)

    return { ...built, skins: { markdown: async () => undefined } }
  })

  on('skins.markdown', async ($, e) => ({ value: await drawMarkdown($, e) }))

  // What the turn on the main loop has done so far, for its footer.
  let stats: TurnStats = NO_STATS
  let isWorking = false
  let ticker: Timer | undefined
  // The width the last reply was drawn at, shown by /skin list to tune table sizing.
  let lastColumns: number | undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'skin',
      description: 'Open the skin settings, or /skin <name | list | off>',
      argumentHint: '[gallery | copy | copy code | name | list | off | calm | pin | unpin | share | rail | tables | shimmer | band | clip | markdown | quiet | charts | math | commands | shell | highlight | hints | links | fold | icons]',
      immediate: true,
    })
    await $.tool.register({
      name: DESIGN_TOOL.name,
      description: DESIGN_TOOL.description,
      inputSchema: DESIGN_TOOL.inputSchema,
    })
    await load($)
    await refreshUsage($)
    await followTheme($)

    // Off the start's path: a slow or offline network must not hold the session up.
    void checkForUpdate($).catch((error: unknown) => {
      $.ui.log(error instanceof Error ? error.message : String(error), { to: 'debug' })
    })

    // Only the spinner reads the frame, so a tick redraws the spinner and nothing else.
    ticker?.cancel()
    ticker = $.clock.every(FRAME_MS, () => {
      if (isWorking) {
        void update($, frameAtom, frame => frame + 1)
      }

      if (settling.size > 0) {
        void settleEntrances($)
      }
    })

    return next(e)
  })

  // /clear, /resume and /branch reset $.state to its defaults and skip session.start.
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    await load($)
    await followTheme($)

    return next(e)
  })

  on('ui.invalidate', async ($, e, next) => {
    if (e.event === 'ui.render' && !(await settleEntrances($, true)) && refusals <= FAST_RETRIES) {
      await $.clock.sleep(FRAME_MS / 3)
      await settleEntrances($, true)
    }

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    stats = NO_STATS
    isWorking = true
    // A worktree can move the session between turns.
    sessionCwd = await $.session.cwd()
    hasTouched = false
    await update($, touchedAtom, () => ({}))
    const now = await $.clock.now()
    await update($, startedAtom, () => now)

    return next(e)
  })

  on('config.set', async ($, e, next) => {
    const result = await next(e)

    // The written value: inside this hook $.config.list() still answers with the old one.
    if (e.key === 'theme' && result.deny === undefined) {
      await followTheme($, result.value)
    }

    return result
  })

  // Notes which prompts carried images, so their row keeps Claude Code's drawing of them.
  on('session.append', async ($, e, next) => {
    const stored = await next(e)
    const hasImage = e.door === 'prompt' && e.message.content.some(block => block.type === 'image')

    if (hasImage && stored.uuid !== undefined) {
      await update($, memberOf(imagesAtom, { requestId: stored.uuid }), () => true)
    }

    return stored
  })

  // A turn's end and a plan limit's move are when the band's numbers change.
  on('session.measure', async ($, e, next) => {
    await refreshUsage($)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      await refreshUsage($)
      isWorking = false
      const finished = stats
      await update($, turnsAtom, turns =>
        Object.fromEntries([...Object.entries(turns), [String(e.durationMs), finished]].slice(-KEPT_TURNS)),
      )

      if (e.answer.trim() !== '') {
        await update($, lastReplyAtom, () => e.answer)
      }
    }

    return next(e)
  })

  // Times every call and counts the main loop's calls and changed lines.
  on('tool.call', async ($, e, next) => {
    // Its output card's header names the command, which the result does not carry.
    if (SHELLS.has(e.tool)) {
      const command = commandOf(e)
      await update($, memberOf(commandAtom, { requestId: e.tool_use_id }), () => command)
    }

    const startedAt = await $.clock.now()
    const ran = await next(e)
    const ms = (await $.clock.now()) - startedAt

    await update($, memberOf(durationAtom, { requestId: e.tool_use_id }), () => ms)

    // The call's arguments ride on the event itself (`e.command` for Bash).
    if (isQuiet(e.tool, e)) {
      await update($, memberOf(quietAtom, { requestId: e.tool_use_id }), () => true)
    }

    // A file the call made or changed takes its colour in this turn's rows and prose.
    const file = (e as { file_path?: unknown; notebook_path?: unknown }).file_path ?? (e as { notebook_path?: unknown }).notebook_path

    if (WRITES.has(e.tool) && ran.deny === undefined && typeof file === 'string' && file !== '') {
      const touch: Touch = (ran.result as { type?: unknown } | undefined)?.type === 'create' ? 'created' : 'edited'
      hasTouched = true
      await update($, touchedAtom, touched => (touched[file] === 'created' ? touched : { ...touched, [file]: touch }))
    }

    if (e.agentId === undefined && e.tool !== DESIGN && ran.deny === undefined) {
      const diff = diffstat(ran.result)
      stats = {
        tools: stats.tools + 1,
        added: stats.added + (diff?.added ?? 0),
        removed: stats.removed + (diff?.removed ?? 0),
      }
    }

    return ran
  })

  on('tool.call', { tool: DESIGN_MATCH }, async ($, e) => {
    const outcome = runDesign(e, await designState($))

    if (outcome.isError) {
      return { deny: outcome.text }
    }

    await commit($, outcome.state)

    return { result: outcome.text }
  })

  on('command.run', { command: 'skin' }, async ($, e) => {
    if (e.args.trim() === '') {
      await $.ui.open({ id: SETTINGS, title: 'Skins', focus: true, closeOnEscape: true })

      return {}
    }

    if (e.args.trim().toLowerCase() === 'gallery') {
      await $.ui.open({ id: GALLERY, title: 'Skin gallery', focus: true, closeOnEscape: true })

      return {}
    }

    const word = e.args.trim().toLowerCase()

    if (word === 'copy' || word === 'copy code') {
      const copied = copyOf(await read($, lastReplyAtom), word === 'copy code')

      if ('message' in copied) {
        $.ui.toast(copied.message)
      } else {
        const result = await $.ui.copy({ text: copied.text })
        $.ui.toast(result.isCopied ? (word === 'copy' ? 'Copied the reply' : 'Copied the code') : 'Could not copy here')
      }

      return {}
    }

    if (word === 'pin' || word === 'unpin' || word === 'share') {
      $.ui.toast(await runFolderCommand($, word))

      return {}
    }

    const current = await read($, prefsAtom)
    const custom = await read($, customAtom)
    const outcome = runSkinCommand(e.args, current, skinNames(custom))

    if (outcome.prefs !== current) {
      await commit($, { prefs: outcome.prefs, custom })
    }

    if (outcome.channel === 'row') {
      const width = lastColumns === undefined ? '' : `
reply width: ${lastColumns} columns`

      const folder = (await read($, pinnedAtom)) ? 'this folder: pinned' : 'this folder: follows the default'

      return { text: e.args.trim() === 'list' ? `${outcome.message}\n${folder}${width}` : outcome.message }
    }

    $.ui.toast(outcome.message)

    return {}
  })

  on('ui.render', { component: 'Pane', requestId: SETTINGS }, async ($, e) => {
    const prefs = await read($, prefsAtom)
    const custom = await read($, customAtom)
    const editing = await read($, editingAtom)
    const skin = resolveSkin(prefs.skin, custom) ?? resolveSkin(DEFAULT_PREFS.skin, custom)
    const ui = $.ui.resolve(e)

    if (skin === undefined || e.surface === 'mobile' || !('Input' in ui)) {
      return <ui.Text>Open the skin settings in the terminal or the desktop app.</ui.Text>
    }

    const look = lookOf(ui, { prefs, custom, skin }, e.surface)
    const state = { prefs, custom }

    return settingsPane(look, ui, { names: skinNames(custom), editing, width: e.props.bodyColumns }, {
      pick: name => void commit($, { ...state, prefs: { ...prefs, skin: name } }),
      toggle: word => void commit($, { ...state, prefs: { ...prefs, [TOGGLES[word]]: !prefs[TOGGLES[word]] } }),
      calm: () => void commit($, { ...state, prefs: withCalm(prefs, prefs.calm === null) }),
      tables: () => void commit($, { ...state, prefs: { ...prefs, tables: nextTables(prefs.tables) } }),
      icons: () =>
        void commit($, { ...state, prefs: { ...prefs, icons: prefs.icons === 'unicode' ? 'ascii' : 'unicode' } }),
      edit: slot => void update($, editingAtom, () => slot),
      paint: hex => {
        const made = withSlot(prefs.skin === 'off' ? DEFAULT_PREFS.skin : prefs.skin, custom, editing, hex)

        if (typeof made === 'string') {
          $.ui.toast(made)

          return
        }

        void commit($, { prefs: { ...prefs, skin: made.name }, custom: { ...custom, [made.name]: made.skin } })
      },
    })
  })

  // Every element the skin draws, numbered, to point at when asking for a change.
  on('ui.render', { component: 'Pane', requestId: GALLERY }, async ($, e) => {
    const active = await activeSkin($)
    const ui = $.ui.resolve(e)

    if (active === null) {
      return <ui.Text>The gallery shows a skin. Pick one with /skin first.</ui.Text>
    }

    const look = lookOf(ui, active, e.surface)

    return withSettle($, e, galleryPane({ ...look, ...(look.svg === undefined ? {} : { isFirstDraw: await firstDraws($, e, active.prefs) }) }, e.props.bodyColumns))
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const kind = kindOf(e.props.tool)
    const active = await activeSkin($)

    if (kind === null || active === null) {
      return next(e)
    }

    const cwd = await cwdOf($)
    const ms = e.props.isRunning ? -1 : await read($, memberOf(durationAtom, e))
    const diff = diffstat(e.props.output)
    const target = summarize(e.props.tool, e.props.input, cwd)

    const meta = {
      ...(ms >= 0 && !e.props.isRunning ? { ms } : {}),
      ...(diff === null ? {} : diff),
    }
    const copy = (text: string) => {
      void $.ui.copy({ text, surface: e.surface }).then(result => $.ui.toast(result.isCopied ? 'Copied' : 'Could not copy here'))
    }
    const fields = (e.props.input ?? {}) as { file_path?: unknown; notebook_path?: unknown }
    const path = fields.file_path ?? fields.notebook_path
    // The chevron opens the row onto the call's input and its answer.
    const disclosure = memberOf(disclosureAtom, e)
    const open = isOpen(await read($, disclosure), e.props.isErrored)
    const base = await sessionLook($, e, lookOf($.ui.resolve(e), active, e.surface, copy), {
      touched: typeof path === 'string',
      folds: open,
      cwd,
    })
    const look = base.svg === undefined ? base : { ...base, isFirstDraw: await firstDraws($, e, active.prefs) }
    // A file this turn made or changed keeps its colour in every row that names it.
    const touch = typeof path === 'string' && look.touched !== undefined ? touchOf(look.touched.files, path, cwd) : undefined
    const label = active.prefs.quiet && isQuiet(e.props.tool, e.props.input) ? quietLabel(e.props.tool) : toolLabel(e.props.tool)
    const row = toolRow(look, e.props, kind, target, meta, label, touch)
    const toggle = () => void update($, disclosure, () => (open ? 'closed' : 'open'))

    if (!open) {
      return withSettle($, e, disclosedRow(look, row, false, toggle))
    }

    const all = memberOf(allAtom, e)
    const isAll = await read($, all)
    const opened = await openedRows(look, {
      fields: inputFields(e.props.tool, e.props.input, cwd),
      body: bodyOf(e.props.tool, e.props.output, e.props.isErrored, e.props.isRunning, cwd),
      command: commandOf(e.props.input),
      isErrored: e.props.isErrored,
      cwd,
      columns: e.viewport?.columns ?? 100,
      isAll,
      toggleAll: () => void update($, all, () => !isAll),
      stock: () => next(e),
    })

    return withSettle($, e, disclosedRow(look, row, true, toggle, opened))
  })

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    const active = await activeSkin($)

    if (active === null || e.props.isExpanded) {
      return next(e)
    }

    return groupRow(lookOf($.ui.resolve(e), active, e.surface), e.props.calls)
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const active = await activeSkin($)
    const output = e.props.output as { stdout?: unknown } | null
    const copy = (text: string) => {
      void $.ui.copy({ text, surface: e.surface }).then(result => $.ui.toast(result.isCopied ? 'Copied' : 'Could not copy here'))
    }
    // Only the terminal's shell card has a fold control here.
    const needs = { folds: e.surface === 'terminal' && SHELLS.has(e.props.tool) }
    const look = active === null ? undefined : await sessionLook($, e, lookOf($.ui.resolve(e), active, e.surface, copy), needs)
    const columns = e.viewport?.columns ?? 100
    // An opened row draws the answer itself; one it cannot draw keeps Claude Code's here.
    const isOpened =
      active !== null &&
      kindOf(e.props.tool) !== null &&
      isOpen(await read($, memberOf(disclosureAtom, e)), e.props.isErrored) &&
      bodyOf(e.props.tool, e.props.output, e.props.isErrored, false, '').kind !== 'stock'

    if (isOpened) {
      const { Box } = $.ui.resolve(e)

      return <Box />
    }

    // Calm never folds a failure away: it is drawn whole, past quiet and the clip.
    const isCalmFailure = look !== undefined && look.prefs.calm !== null && e.props.isErrored

    // A call that only looked folds away; a failure keeps the line that says why.
    if (look !== undefined && look.prefs.quiet && !isCalmFailure && (await read($, memberOf(quietAtom, e)))) {
      return quietResult(look, e.props.isErrored ? errorLine(e.props.output) : null)
    }

    // The desktop gets cards: a diff for an edit, a terminal for a shell command.
    if (look?.svg !== undefined && EDITS.has(e.props.tool) && !e.props.isErrored) {
      const diff = hunksOf(e.props.output)

      if (diff !== null) {
        const shown = shortenPath(diff.path, await $.session.cwd())

        return withSettle($, e, diffCard({ ...look, isFirstDraw: await firstDraws($, e, look.prefs) }, look.svg, diff, shown, columns))
      }
    }

    const isShellCard = look !== undefined && look.prefs.shell && SHELLS.has(e.props.tool) && !keepsOwnRow(e.props.output)

    if (look?.svg !== undefined && isShellCard) {
      const shell = shellOutputOf(e.props.output)

      if (shell !== null) {
        return withSettle($, e, terminalCard({ ...look, isFirstDraw: await firstDraws($, e, look.prefs) }, look.svg, shell, e.props.isErrored, columns))
      }
    }

    // The terminal's card is text: the command and its exit status, stderr apart, folded.
    if (look !== undefined && e.surface === 'terminal' && isShellCard) {
      const shell = shellResultOf(e.props.output, e.props.isErrored)

      if (shell !== null) {
        // `/skin fold off`, or the person's `▾ N more`, shows the output whole.
        const isWhole = !look.prefs.fold || look.folds?.open.has(OUTPUT_FOLD) === true
        const fold = isWhole ? null : { head: CLIP_HEAD, tail: CLIP_TAIL }

        return shellRows(look, await read($, memberOf(commandAtom, e)), shell, e.props.isErrored, {
          stdout: fold,
          stderr: isCalmFailure ? null : fold,
        })
      }
    }

    if (!active?.prefs.clipOutput || isCalmFailure || !SHELLS.has(e.props.tool) || typeof output?.stdout !== 'string') {
      return next(e)
    }

    const stdout = clipLines(output.stdout, CLIP_HEAD, CLIP_TAIL)

    return stdout === output.stdout
      ? next(e)
      : next({ ...e, props: { ...e.props, output: { ...output, stdout } } })
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const active = await activeSkin($)

    if (active === null || !TYPED.has(e.props.origin.kind) || e.props.text.length > MAX_PROMPT) {
      return next(e)
    }

    const look = lookOf($.ui.resolve(e), active, e.surface)
    const hasImages = await read($, memberOf(imagesAtom, e))

    // Claude Code draws the images; the text is already in the outline above them.
    return promptRow(look, e.props.text, hasImages ? await next({ ...e, props: { ...e.props, text: '' } }) : undefined)
  })

  // While charts are drawn, the model learns it can answer a "show me" with a Mermaid
  // fence. Nothing for a headless run, which draws nothing.
  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    const active = await activeSkin($)
    const isHeadless = e.surfaces.length === 0 || e.traits.includes('bare') || e.traits.includes('print')

    if (active === null || !active.prefs.charts || !active.prefs.hints || isHeadless) {
      return result
    }

    return { sections: [...result.sections, { id: 'skins:charts', text: CHART_HINT, scope: 'session' as const }] }
  })

  // A reply keeps Claude Code's own drawing unless it holds a card or markdown the pack draws.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const active = await activeSkin($)

    const text = e.props.text

    if (active === null) {
      return next(e)
    }

    const { prefs } = active
    const segments = replySegments(text, prefs, e.surface)

    if (segments === null) {
      return next(e)
    }

    // Every surface's table names Svg, but the terminal draws it as nothing. As text, tables
    // are text grids and code the app's own selectable blocks.
    const ui = $.ui.resolve(e)
    const svg = e.surface !== 'terminal' && active.prefs.tables === 'on' && 'Svg' in ui ? ui.Svg : undefined
    lastColumns = e.viewport?.columns
    const copy = (copied: string) => {
      void $.ui.copy({ text: copied, surface: e.surface }).then(result => $.ui.toast(result.isCopied ? 'Copied' : 'Could not copy here'))
    }

    const base = await sessionLook($, e, lookOf(ui, active, e.surface, copy), replyNeeds(text, segments))
    const look = base.svg === undefined ? base : { ...base, isFirstDraw: await firstDraws($, e, prefs) }

    // A reply of several blocks can be copied whole, as Claude wrote it.
    return withSettle($, e, replyRows(look, segments, e.viewport?.columns ?? 100, svg, segments.length > 1 ? text : undefined))
  })

  // A slash command's output (`/cost`, `/context`, a plugin's) drawn the way a reply is: its
  // tables and code as cards, a run of `key: value` lines as a table. /skin's own rows are
  // already the skin's.
  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    const active = await activeSkin($)

    if (active === null || !active.prefs.commands || active.prefs.tables === 'off' || e.props.isErrored || e.props.command === 'skin') {
      return next(e)
    }

    const segments = e.props.text.length > MAX_MARKDOWN ? null : commandSegments(e.props.text, e.props.command)

    if (segments === null) {
      return next(e)
    }

    const ui = $.ui.resolve(e)
    const svg = e.surface !== 'terminal' && active.prefs.tables === 'on' && 'Svg' in ui ? ui.Svg : undefined
    const copy = (copied: string) => {
      void $.ui.copy({ text: copied, surface: e.surface }).then(result => $.ui.toast(result.isCopied ? 'Copied' : 'Could not copy here'))
    }

    const base = await sessionLook($, e, lookOf(ui, active, e.surface, copy), replyNeeds(e.props.text, segments))
    const look = base.svg === undefined ? base : { ...base, isFirstDraw: await firstDraws($, e, active.prefs) }

    return withSettle($, e, replyRows(look, segments, e.viewport?.columns ?? 100, svg))
  })

  // The terminal's spinner gets the skin's word with a shimmer; the desktop's keeps its
  // word, which says what the step is doing, beside an animated icon.
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const active = await activeSkin($)

    if (active === null) {
      return next(e)
    }

    if (e.surface !== 'terminal') {
      const look = lookOf($.ui.resolve(e), active, e.surface)

      // Calm keeps the app's own, quieter spinner.
      return look.svg === undefined || active.prefs.calm !== null
        ? next(e)
        : desktopSpinnerRow(look, look.svg, e.props.mode, e.props.message ?? e.props.word)
    }

    const word = pick(active.skin.spinner, e.props.word) ?? e.props.word

    if (!active.prefs.shimmer || e.props.message !== null) {
      return next({ ...e, props: { ...e.props, word } })
    }

    const frame = await read($, frameAtom)
    const startedAt = await read($, startedAtom)
    const elapsed = startedAt === 0 ? 0 : (await $.clock.now()) - startedAt

    return spinnerRow(lookOf($.ui.resolve(e), active, e.surface), word, frame, elapsed)
  })

  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    const active = await activeSkin($)

    if (active === null) {
      return next(e)
    }

    const turns = await read($, turnsAtom)
    const word = pick(active.skin.done, e.props.word) ?? e.props.word

    return footerRow(lookOf($.ui.resolve(e), active, e.surface), word, e.props.durationMs, turns[String(e.props.durationMs)])
  })

  // The band above the prompt: context and plan limits. Another mod's drawing there,
  // and a survey, keep their place.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const active = await activeSkin($)
    const meters = metersOf(await read($, usageAtom))

    if (active === null || !active.prefs.band || e.props.hasSurvey || meters.length === 0) {
      return next(e)
    }

    const plain = lookOf($.ui.resolve(e), active, e.surface)
    const { Box } = plain.ui
    const theirs = await next(e)
    // Compacting mid-turn would cut the turn's own context out from under it.
    // Runs Claude Code's own /compact, so the person sees its usual progress and result.
    // Work a press starts is abandoned when the press ends, which cancels a compaction
    // still running, so a timer starts it in a dispatch of its own, which returns the run
    // so that dispatch lasts until the compaction ends. The button hides until then, so
    // repeated presses do not queue one /compact each.
    const isCompacting = await read($, compactingAtom)
    const compact = () => {
      void update($, compactingAtom, () => true)
      $.clock.after(1, () =>
        $.command
          .run({ command: 'compact' })
          .catch((error: unknown) => $.ui.toast(`Compacting failed: ${error instanceof Error ? error.message : String(error)}`))
          .finally(() => update($, compactingAtom, () => false)),
      )
    }
    const look = { ...plain, ...(plain.svg === undefined ? {} : { isFirstDraw: await firstDraws($, e, active.prefs) }) }

    return withSettle(
      $,
      e,
      <Box flexDirection="column">
        {usageBand(look, meters, !e.props.isWorking && !isCompacting, compact)}
        {theirs}
      </Box>,
    )
  })

  // Claude Code's own dialog stays whole: the skin only adds a band above it.
  on('ui.render', { component: 'AskUserQuestion' }, async ($, e, next) => {
    const active = await activeSkin($)
    const theirs = await next(e)

    if (active === null) {
      return theirs
    }

    const headers = e.props.questions
      .map(question => (question as { header?: unknown } | null)?.header)
      .filter((header): header is string => typeof header === 'string' && header !== '')
    const look = lookOf($.ui.resolve(e), active, e.surface)
    const { Box } = look.ui

    return headers.length === 0 ? (
      theirs
    ) : (
      <Box flexDirection="column">
        {askBand(look, headers)}
        {theirs}
      </Box>
    )
  })
}
