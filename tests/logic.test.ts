import { expect, test } from 'claude-code/testing'

import { DEFAULT_PREFS, parsePrefs, runSkinCommand } from '../hooks/command'
import { buildCustom, resolveSkin, skinNames, withSlot } from '../hooks/custom'
import { runDesign } from '../hooks/designer'
import { clipLines, diffstat, formatDuration, formatMs, pick, shortenPath } from '../hooks/format'
import { columnWidths, copyOf, cutCell, padCell, splitReply, widthOf } from '../hooks/markdown'
import { codeSvg, tokenize } from '../hooks/svg-code'
import { diffLines, diffSvg, hunksOf } from '../hooks/svg-diff'
import { fitColumns, kindOfCell, measure, tableSvg, wrapCell } from '../hooks/svg-table'
import { outputLines, shellOutputOf, terminalSvg } from '../hooks/svg-terminal'
import { limitLabel, meterColor, metersOf, usageSvg } from '../hooks/svg-usage'
import { deepen, isLightTheme, resolveLight, toLight } from '../hooks/light'
import { parseFolders, prefsFor, withFolder, withoutFolder } from '../hooks/folders'
import { kindOf, summarize, toolLabel } from '../hooks/tools'
import { SKINS } from '../hooks/themes'
import { inlineRuns, splitBlocks } from '../hooks/blocks'
import { errorLine, isQuiet, isReadOnlyShell, segmentsOf } from '../hooks/quiet'
import tokyoNight from '../hooks/themes/tokyo-night'
import { chartHeading, formatPercent, niceStep, parseMermaid, seriesName } from '../hooks/mermaid'
import type { Architecture, Block, C4, Flow, Gantt, GitGraph, Journey, Kanban, Mindmap, Packet, Pie, Quadrant, Radar, Sankey, Timeline, Treemap, XyChart } from '../hooks/mermaid'
import { chartSvg } from '../hooks/svg-chart'
import { chartArt } from '../hooks/chart-art'
import { blockBar, dotRule } from '../hooks/chart-rows'
import { seriesColor } from '../hooks/svg-chart-kit'
import rosePine from '../hooks/themes/rose-pine'

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

test('every built-in skin names itself once and fills every slot with a colour, light palette too', async () => {
  const hex = /^#[0-9a-f]{6}$/
  const slots = Object.keys(tokyoNight.palette)

  expect(SKINS.length).toBe(15)
  expect(new Set(SKINS.map(skin => skin.name)).size).toBe(SKINS.length)

  for (const skin of SKINS) {
    for (const palette of [skin.palette, ...(skin.light === undefined ? [] : [skin.light])]) {
      expect(Object.keys(palette).sort()).toEqual([...slots].sort())
      expect(Object.values(palette).every(value => hex.test(value))).toBe(true)
    }

    expect(skin.spinner.length).toBeGreaterThan(0)
    expect(skin.done.length).toBeGreaterThan(0)
  }
})

test('the markdown pack lifts alerts, task lists and headings out of a reply and leaves links to markdown', async () => {
  const blocks = splitBlocks(
    [
      '## Plan',
      '',
      'Ran 54 tests in 3.2s on v1.4.0, see hooks/blocks.ts.',
      '',
      '> [!WARNING]',
      '> This deletes the cache.',
      '',
      '- [x] parse',
      '  - [ ] draw',
      '',
      'More in [the docs](https://example.com).',
      '',
      '```ts',
      '# not a heading',
      '```',
    ].join('\n'),
    { prose: true },
  )

  expect(blocks.map(block => block.kind)).toEqual(['heading', 'paragraph', 'alert', 'tasks', 'markdown'])
  expect(blocks[0]).toEqual({ kind: 'heading', level: 2, text: 'Plan' })
  expect(blocks[2]).toEqual({ kind: 'alert', type: 'warning', body: 'This deletes the cache.' })
  expect(blocks[3]).toEqual({ kind: 'tasks', items: [{ done: true, depth: 0, text: 'parse' }, { done: false, depth: 1, text: 'draw' }] })
  // The link and the fence after it stay one stretch of Claude Code's markdown.
  expect(blocks[4]).toEqual({ kind: 'markdown', text: 'More in [the docs](https://example.com).\n\n```ts\n# not a heading\n```' })

  const prose = splitBlocks('## Plan\n\nRan 54 tests.\n\n- [ ] ship', { prose: false })
  expect(prose.map(block => block.kind)).toEqual(['markdown', 'tasks'])
})

