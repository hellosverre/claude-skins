import { expect, test } from 'claude-code/testing'

import { DEFAULT_PREFS, parsePrefs, runSkinCommand } from '../hooks/command'
import { buildCustom, resolveSkin, skinNames, withSlot } from '../hooks/custom'
import { runDesign } from '../hooks/designer'
import { clipLines, diffstat, formatDuration, formatMs, pick, shortenPath } from '../hooks/format'
import { columnWidths, cutCell, padCell, splitReply, widthOf } from '../hooks/markdown'
import { codeSvg, tokenize } from '../hooks/svg-code'
import { diffLines, diffSvg, hunksOf } from '../hooks/svg-diff'
import { fitColumns, kindOfCell, measure, tableSvg, wrapCell } from '../hooks/svg-table'
import { outputLines, shellOutputOf, terminalSvg } from '../hooks/svg-terminal'
import { limitLabel, meterColor, metersOf, usageSvg } from '../hooks/svg-usage'
import { isNewer, updateNotice } from '../hooks/updates'
import { deepen, gnomeDark, isLightTheme, macDark, resolveLight, toLight, windowsDark } from '../hooks/light'
import { parseFolders, prefsFor, withFolder, withoutFolder } from '../hooks/folders'
import { kindOf, summarize, toolLabel } from '../hooks/tools'
import tokyoNight from '../hooks/themes/tokyo-night'

const NAMES = ['tokyo-night', 'dracula', 'nord']

test('paths under the session directory show relative, others stay', async () => {
  expect(shortenPath('C:\\work\\app\\src\\a.ts', 'C:\\work\\app')).toBe('src/a.ts')
  expect(shortenPath('/work/app/src/a.ts', '/work/app/')).toBe('src/a.ts')
  expect(shortenPath('/etc/hosts', '/work/app')).toBe('/etc/hosts')
  expect(shortenPath('/work/application/a.ts', '/work/app')).toBe('/work/application/a.ts')
})

test('times read like Claude Code writes them', async () => {
  expect(formatDuration(400)).toBe('<1s')
  expect(formatDuration(64000)).toBe('1m 4s')
  expect(formatMs(340)).toBe('340ms')
  expect(formatMs(2140)).toBe('2.1s')
})

test('a seed always picks the same word, and an empty list picks none', async () => {
  expect(pick(['a', 'b', 'c'], 'Sauteing')).toBe(pick(['a', 'b', 'c'], 'Sauteing'))
  expect(pick([], 'Sauteing')).toBeUndefined()
})

test('long output keeps its head and tail and counts the rest', async () => {
  const lines = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n')
  const clipped = clipLines(lines, 8, 4).split('\n')

  expect(clipped[8]).toBe('… 18 lines hidden')
  expect(clipped[12]).toBe('line 29')
  expect(clipLines('a\nb', 8, 4)).toBe('a\nb')
})

test('a patch counts its added and removed lines, anything else counts nothing', async () => {
  const output = { structuredPatch: [{ lines: [' a', '-b', '+c', '+d'] }, { lines: ['-e'] }] }

  expect(diffstat(output)).toEqual({ added: 2, removed: 2 })
  expect(diffstat({ stdout: 'x' })).toBeNull()
  expect(diffstat(null)).toBeNull()
})

test('only the tools a skin can draw faithfully get a kind', async () => {
  expect(kindOf('Bash')).toBe('run')
  expect(kindOf('mcp__github__search_code')).toBe('mcp')
  expect(kindOf('Task')).toBeNull()
  expect(toolLabel('mcp__github__search_code')).toBe('github:search_code')
})

test('a call summarises to the one thing worth a glance', async () => {
  expect(summarize('Bash', { command: 'pnpm test\n  --filter hub' }, '/w')).toBe('pnpm test')
  expect(summarize('Grep', { pattern: 'TODO', path: '/w/src' }, '/w')).toBe('TODO in src')
  expect(summarize('Bash', null, '/w')).toBe('')
})

