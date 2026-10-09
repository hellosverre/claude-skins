import { atom, memberOf, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderSurface, Timer } from 'claude-code'

import type { CustomSkin, Prefs, SkinSlot, TurnStats, UsageSnap } from '../types'
import { DEFAULT_PREFS, parsePrefs, runSkinCommand, TOGGLES } from './command'
import { buildCustom, resolveSkin, skinNames, withSlot } from './custom'
import { forTheme, resolveLight } from './light'
import { parseFolders, prefsFor, withFolder, withoutFolder } from './folders'
import { DESIGN_TOOL, runDesign } from './designer'
import type { DesignState } from './designer'
import { clipLines, diffstat, pick } from './format'
import { drawsBlocks, hasBlocks } from './blocks'
import { copyOf, splitReply } from './markdown'
import type { Segment } from './markdown'
import { CHART_HINT, parseMermaid } from './mermaid'
import { askBand, desktopSpinnerRow, diffCard, footerRow, terminalCard, usageBand, groupRow, promptRow, quietResult, replyRows, spinnerRow, toolRow } from './rows'
import type { Look, SvgElement, Ui } from './rows'
import { galleryPane } from './gallery'
import { settingsPane } from './settings'
import { ICONS } from './skin'
import type { Skin } from './skin'
import { hunksOf } from './svg-diff'
import { shellOutputOf } from './svg-terminal'
import { limitLabel, metersOf } from './svg-usage'
import { shortenPath } from './format'
import { kindOf, summarize } from './tools'
import { errorLine, isQuiet, quietLabel } from './quiet'

const SETTINGS = 'skins-settings'
const GALLERY = 'skins-gallery'
const DESIGN = `mcp__skins__${DESIGN_TOOL.name}`
const DESIGN_MATCH = /^mcp__skins__design$/

// Markdown takes at most 10000 characters a block; a longer prompt keeps Claude Code's
// own drawing, which folds a big paste.
const MAX_MARKDOWN = 9000
const MAX_PROMPT = 4000

const CLIP_HEAD = 8
const CLIP_TAIL = 4
const FRAME_MS = 90
const KEPT_TURNS = 40

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
const usageAtom = atom({ plugin: 'skins', key: 'usage' } as const, { context: null, limits: [] } as UsageSnap)
const compactingAtom = atom({ plugin: 'skins', key: 'compacting' } as const, false)
const pinnedAtom = atom({ plugin: 'skins', key: 'pinned' } as const, false)
// The main loop's last answer, for `/skin copy`.
const lastReplyAtom = atom({ plugin: 'skins', key: 'lastReply' } as const, '')

const EDITS = new Set(['Edit', 'MultiEdit', 'Write'])

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

// The system's appearance, for an `auto` theme: macOS's AppleInterfaceStyle, else GNOME's
// color-scheme. Undefined when neither answers.
async function systemDark($: EngineInterface): Promise<boolean | undefined> {
  try {
    const mac = await $.process.run(['defaults', 'read', '-g', 'AppleInterfaceStyle'], { timeoutMs: 2000 })

    // Unset (exit 1, "does not exist") is how macOS says light.
    return mac.exitCode === 0 ? mac.stdout.trim() === 'Dark' : /does not exist/.test(mac.stderr) ? false : undefined
  } catch {}

  try {
    const gnome = await $.process.run(['gsettings', 'get', 'org.gnome.desktop.interface', 'color-scheme'], {
      timeoutMs: 2000,
    })

    return gnome.exitCode === 0 ? gnome.stdout.includes('dark') : undefined
  } catch {
    return undefined
  }
}

// Claude Code's own theme decides whether skins draw for a light or a dark background:
// `SKINS_THEME` first, then the theme setting, and for `auto` the terminal and the system.
async function refreshTheme($: EngineInterface): Promise<void> {
  const rows = await $.config.list()
  const hints = {
    override: await $.env.get('SKINS_THEME'),
    theme: rows.find(row => row.key === 'theme')?.value,
    colorfgbg: await $.env.get('COLORFGBG'),
  }
  // Asks the system only when nothing before it decided.
  const needsSystem = resolveLight(hints) !== resolveLight({ ...hints, systemDark: false })
  const isLight = resolveLight({ ...hints, systemDark: needsSystem ? await systemDark($) : undefined })

  await update($, lightAtom, () => isLight)
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
  ...(copy === undefined ? {} : { copy }),
})

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
  const prefs = prefsFor(folder, folders, parsePrefs(await $.store.get('prefs'), names))

  await update($, customAtom, () => custom)
  await update($, prefsAtom, () => prefs)
  await update($, pinnedAtom, () => Object.hasOwn(folders, folder))
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

  await update($, usageAtom, () => snap)
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