test('inline runs pick out code, emphasis, numbers, versions, paths and durations', async () => {
  const styled = (text: string) => inlineRuns(text).filter(run => run.style !== 'plain').map(run => `${run.style}:${run.text}`)

  expect(styled('Ran **54 tests** in 3.2s, `pnpm test` on v1.4.0.')).toEqual(['bold:54 tests', 'duration:3.2s', 'code:pnpm test', 'version:v1.4.0'])
  expect(styled('Edited hooks/rows.tsx and ./scripts/run.sh, 12% of 340 lines, took 140ms.')).toEqual([
    'path:hooks/rows.tsx',
    'path:./scripts/run.sh',
    'number:12%',
    'number:340',
    'duration:140ms',
  ])
  // Words with digits and snake_case stay plain.
  expect(styled('utf8 e2e my_var_name and/or')).toEqual([])
  expect(styled('*quiet* and ~~gone~~')).toEqual(['italic:quiet', 'strike:gone'])
})

test('quiet output splits a command on its separators and leaves quoted ones alone', () => {
  expect(segmentsOf('git status && ls -la | head; echo "a; b && c"')).toEqual(['git status', 'ls -la', 'head', 'echo "a; b && c"'])
  expect(segmentsOf("grep 'x|y' file")).toEqual(["grep 'x|y' file"])
  expect(segmentsOf('echo "never closed')).toBeNull()
})

test('quiet output only folds a command it is sure only reads', () => {
  const reads = [
    'git status',
    'git -C ../repo --no-pager log --oneline -5',
    'git diff HEAD~1 -- hooks/ | head -40',
    'rg -n "TODO|FIXME" hooks 2>/dev/null',
    'ls -la && cat package.json',
    'find . -name "*.ts" -not -path "./node_modules/*"',
    'sed -n 10,40p hooks/rows.tsx',
    'gh pr view 12 --json title',
    'grep -c ">" notes.md',
    'git branch --show-current',
  ]
  const writes = [
    'echo hi > out.txt',
    'cat a >> b',
    'ls $(pwd)',
    'ls `pwd`',
    'cat <<EOF\nx\nEOF',
    'sed -i s/a/b/ file',
    'sed -n -e 1p -e "w out" file',
    'sed -n 1p -i file',
    'find . -name "*.tmp" -delete',
    'find . -exec rm {} \;',
    'git checkout main',
    'git branch -D old',
    'git stash',
    'gh pr merge 12',
    'npm test',
    'rm -rf dist',
    'FOO=1 ls',
    'ls && rm a',
    'sort -o out.txt in.txt',
    'diff <(ls a) <(ls b)',
    'echo "unclosed',
    '',
  ]

  for (const command of reads) {
    expect([command, isReadOnlyShell(command)]).toEqual([command, true])
  }

  for (const command of writes) {
    expect([command, isReadOnlyShell(command)]).toEqual([command, false])
  }

  expect(isReadOnlyShell('Get-Content a.txt | Select-String foo', 'powershell')).toBe(true)
  expect(isReadOnlyShell('Get-ChildItem | Where-Object { $_.Length -gt 0 }', 'powershell')).toBe(false)
  expect(isReadOnlyShell('Remove-Item a.txt', 'powershell')).toBe(false)
  expect(isReadOnlyShell('git status 2>$null', 'powershell')).toBe(true)
})

test('quiet output covers reads, searches and read-only shell calls, and finds the failing line', () => {
  expect(isQuiet('Read', { file_path: '/a' })).toBe(true)
  expect(isQuiet('Grep', { pattern: 'x' })).toBe(true)
  expect(isQuiet('Bash', { command: 'git log -3' })).toBe(true)
  expect(isQuiet('Bash', { command: 'pnpm build' })).toBe(false)
  expect(isQuiet('PowerShell', { command: 'Get-Content a' })).toBe(true)
  expect(isQuiet('Edit', { file_path: '/a' })).toBe(false)
  expect(isQuiet('WebFetch', { url: 'https://a' })).toBe(false)

  expect(errorLine('<tool_use_error>File does not exist.</tool_use_error>')).toBe('File does not exist.')
  expect(errorLine({ stdout: 'Exit code 128', stderr: 'warning: x\nfatal: not a git repository\n' })).toBe('fatal: not a git repository')
  expect(errorLine({ stdout: '', stderr: '' })).toBe('Failed')
  expect(errorLine('one\ntwo\n')).toBe('two')
})

test('/skin copy takes the whole reply, or with code its last code block', async () => {
  const reply = 'Try:\n\n```ts\nconst a = 1\n```\n\nor:\n\n```bash\npnpm build\n```'

  expect(copyOf(reply, false)).toEqual({ text: reply })
  expect(copyOf(reply, true)).toEqual({ text: 'pnpm build' })
  expect(copyOf('No code here.', true)).toEqual({ message: 'No code block in the last reply' })
  expect(copyOf('  \n', false)).toEqual({ message: 'Nothing to copy yet' })
})