test('tables and closed code fences are split out of a reply, and a fence keeps its table as code', async () => {
  const reply = [
    'Here:',
    '',
    '| Route | Limit |',
    '|:------|------:|',
    '| /chat | **60** |',
    '| /up | 10 |',
    '',
    'Done.',
    '```',
    '| a | b |',
    '|---|---|',
    '```',
  ].join('\n')
  const segments = splitReply(reply)

  expect(segments.map(segment => segment.kind)).toEqual(['text', 'table', 'text', 'code'])
  expect(segments[3]).toEqual({ kind: 'code', lang: '', code: '| a | b |\n|---|---|', raw: '```\n| a | b |\n|---|---|\n```' })
  expect(segments[1]).toEqual({
    kind: 'table',
    header: ['Route', 'Limit'],
    align: ['left', 'right'],
    rows: [
      ['/chat', '60'],
      ['/up', '10'],
    ],
  })
})

test('columns narrow from the widest until the table fits, and cells pad to their side', async () => {
  const table = { kind: 'table' as const, header: ['a', 'b'], align: ['left' as const, 'right' as const], rows: [['x'.repeat(30), 'yy']] }

  expect(columnWidths(table, 20, 3)).toEqual([15, 2])
  expect(padCell('abc', 6, 'right')).toBe('   abc')
  expect(padCell('abcdefgh', 5, 'left')).toBe('abcd…')
})

test('wide characters count two cells, so CJK cells are measured and cut in terminal cells', async () => {
  expect(widthOf('레일, 스피너')).toBe(12)
  expect(widthOf('e\u0301')).toBe(1)
  expect(widthOf('中文')).toBe(4)
  expect(widthOf('カタカナ')).toBe(8)
  expect(widthOf('ok 🚀')).toBe(5)
  expect(widthOf('👍🏽')).toBe(2)
  expect(widthOf('🫠')).toBe(2)
  expect(cutCell('레일, 스피너', 12)).toBe('레일, 스피너')
  expect(cutCell('레일, 스피너', 5)).toBe('레일…')
  expect(widthOf(padCell('레일', 8, 'left'))).toBe(8)
})

test('a made skin lays its slots over its base, and bad drafts are refused with a reason', async () => {
  const sunset = buildCustom({ name: 'Sunset', base: 'gruvbox', palette: { user: '#FF8800' } }, undefined)

  expect(typeof sunset).toBe('object')

  const custom = { sunset: sunset as Exclude<typeof sunset, string> }
  const skin = resolveSkin('sunset', custom)

  expect(skin?.palette.user).toBe('#ff8800')
  expect(skin?.palette.run).toBe(resolveSkin('gruvbox', {})?.palette.run)
  expect(skinNames(custom)).toContain('sunset')
  expect(buildCustom({ name: 'dracula' }, undefined)).toContain('built-in')
  expect(buildCustom({ name: 'x', palette: { user: 'red' } }, undefined)).toContain('bad palette')
  expect(buildCustom({ name: 'x', base: 'nope' }, undefined)).toContain('base must be')
})

test('painting a slot on a built-in skin forks it into my-<name>', async () => {
  const made = withSlot('nord', {}, 'user', '#123456')

  expect(typeof made === 'string' ? made : made.name).toBe('my-nord')
  expect(withSlot('nord', {}, 'user', 'blue')).toContain('#7aa2f7')
})

test('the design tool saves, applies, changes settings and deletes', async () => {
  const start = { prefs: DEFAULT_PREFS, custom: {} }
  const saved = runDesign({ action: 'save', name: 'ink', base: 'mono', palette: { user: '#5555ff' } }, start)

  expect(saved.isError).toBe(false)
  expect(saved.state.prefs.skin).toBe('ink')

  const quiet = runDesign({ action: 'settings', settings: { rail: false, icons: 'ascii' } }, saved.state)

  expect(quiet.state.prefs.rail).toBe(false)
  expect(quiet.state.prefs.icons).toBe('ascii')

  const gone = runDesign({ action: 'delete', name: 'ink' }, quiet.state)

  expect(gone.state.prefs.skin).toBe(DEFAULT_PREFS.skin)
  expect(runDesign({ action: 'delete', name: 'nord' }, start).isError).toBe(true)
  expect(runDesign({ action: 'apply', name: 'nope' }, start).isError).toBe(true)
  expect(JSON.parse(runDesign({ action: 'show' }, start).text).current).toBe('noir')
})