export const register: Register = on => {
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
      argumentHint: '[gallery | copy | copy code | name | list | off | pin | unpin | share | rail | tables | shimmer | band | clip | markdown | quiet | charts | icons]',
      immediate: true,
    })
    await $.tool.register({
      name: DESIGN_TOOL.name,
      description: DESIGN_TOOL.description,
      inputSchema: DESIGN_TOOL.inputSchema,
    })
    await load($)
    await refreshUsage($)
    await refreshTheme($)

    // Only the spinner reads the frame, so a tick redraws the spinner and nothing else.
    ticker?.cancel()
    ticker = $.clock.every(FRAME_MS, () => {
      if (isWorking) {
        void update($, frameAtom, frame => frame + 1)
      }
    })

    return next(e)
  })

  // /clear, /resume and /branch reset $.state to its defaults and skip session.start.
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    await load($)
    await refreshTheme($)

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    stats = NO_STATS
    isWorking = true
    const now = await $.clock.now()
    await update($, startedAtom, () => now)

    return next(e)
  })

  on('config.set', async ($, e, next) => {
    const result = await next(e)

    if (e.key === 'theme') {
      await refreshTheme($)
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
    const startedAt = await $.clock.now()
    const ran = await next(e)
    const ms = (await $.clock.now()) - startedAt

    await update($, memberOf(durationAtom, { requestId: e.tool_use_id }), () => ms)

    // The call's arguments ride on the event itself (`e.command` for Bash).
    if (isQuiet(e.tool, e)) {
      await update($, memberOf(quietAtom, { requestId: e.tool_use_id }), () => true)
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

    return galleryPane(lookOf(ui, active, e.surface), e.props.bodyColumns)
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const kind = kindOf(e.props.tool)
    const active = await activeSkin($)

    if (kind === null || active === null) {
      return next(e)
    }

    const ms = await read($, memberOf(durationAtom, e))
    const diff = diffstat(e.props.output)
    const target = summarize(e.props.tool, e.props.input, await $.session.cwd())

    const meta = {
      ...(ms >= 0 && !e.props.isRunning ? { ms } : {}),
      ...(diff === null ? {} : diff),
    }
    const look = lookOf($.ui.resolve(e), active, e.surface)

    return active.prefs.quiet && isQuiet(e.props.tool, e.props.input)
      ? toolRow(look, e.props, kind, target, meta, quietLabel(e.props.tool))
      : toolRow(look, e.props, kind, target, meta)
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
    const look = active === null ? undefined : lookOf($.ui.resolve(e), active, e.surface, copy)
    const columns = e.viewport?.columns ?? 100

    // A call that only looked folds away; a failure keeps the line that says why.
    if (look !== undefined && look.prefs.quiet && (await read($, memberOf(quietAtom, e)))) {
      return quietResult(look, e.props.isErrored ? errorLine(e.props.output) : null)
    }

    // The desktop gets cards: a diff for an edit, a terminal for a shell command.
    if (look?.svg !== undefined && EDITS.has(e.props.tool) && !e.props.isErrored) {
      const diff = hunksOf(e.props.output)

      if (diff !== null) {
        return diffCard(look, look.svg, diff, shortenPath(diff.path, await $.session.cwd()), columns)
      }
    }

    if (look?.svg !== undefined && e.props.tool === 'Bash') {
      const shell = shellOutputOf(e.props.output)

      if (shell !== null) {
        return terminalCard(look, look.svg, shell, e.props.isErrored, columns)
      }
    }

    if (!active?.prefs.clipOutput || e.props.tool !== 'Bash' || typeof output?.stdout !== 'string') {
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

    if (active === null || !active.prefs.charts || isHeadless) {
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
    const cards = prefs.tables && /\||```|~~~/.test(text)
    // The terminal draws every paragraph itself; elsewhere only alerts and task lists.
    const blocks = prefs.markdown && (e.surface === 'terminal' || hasBlocks(text))
    // With cards off, a Mermaid fence the parser reads is still split out to draw.
    const charts = prefs.charts && /mermaid/i.test(text)

    if (!cards && !blocks && !charts) {
      return next(e)
    }

    const charted = (lang: string, code: string) => lang === 'mermaid' && parseMermaid(code) !== null
    const segments: Segment[] = cards ? splitReply(text) : charts ? splitReply(text, { tables: false, fence: charted }) : [{ kind: 'text', text }]
    const fits = segments.every(segment => segment.kind === 'table' || (segment.kind === 'text' ? segment.text : segment.raw).length <= MAX_MARKDOWN)
    const drawn = segments.some(segment => segment.kind !== 'text' || (prefs.markdown && drawsBlocks(segment.text, e.surface)))

    if (!fits || !drawn) {
      return next(e)
    }

    // Every surface's table names Svg, but the terminal draws it as nothing.
    const ui = $.ui.resolve(e)
    lastColumns = e.viewport?.columns
    const copy = (copied: string) => {
      void $.ui.copy({ text: copied, surface: e.surface }).then(result => $.ui.toast(result.isCopied ? 'Copied' : 'Could not copy here'))
    }

    return replyRows(lookOf(ui, active, e.surface, copy), segments, e.viewport?.columns ?? 100, e.surface !== 'terminal' && 'Svg' in ui ? ui.Svg : undefined)
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

      return look.svg === undefined
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

    const look = lookOf($.ui.resolve(e), active, e.surface)
    const { Box } = look.ui
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

    return (
      <Box flexDirection="column">
        {usageBand(look, meters, !e.props.isWorking && !isCompacting, compact)}
        {theirs}
      </Box>
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