test('a Mermaid flowchart parses into ranked nodes, shapes and labelled edges', async () => {
  const flow = parseMermaid('flowchart TD\n  A[Start] --> B{Ok?}\n  B -->|yes| C([Done])\n  B -. no .-> A\n  %% a comment\n  classDef x fill:#f00') as Flow

  expect(flow.kind).toBe('flow')
  expect(flow.direction).toBe('down')
  expect(flow.nodes.map(node => [node.id, node.label, node.shape])).toEqual([
    ['A', 'Start', 'box'],
    ['B', 'Ok?', 'diamond'],
    ['C', 'Done', 'round'],
  ])
  expect(flow.ranks).toEqual([['A'], ['B'], ['C']])
  expect(flow.edges[1]?.label).toBe('yes')
  expect(flow.back.map(edge => [edge.from, edge.to, edge.line, edge.label])).toEqual([['B', 'A', 'dotted', 'no']])
  expect((parseMermaid('graph LR; a-->b; b==>c') as Flow).direction).toBe('right')
})

test('Mermaid the cards cannot draw faithfully parses to nothing', async () => {
  expect(parseMermaid('sequenceDiagram\n  A->>B: hi')).toBeNull()
  expect(parseMermaid('flowchart TD\n  subgraph one\n  A --> B\n  end')).toBeNull()
  expect(parseMermaid('flowchart TD\n  A --> B\n  this is not mermaid')).toBeNull()
  expect(parseMermaid('flowchart TD')).toBeNull()
})

test('an xychart parses its axes and series, and picks a y range when none is given', async () => {
  const chart = parseMermaid('xychart-beta\n  title "Sales"\n  x-axis [jan, feb, mar]\n  y-axis "Revenue"\n  bar [5, 12, 7]\n  line "Trend" [4, 9, 10]') as XyChart

  expect(chart.title).toBe('Sales')
  expect(chart.labels).toEqual(['jan', 'feb', 'mar'])
  expect(chart.yLabel).toBe('Revenue')
  expect(chart.series.map(series => [series.kind, series.name, series.values])).toEqual([
    ['bar', '', [5, 12, 7]],
    ['line', 'Trend', [4, 9, 10]],
  ])
  expect(chart.min).toBe(0)
  expect(chart.max).toBeGreaterThanOrEqual(12)
  expect(chartHeading(chart)).toEqual({ kind: 'Chart', count: '2 series' })
  expect(niceStep(100)).toBe(25)
})

test('a pie parses its slices, and its heading counts them', async () => {
  const pie = parseMermaid('pie title Pets\n  "Dogs" : 386\n  "Cats" : 85.5') as Pie

  expect(pie.title).toBe('Pets')
  expect(pie.slices).toEqual([
    { label: 'Dogs', value: 386 },
    { label: 'Cats', value: 85.5 },
  ])
  expect(chartHeading(pie)).toEqual({ kind: 'Pie', count: '2 slices' })
})

test('chart cards draw in the skin, and a flowchart too wide for its card is left to the code card', async () => {
  const palette = tokyoNight.palette
  const flow = chartSvg(parseMermaid('flowchart TD\n  A[Plan] --> B[Build]\n  B --> A') as Flow, palette, 640)
  const pie = chartSvg(parseMermaid('pie\n  "a" : 1') as Pie, palette, 640)
  const wide = parseMermaid(`flowchart TD\n${Array.from({ length: 12 }, (_, i) => `  R --> N${i}[Node ${i}]`).join('\n')}`) as Flow

  expect(flow?.source).toContain('Plan')
  expect(flow?.source).toContain('marker-end')
  expect(flow?.source).toContain(palette.user)
  expect(flow?.alt).toContain('Build → Plan')
  expect(pie?.source).toContain('<circle')
  expect(chartSvg(wide, palette, 480)).toBeNull()
})

test('a block bar fills to the eighth of a cell', async () => {
  expect(blockBar(1, 4)).toBe('████')
  expect(blockBar(0.5, 3)).toBe('█▌')
  expect(blockBar(0, 4)).toBe('')
  expect(dotRule(1, 4)).toBe('───●')
  expect(dotRule(0, 4)).toBe('●')
})