test('/skin names a skin, switches parts, and refuses what it does not know', async () => {
  expect(runSkinCommand('nord', DEFAULT_PREFS, NAMES).prefs.skin).toBe('nord')
  expect(runSkinCommand('default', DEFAULT_PREFS, NAMES).prefs.skin).toBe('off')
  expect(runSkinCommand('rail off', DEFAULT_PREFS, NAMES).prefs.rail).toBe(false)
  expect(runSkinCommand('clip on', DEFAULT_PREFS, NAMES).prefs.clipOutput).toBe(true)
  expect(runSkinCommand('shimmer maybe', DEFAULT_PREFS, NAMES).prefs).toBe(DEFAULT_PREFS)
  expect(runSkinCommand('plaid', DEFAULT_PREFS, NAMES).channel).toBe('row')
  expect(runSkinCommand('list', { ...DEFAULT_PREFS, skin: 'nord' }, NAMES).message).toContain('● nord')
})

test('stored prefs that are stale or hand-edited fall back to defaults', async () => {
  expect(parsePrefs(undefined, NAMES)).toEqual(DEFAULT_PREFS)
  expect(parsePrefs({ skin: 'gone', icons: 'x', rail: 'yes' }, NAMES)).toEqual(DEFAULT_PREFS)
  expect(parsePrefs({ skin: 'off', rail: false }, NAMES).rail).toBe(false)
})

test('tables are on, text or off, and a stored on/off from before still reads', async () => {
  expect(parsePrefs({ tables: true }, NAMES).tables).toBe('on')
  expect(parsePrefs({ tables: false }, NAMES).tables).toBe('off')
  expect(parsePrefs({ tables: 'text' }, NAMES).tables).toBe('text')
  expect(parsePrefs({ tables: 'grid' }, NAMES).tables).toBe('on')
  expect(runSkinCommand('tables text', DEFAULT_PREFS, NAMES).prefs.tables).toBe('text')
  expect(runSkinCommand('tables maybe', DEFAULT_PREFS, NAMES).message).toBe('usage: /skin tables on|text|off')
  expect(runSkinCommand('list', { ...DEFAULT_PREFS, tables: 'text' }, NAMES).message).toContain('tables text')
})

test('cells are read as colours, diffs, numbers, code or text', async () => {
  expect(kindOfCell('#7aa2f7')).toBe('colour')
  expect(kindOfCell('+18 −3')).toBe('diff')
  expect(kindOfCell('120')).toBe('number')
  expect(kindOfCell('2.1s')).toBe('number')
  expect(kindOfCell('apps/hub/server.ts')).toBe('code')
  expect(kindOfCell('Added a limiter')).toBe('text')
  expect(measure('MMMM', false)).toBeDefined()
})

test('a vector table stays within its width and escapes what it draws', async () => {
  const card = tableSvg(
    { kind: 'table', header: ['a', 'b'], align: ['left', 'right'], rows: [['<b>', 'Q'.repeat(400)]] },
    tokyoNight.palette,
    5000,
  )

  expect(card.width).toBe(1600)
  expect(tableSvg({ kind: 'table', header: ['a'], align: ['left'], rows: [['b']] }, tokyoNight.palette, 700).width).toBe(700)
  // A long cell wraps instead of being cut: every one of its 400 characters is drawn.
  expect(card.source).not.toContain('…')
  expect((card.source.match(/Q+/g) ?? []).join('').length).toBe(400)
  expect(card.source).toContain('&lt;b&gt;')
  expect(card.source).not.toContain('<b>')
  expect(card.source).toContain('prefers-reduced-motion')
})