test('percents drop a trailing zero, and unnamed series are named by kind', async () => {
  expect(formatPercent(0.09)).toBe('9%')
  expect(formatPercent(0.095)).toBe('9.5%')
  expect(formatPercent(0.65)).toBe('65%')

  const chart = parseMermaid('xychart-beta\n  x-axis [a]\n  bar [1]\n  line [2]\n  line "Goal" [3]\n  line [4]') as XyChart
  expect(chart.series.map((_, i) => seriesName(chart, i))).toEqual(['bar', 'line 1', 'Goal', 'line 2'])
})

const DAY = 86_400_000

test('a gantt chains tasks with after, counts days and keeps its flags', async () => {
  const gantt = parseMermaid([
    'gantt',
    '  title Launch',
    '  dateFormat YYYY-MM-DD',
    '  section Build',
    '  Parser :done, p1, 2026-10-01, 4d',
    '  Cards  :active, p2, after p1, 2w',
    '  section Ship',
    '  Tests  :crit, after p2, 1d',
    '  Release :milestone, after p2, 0d',
  ].join('\n')) as Gantt

  expect(gantt.title).toBe('Launch')
  expect(gantt.sections).toEqual(['Build', 'Ship'])
  expect(gantt.tasks.map(task => [task.label, task.section, (task.end - task.start) / DAY])).toEqual([
    ['Parser', 'Build', 4],
    ['Cards', 'Build', 14],
    ['Tests', 'Ship', 1],
    ['Release', 'Ship', 0],
  ])
  expect(gantt.tasks[1]?.start).toBe(gantt.tasks[0]?.end)
  expect(gantt.tasks.map(task => [task.done, task.active, task.crit, task.milestone])).toEqual([
    [true, false, false, false],
    [false, true, false, false],
    [false, false, true, false],
    [false, false, false, true],
  ])
  expect(chartHeading(gantt)).toEqual({ kind: 'Gantt', count: '4 tasks' })
})

test('a timeline groups events by period and section', async () => {
  const timeline = parseMermaid('timeline\n  title Social\n  section Early\n  2002 : LinkedIn\n  2004 : Facebook : Google\n  section Video\n  2005 : YouTube') as Timeline

  expect(timeline.title).toBe('Social')
  expect(timeline.periods).toEqual([
    { label: '2002', section: 'Early', events: ['LinkedIn'] },
    { label: '2004', section: 'Early', events: ['Facebook', 'Google'] },
    { label: '2005', section: 'Video', events: ['YouTube'] },
  ])
  expect(chartHeading(timeline)).toEqual({ kind: 'Timeline', count: '3 periods' })
})

test('a journey scores each step and gathers its actors', async () => {
  const journey = parseMermaid('journey\n  title Day\n  section Work\n    Make tea: 5: Me\n    Do work: 1: Me, Cat') as Journey

  expect(journey.actors).toEqual(['Me', 'Cat'])
  expect(journey.steps.map(step => [step.label, step.score, step.actors])).toEqual([
    ['Make tea', 5, ['Me']],
    ['Do work', 1, ['Me', 'Cat']],
  ])
  expect(chartHeading(journey)).toEqual({ kind: 'Journey', count: '2 steps' })
})

test('a kanban reads columns, cards and their metadata', async () => {
  const kanban = parseMermaid("kanban\n  Todo\n    [Write docs]\n    id2[Ship it]@{ assigned: 'sverre', priority: 'High' }\n  Done\n    [Pie]@{ ticket: 'SK-1' }") as Kanban

  expect(kanban.columns.map(column => [column.label, column.cards.map(card => card.label)])).toEqual([
    ['Todo', ['Write docs', 'Ship it']],
    ['Done', ['Pie']],
  ])
  expect(kanban.columns[0]?.cards[1]).toEqual({ label: 'Ship it', assigned: 'sverre', priority: 'High', ticket: '' })
  expect(kanban.columns[1]?.cards[0]?.ticket).toBe('SK-1')
  expect(chartHeading(kanban)).toEqual({ kind: 'Kanban', count: '3 cards' })
})

test('a mindmap nests by indent and reads node shapes', async () => {
  const mindmap = parseMermaid('mindmap\n  root((Skins))\n    Charts\n      Pie\n    [Themes]\n      Dark') as Mindmap

  expect(mindmap.root.label).toBe('Skins')
  expect(mindmap.root.shape).toBe('circle')
  expect(mindmap.root.children.map(child => [child.label, child.shape, child.children.map(leaf => leaf.label)])).toEqual([
    ['Charts', 'plain', ['Pie']],
    ['Themes', 'square', ['Dark']],
  ])
  expect(mindmap.count).toBe(5)
})

test('a quadrant chart reads axes, quadrant names and points', async () => {
  const chart = parseMermaid('quadrantChart\n  title Reach\n  x-axis Low --> High\n  y-axis Cold --> Hot\n  quadrant-1 Expand\n  A: [0.3, 0.6]\n  B: [0.9, 0.1]') as Quadrant

  expect(chart.x).toEqual(['Low', 'High'])
  expect(chart.y).toEqual(['Cold', 'Hot'])
  expect(chart.quadrants[0]).toBe('Expand')
  expect(chart.points).toEqual([
    { label: 'A', x: 0.3, y: 0.6 },
    { label: 'B', x: 0.9, y: 0.1 },
  ])
  expect(chartHeading(chart)).toEqual({ kind: 'Quadrant', count: '2 points' })
})

test('a radar reads axes across lines, its curves and range', async () => {
  const radar = parseMermaid('radar-beta\n  title Grades\n  axis m["Math"], s["Science"]\n  axis e["English"]\n  curve a["Alice"]{85, 90, 80}\n  max 100\n  min 0') as Radar

  expect(radar.axes.map(axis => axis.label)).toEqual(['Math', 'Science', 'English'])
  expect(radar.curves).toEqual([{ id: 'a', label: 'Alice', values: [85, 90, 80] }])
  expect([radar.min, radar.max]).toEqual([0, 100])
  expect(chartHeading(radar)).toEqual({ kind: 'Radar', count: '1 curve' })
})

test('a sankey reads CSV flows and orders nodes from sources to sinks', async () => {
  const sankey = parseMermaid('sankey-beta\nFarm,Mill,120\nMill,Bread,80\nMill,Waste,40\n"Imports, raw",Mill,10') as Sankey

  expect(sankey.links.map(link => [link.from, link.to, link.value])).toEqual([
    ['Farm', 'Mill', 120],
    ['Mill', 'Bread', 80],
    ['Mill', 'Waste', 40],
    ['Imports, raw', 'Mill', 10],
  ])
  expect(sankey.nodes.indexOf('Farm')).toBeLessThan(sankey.nodes.indexOf('Mill'))
  expect(sankey.nodes.indexOf('Mill')).toBeLessThan(sankey.nodes.indexOf('Bread'))
  expect(chartHeading(sankey)).toEqual({ kind: 'Sankey', count: '4 flows' })
})

test('a git graph tracks branches, merges and cherry-picks', async () => {
  const git = parseMermaid([
    'gitGraph',
    '  commit id: "init"',
    '  branch dev',
    '  checkout dev',
    '  commit id: "feat" type: HIGHLIGHT',
    '  checkout main',
    '  commit type: REVERSE',
    '  merge dev tag: "v1"',
    '  cherry-pick id: "feat"',
  ].join('\n')) as GitGraph

  expect(git.branches).toEqual(['main', 'dev'])
  expect(git.commits.map(commit => [commit.branch, commit.type])).toEqual([
    ['main', 'normal'],
    ['dev', 'highlight'],
    ['main', 'reverse'],
    ['main', 'merge'],
    ['main', 'cherry'],
  ])
  const merge = git.commits[3]
  expect(merge?.tag).toBe('v1')
  expect(merge?.parents).toEqual([git.commits[2]?.id, 'feat'])
  expect(git.commits[4]?.from).toBe('feat')
  expect(chartHeading(git)).toEqual({ kind: 'Git graph', count: '5 commits' })
})

test('a treemap nests by indent and sums each section from its leaves', async () => {
  const treemap = parseMermaid([
    '---',
    'title: Spend',
    '---',
    'treemap-beta',
    '"Compute"',
    '    "EC2": 420',
    '    "Lambda" :::hot',
    '        "Edge": 30',
    '        "Core": 10.5',
    '"Network": 75',
  ].join('\n')) as Treemap

  expect(treemap.title).toBe('Spend')
  expect(treemap.roots.map(root => [root.label, root.value])).toEqual([
    ['Compute', 460.5],
    ['Network', 75],
  ])
  expect(treemap.roots[0]?.children[1]?.children.map(leaf => leaf.label)).toEqual(['Edge', 'Core'])
  expect(chartHeading(treemap)).toEqual({ kind: 'Treemap', count: '4 items' })
})

test('a packet reads ranges, single bits and +n fields end to end', async () => {
  const packet = parseMermaid('packet-beta\n  title UDP\n  0-15: "Source Port"\n  16-31: "Destination Port"\n  32: "Flag"\n  +7: "Rest"') as Packet

  expect(packet.title).toBe('UDP')
  expect(packet.fields).toEqual([
    { start: 0, end: 15, label: 'Source Port' },
    { start: 16, end: 31, label: 'Destination Port' },
    { start: 32, end: 32, label: 'Flag' },
    { start: 33, end: 39, label: 'Rest' },
  ])
  expect(chartHeading(packet)).toEqual({ kind: 'Packet', count: '40 bits' })
})