test('a patch numbers its lines on each side and marks the gap between hunks', async () => {
  const lines = diffLines([
    { oldStart: 10, newStart: 10, lines: [' a', '-b', '+c', '+d'] },
    { oldStart: 40, newStart: 41, lines: [' e', '\\ No newline at end of file'] },
  ])

  expect(lines).toEqual([
    { kind: 'ctx', text: 'a', old: 10, new: 10 },
    { kind: 'del', text: 'b', old: 11 },
    { kind: 'add', text: 'c', new: 11 },
    { kind: 'add', text: 'd', new: 12 },
    { kind: 'gap', at: 41 },
    { kind: 'ctx', text: 'e', old: 40, new: 41 },
  ])
})

test('a new file with an empty patch shows its content as added lines', async () => {
  const diff = hunksOf({ type: 'create', filePath: '/w/a.ts', content: 'x\ny', structuredPatch: [] })

  expect(diff?.isNewFile).toBe(true)
  expect(diff?.hunks[0]?.lines).toEqual(['+x', '+y'])
  expect(hunksOf({ stdout: '' })).toBeNull()

  const card = diffSvg(diff!, 'a.ts', tokyoNight.palette, 600)

  expect(card.source).toContain('new file')
  expect(card.alt).toBe('a.ts: +2 −0')
})

test('shell output loses its colour codes, keeps stderr apart and folds the middle', async () => {
  const long = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n')
  const shell = shellOutputOf({ stdout: `\u001b[32mok\u001b[0m\n${long}\n\n`, stderr: 'warn: x', interrupted: false })
  const lines = outputLines(shell!)

  expect(lines[0]).toEqual({ text: 'ok', isErr: false })
  expect(lines[6]).toEqual({ fold: 30 })
  expect(lines.at(-1)).toEqual({ text: 'warn: x', isErr: true })
  expect(terminalSvg(shell!, true, tokyoNight.palette, 600).source).toContain('failed')
  expect(shellOutputOf({ content: 'x' })).toBeNull()
})

test('code is split into comments, strings, numbers and keywords by language', async () => {
  expect(tokenize('const x = "hi" // note', 'ts').map(token => token.role)).toEqual([
    'keyword', 'plain', 'plain', 'plain', 'string', 'plain', 'comment',
  ])
  expect(tokenize('x = 1  # note', 'python').at(-1)).toEqual({ text: '# note', role: 'comment' })
  expect(codeSvg('a\nb', 'ts', tokyoNight.palette, 600).source).toContain('TS')
})

test('plan limits read as 5h and 7d, and a meter warns as it fills', async () => {
  expect(limitLabel('five_hour')).toBe('5h')
  expect(limitLabel('seven_day')).toBe('7d')
  expect(metersOf({ context: 42.4, limits: [{ label: '5h', percent: 120 }] })).toEqual([
    { label: 'context', percent: 42 },
    { label: '5h', percent: 100 },
  ])
  expect(meterColor(85, tokyoNight.palette)).toBe(tokyoNight.palette.warn)
  expect(usageSvg([{ label: 'context', percent: 42 }], tokyoNight.palette).alt).toBe('context 42%')
})

test('a long cell wraps on its words, breaks a word too long for the column, and caps its lines', async () => {
  expect(wrapCell('the quick brown fox jumps', 90, false)).toEqual(['the quick', 'brown fox', 'jumps'])
  expect(wrapCell('x'.repeat(30), 60, true).every(line => measure(line, true) <= 60)).toBe(true)
  expect(wrapCell('word '.repeat(80), 60, false, 2).at(-1)).toMatch(/…$/)
})

test('short columns keep their width and long ones share the rest', async () => {
  const [hash, why, who] = fitColumns([20, 900, 60], 700)

  expect(hash).toBe(20)
  expect(who).toBe(60)
  expect(Math.round((why ?? 0) + 20 + 60 + 2 * 28 + 2 * 24)).toBe(700)
})