test('a packet field too narrow for its name is named in full under the art', async () => {
  const packet = parseMermaid('packet-beta\n  0-7: "Type"\n  8: "URG"\n  9: "ACK"\n  10-31: "Rest"') as Packet
  const text = chartArt(packet, 100, false)?.rows.map(row => row.map(segment => segment.text).join('')).join('\n') ?? ''

  expect(text).toContain('8 URG')
  expect(text).toContain('9 ACK')
})

test('an xy chart draws bars up from a ticked axis, names only named series, and gives ASCII bars their own marks', async () => {
  const textOf = (chart: XyChart, ascii: boolean): string => chartArt(chart, 80, ascii)?.rows.map(row => row.map(segment => segment.text).join('')).join('\n') ?? ''
  const plain = parseMermaid('xychart-beta\n  x-axis [Jan, Feb, Mar]\n  y-axis 0 --> 100\n  bar [20, 60, 90]\n  line [30, 50, 80]') as XyChart
  const named = parseMermaid('xychart-beta\n  x-axis [Q1, Q2]\n  y-axis 0 --> 100\n  bar "Free" [40, 80]\n  bar "Plus" [10, 30]') as XyChart

  expect(textOf(plain, false)).toContain('█')
  expect(textOf(plain, false)).toMatch(/^ *50 ┤/m)
  expect(textOf(plain, false)).toMatch(/Jan +Feb +Mar/)
  expect(textOf(plain, false)).not.toContain('bar')
  expect(textOf(named, false)).toContain('■ Free   ■ Plus')
  expect(textOf(named, true)).toContain('# Free   % Plus')
})

test('series colours skip a colour the skin gives two slots', async () => {
  const palette = rosePine.palette
  const colors = [0, 1, 2, 3].map(i => seriesColor(palette, i))

  expect(palette.read).toBe(palette.ok)
  expect(new Set(colors).size).toBe(4)
  expect(colors[2]).toBe(palette.warn.toLowerCase())
})

test('a block link with no straight run turns one corner instead of being listed', async () => {
  const block = parseMermaid('block-beta\n  columns 3\n  a["Web"] b["API"] c["Worker"]\n  space:3\n  d[("Postgres")] space:2\n  c --> d') as Block
  const text = chartArt(block, 100, false)?.rows.map(row => row.map(segment => segment.text).join('')).join('\n') ?? ''

  expect(text).toContain('←')
  expect(text).toContain('┘')
  expect(text).not.toContain('Worker ──→ Postgres')
})

test('a connector crosses a frame on its line, clear of its name, and lands inside it', async () => {
  const c4 = parseMermaid('C4Container\n  Person(buyer, "Buyer")\n  System_Boundary(shop, "Shop") {\n    Container(web, "Web Shop")\n  }\n  Rel(buyer, web, "Browses")') as C4
  const rows = chartArt(c4, 100, false)?.rows.map(row => row.map(segment => segment.text).join('')) ?? []
  const edge = rows.findIndex(row => row.includes('Shop · system'))

  expect(rows[edge]).toContain('┄ Shop · system ┄')
  expect(rows[edge]).not.toContain('system │')
  expect(rows[edge]).toContain('│')
  expect(rows[edge + 1]).toContain('↓')
})

test('a block diagram reads columns, spans, shapes, nested blocks and labelled links', async () => {
  const block = parseMermaid([
    'block-beta',
    '  columns 3',
    '  frontend["Web app"]:2 cdn(("CDN"))',
    '  space:3',
    '  block:backend:3',
    '    columns 2',
    '    api["API"] worker[["Worker"]]',
    '    db[("Postgres")] cache{"Cache"}',
    '  end',
    '  api -- "jobs" --> worker',
    '  a --> b',
  ].join('\n')) as Block
  const backend = block.parts[3]

  expect(block.columns).toBe(3)
  expect(block.parts.slice(0, 3).map(part => (part.type === 'box' ? [part.id, part.shape, part.span] : [part.type, part.span]))).toEqual([
    ['frontend', 'box', 2],
    ['cdn', 'circle', 1],
    ['gap', 3],
  ])
  expect(backend?.type === 'frame' && backend.parts.map(part => part.type === 'box' && part.shape)).toEqual(['box', 'subroutine', 'cylinder', 'diamond'])
  expect(block.links[0]).toEqual({ from: 'api', to: 'worker', label: 'jobs', arrow: 'to', line: 'solid' })
  // A link line declares the blocks it names, as Mermaid does.
  expect(block.boxes).toBe(8)
  expect(chartHeading(block)).toEqual({ kind: 'Block diagram', count: '8 blocks' })
})

test('an architecture places services on a grid from the sides their edges join', async () => {
  const architecture = parseMermaid([
    'architecture-beta',
    '  group cloud(cloud)[Cloud]',
    '  group data(database)[Data] in cloud',
    '  service gateway(internet)[Gateway] in cloud',
    '  service api(server)[API] in cloud',
    '  service db(database)[Database] in data',
    '  service browser(internet)[Browser]',
    '  junction mid in cloud',
    '  browser:R --> L:gateway',
    '  gateway:R --> L:api',
    '  api:B --> T:mid',
    '  mid:L -- R:db',
  ].join('\n')) as Architecture
  const at = (id: string) => architecture.services.find(service => service.id === id)

  expect(architecture.groups.map(group => [group.id, group.parent])).toEqual([
    ['cloud', null],
    ['data', 'cloud'],
  ])
  expect([at('browser'), at('gateway'), at('api'), at('mid'), at('db')].map(service => [service?.col, service?.row])).toEqual([
    [0, 0],
    [1, 0],
    [2, 0],
    [2, 1],
    [1, 1],
  ])
  expect(at('mid')?.isJunction).toBe(true)
  expect(architecture.edges[3]).toEqual({ from: 'mid', fromSide: 'L', to: 'db', toSide: 'R', label: '', arrow: 'none' })
  expect(chartHeading(architecture)).toEqual({ kind: 'Architecture', count: '4 services' })
})

test('a C4 diagram reads people, systems, boundaries and relations', async () => {
  const c4 = parseMermaid([
    'C4Context',
    '  title Banking',
    '  Person(customer, "Customer", "Has accounts")',
    '  Enterprise_Boundary(bank, "Big bank") {',
    '    System_Ext(mainframe, "Mainframe", "Core data")',
    '    SystemDb(email, "E-mail")',
    '  }',
    '  Rel(customer, mainframe, "Reads", "HTTPS")',
    '  BiRel(mainframe, email, "Syncs")',
  ].join('\n')) as C4
  const bank = c4.parts[1]

  expect(c4.title).toBe('Banking')
  expect(c4.parts[0]).toMatchObject({ type: 'box', id: 'customer', shape: 'person', notes: ['Person', 'Has accounts'] })
  expect(bank?.type === 'frame' && bank.label).toBe('Big bank · enterprise')
  expect(bank?.type === 'frame' && bank.parts.map(part => part.type === 'box' && [part.id, part.shape, part.isExternal])).toEqual([
    ['mainframe', 'box', true],
    ['email', 'cylinder', false],
  ])
  expect(c4.links.map(link => [link.label, link.arrow])).toEqual([
    ['Reads [HTTPS]', 'to'],
    ['Syncs', 'both'],
  ])
  expect(chartHeading(c4)).toEqual({ kind: 'C4 context', count: '3 elements' })
})

test('a C4 link through another box goes round it in a lane on narrow cards', async () => {
  const c4 = parseMermaid('C4Context\n  System(a, "Top")\n  System(b, "Middle")\n  System(c, "Bottom")\n  Rel(a, c, "Skips")') as C4
  const card = chartSvg(c4, tokyoNight.palette, 300)

  expect(card?.source).toMatch(/<path d="M[\d.]+ [\d.]+H[\d.]+V[\d.]+H[\d.]+"/)
  expect(card?.source).toContain('rotate(-90')
})

test('broken plans and shapes parse to nothing rather than half a chart; a score out of range clamps', async () => {
  expect(parseMermaid('gantt\n  title Empty')).toBeNull()
  expect(parseMermaid('gantt\n  dateFormat YYYY-MM-DD\n  Task :a1, after nowhere, 2d')).toBeNull()
  expect((parseMermaid('journey\n  section Work\n    Make tea: 9: Me') as Journey).steps[0]?.score).toBe(5)
  expect(parseMermaid('radar-beta\n  axis a, b, c\n  curve x{1, 2}')).toBeNull()
  expect(parseMermaid('sankey-beta\nA,B,lots')).toBeNull()
  expect(parseMermaid('gitGraph\n  commit\n  checkout nowhere')).toBeNull()
  expect(parseMermaid('quadrantChart\n  A: [1.5, 0.2]')).toBeNull()
  expect(parseMermaid('treemap-beta\n"Leaf": 5\n    "Child": 2')).toBeNull()
  expect(parseMermaid('treemap-beta\n"Empty"')).toBeNull()
  expect(parseMermaid('packet-beta\n  0-7: "A"\n  10-15: "B"')).toBeNull()
  expect(parseMermaid('block-beta\n' + Array.from({ length: 41 }, (_, i) => `  b${i}`).join('\n'))).toBeNull()
  expect(parseMermaid('architecture-beta\n  group a[A] in b\n  group b[B] in a\n  service s(server)[S] in a')).toBeNull()
  expect(parseMermaid('architecture-beta\n  service a(server)[A]\n  a:R --> L:nowhere')).toBeNull()
  expect(parseMermaid('C4Context\n  Person(a, "A")\n  Rel(a, nowhere, "x")')).toBeNull()
})