test('a light palette is derived with dark text, light bands and deepened colours', async () => {
  const light = toLight(tokyoNight.palette)

  expect(light.fg).toBe('#1f1f1f')
  expect(light.surface).toBe('#ffffff')
  expect(light.run).toBe(deepen(tokyoNight.palette.run, 0.45))
  expect(deepen('#ffffff', 0.5)).toBe('#808080')
  expect(isLightTheme('light-daltonized')).toBe(true)
  expect(isLightTheme('dark')).toBe(false)
})

test('SKINS_THEME wins, then the theme, then the terminal and the system for auto', async () => {
  expect(resolveLight({ override: 'dark', theme: 'light' })).toBe(false)
  expect(resolveLight({ override: 'Light', theme: 'dark' })).toBe(true)
  expect(resolveLight({ override: '', theme: 'light-daltonized' })).toBe(true)
  expect(resolveLight({ theme: 'auto', colorfgbg: '0;15' })).toBe(true)
  expect(resolveLight({ theme: 'auto', colorfgbg: '15;default;0' })).toBe(false)
  expect(resolveLight({ theme: 'auto', systemDark: false })).toBe(true)
  expect(resolveLight({ theme: 'auto', systemDark: true })).toBe(false)
  expect(resolveLight({ theme: 'auto' })).toBe(false)
})

test('a pinned folder keeps its own prefs, others follow the default', async () => {
  const pinned = { ...DEFAULT_PREFS, skin: 'nord' }
  const folders = parseFolders({ '/a': pinned, '/b': { skin: 'nope' } }, NAMES)

  expect(prefsFor('/a', folders, DEFAULT_PREFS).skin).toBe('nord')
  expect(prefsFor('/b', folders, DEFAULT_PREFS).skin).toBe(DEFAULT_PREFS.skin)
  expect(prefsFor('/c', folders, DEFAULT_PREFS)).toBe(DEFAULT_PREFS)
  expect(Object.keys(withoutFolder(withFolder(folders, '/c', pinned), '/a'))).toEqual(['/b', '/c'])
  expect(parseFolders('junk', NAMES)).toEqual({})
})

test('a release is newer by its first differing part, and anything not x.y.z never is', () => {
  expect(isNewer('0.1.3', '0.1.2')).toBe(true)
  expect(isNewer('0.2.0', '0.1.9')).toBe(true)
  expect(isNewer('0.1.10', '0.1.9')).toBe(true)
  expect(isNewer('0.1.2', '0.1.2')).toBe(false)
  expect(isNewer('0.1.2', '0.1.3')).toBe(false)
  expect(isNewer('1.0.0-beta', '0.1.2')).toBe(false)
  expect(isNewer('0.1.3', 'dev')).toBe(false)
  expect(updateNotice('0.1.3', '0.1.2')).toBe('skins 0.1.3 is out (you have 0.1.2). Run: claude plugin update skins@hellosverre-mods, then restart')
})

test('each system says dark, light, or nothing', async () => {
  const ran = (exitCode: number, stdout: string, stderr = '') => ({ exitCode, stdout, stderr })
  const windows = (value: string) =>
    ran(0, `\r\nHKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize\r\n    AppsUseLightTheme    REG_DWORD    ${value}\r\n\r\n`)

  expect(macDark(ran(0, 'Dark\n'))).toBe(true)
  expect(macDark(ran(1, '', 'The domain/default pair of (kCFPreferencesAnyApplication, AppleInterfaceStyle) does not exist'))).toBe(false)
  expect(macDark(ran(127, '', 'command not found'))).toBe(undefined)

  expect(windowsDark(windows('0x0'))).toBe(true)
  expect(windowsDark(windows('0x1'))).toBe(false)
  expect(windowsDark(ran(1, '', 'ERROR: The system was unable to find the specified registry key or value.'))).toBe(undefined)

  expect(gnomeDark(ran(0, "'prefer-dark'\n"))).toBe(true)
  expect(gnomeDark(ran(0, "'default'\n"))).toBe(false)
  expect(gnomeDark(ran(1, '', 'No such schema'))).toBe(undefined)
})