const SAMPLES = [
  'gantt\n  dateFormat YYYY-MM-DD\n  Parser :p1, 2026-10-01, 4d\n  Cards :after p1, 3d',
  'timeline\n  2002 : LinkedIn\n  2004 : Facebook',
  'journey\n  section Work\n    Make tea: 5: Me\n    Do work: 1: Me',
  "kanban\n  Todo\n    [Write docs]@{ assigned: 'sverre', priority: 'High' }\n  Done\n    [Pie]",
  'mindmap\n  root((Skins))\n    Charts\n    Themes',
  'quadrantChart\n  x-axis Low --> High\n  y-axis Cold --> Hot\n  A: [0.3, 0.6]',
  'radar-beta\n  axis a["Speed"], b["Power"], c["Range"]\n  curve x["Ship"]{3, 4, 5}',
  'sankey-beta\nFarm,Mill,120\nMill,Bread,80',
  'gitGraph\n  commit\n  branch dev\n  commit\n  checkout main\n  merge dev',
  'treemap-beta\n"Compute"\n    "EC2": 420\n    "Lambda": 160\n"Storage"\n    "S3": 210\n"Network": 75',
  'packet-beta\n  0-15: "Source Port"\n  16-31: "Destination Port"\n  32: "URG"\n  33: "ACK"\n  34-63: "Rest"',
  'block-beta\n  columns 3\n  a["Web"]:2 b(("CDN"))\n  block:back:3\n    c[("DB")] d{"Cache"}\n  end\n  a --> c\n  b -- "push" --> a',
  'architecture-beta\n  group cloud(cloud)[Cloud]\n  service api(server)[API] in cloud\n  service db(database)[Database] in cloud\n  junction mid\n  api:R --> L:db\n  api:B -- T:mid',
  'C4Context\n  Person(u, "User", "Signs in")\n  System_Boundary(s, "Shop") {\n    System(web, "Web", "Sells things")\n  }\n  Rel(u, web, "Buys", "HTTPS")',
]

test('every new kind draws a card with a readable alt, and art that ascii mode keeps to ASCII', async () => {
  for (const source of SAMPLES) {
    const chart = parseMermaid(source)
    expect(chart).not.toBeNull()
    if (chart === null) continue

    const card = chartSvg(chart, tokyoNight.palette, 640)
    expect(card?.source.startsWith('<svg')).toBe(true)
    expect(card?.alt.length).toBeGreaterThan(0)

    const art = chartArt(chart, 80, true)
    expect(art).not.toBeNull()
    const text = art?.rows.map(row => row.map(segment => segment.text).join('')).join('\n') ?? ''
    expect(text.length).toBeGreaterThan(0)
    expect(/^[\x20-\x7e\n]*$/.test(text)).toBe(true)
    expect(art?.rows.every(row => row.reduce((sum, segment) => sum + segment.text.length, 0) <= 80)).toBe(true)
  }
})

test('the gantt card lays tasks on dates, and the alt reads them back', async () => {
  const gantt = parseMermaid('gantt\n  title Plan\n  dateFormat YYYY-MM-DD\n  Parser :done, p1, 2026-10-01, 4d\n  Cards :after p1, 3d') as Gantt
  const card = chartSvg(gantt, tokyoNight.palette, 640)

  expect(card?.source).toContain('Parser')
  expect(card?.alt).toContain('Parser: 2026-10-01 to 2026-10-05 (done)')
  expect(card?.alt).toContain('Cards: 2026-10-05 to 2026-10-08')
})

test('splitReply can leave tables and turned-down fences as text', async () => {
  const reply = '| a | b |\n|---|---|\n| 1 | 2 |\n\n```ts\nx\n```\n\n```mermaid\npie\n  "a" : 1\n```'
  const segments = splitReply(reply, { tables: false, fence: lang => lang === 'mermaid' })

  expect(segments.map(segment => segment.kind)).toEqual(['text', 'code'])
  expect(segments[0]?.kind === 'text' && segments[0].text).toContain('```ts')
})
