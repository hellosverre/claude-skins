<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="docs/brand/banner-light.svg">
    <img alt="skins" src="docs/brand/banner-dark.svg" width="640">
  </picture>
</h1>

<p align="center">
  <a href="https://github.com/hellosverre/claude-skins/releases/latest"><img alt="release" src="https://img.shields.io/github/v/release/hellosverre/claude-skins?style=flat-square&color=555"></a>
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-555?style=flat-square"></a>
  <img alt="Claude Code 2.1.287+" src="https://img.shields.io/badge/Claude%20Code-2.1.287%2B-555?style=flat-square">
</p>

<p align="center">Tool calls with icons and timings, edits as diff cards, tables, code and Mermaid charts as cards,<br>a live usage band, and fifteen skins you can repaint or have Claude design for you.</p>

<img alt="Claude Code switching skins with /skin: a coding turn in Noir and Tokyo Night, then Mermaid chart cards in Dracula (xy chart), Catppuccin (sankey), Rosé Pine (radar) and Gruvbox (treemap)" src="docs/demo.gif">

## Install

Needs Claude Code **2.1.287** or later, in a terminal or the desktop app's Code tab. Run both inside Claude Code:

```
/plugin marketplace add hellosverre/claude-skins
```

```
/plugin install skins@hellosverre-mods
```

Restart Claude Code. The **noir** skin is on; type `/skin` to change it.

## Update

skins checks for a new release once a day and shows a toast when you are behind. To update:

```bash
claude plugin marketplace update hellosverre-mods
```

```bash
claude plugin update skins@hellosverre-mods
```

Then restart Claude Code. Open sessions keep the version they started with.

## Uninstall

```bash
claude plugin uninstall skins@hellosverre-mods
```

To keep it installed but go back to Claude Code's own drawing, run `/skin off`.

## Use

| Command | What it does |
|---|---|
| `/skin` | Settings: pick a skin with a live preview, toggle parts, repaint any colour |
| `/skin <name>` | Switch skin: `noir`, `tokyo-night`, `dracula`, `catppuccin`, `rose-pine`, `nord`, `gruvbox`, `kanagawa`, `everforest`, `one-dark`, `solarized`, `night-owl`, `ayu`, `github`, `mono` |
| `/skin list` | Every skin, yours included |
| `/skin off` | Back to Claude Code's own drawing |
| `/skin rail\|shimmer\|band\|clip\|markdown\|quiet\|charts\|math\|commands\|shell on\|off` | Toggle one part |
| `/skin calm` · `calm off` | No motion, one line per tool row, read-only output folded, failures always whole. `calm off` puts back what you had |
| `/skin copy` · `copy code` | Copy Claude's last reply, or just its last code block |
| `/skin tables on\|text\|off` | `text` draws tables and code as selectable text on the desktop |
| `/skin gallery` | Every element the skin draws, numbered, to point at |
| `/skin pin` · `unpin` · `share` | Give this folder its own look, drop it, or make it the default |

**Design one with Claude.** Ask "make me a skin that feels like a sunset". skins gives Claude a
`design` tool, so it builds the skin and applies it while you watch. Repainting a built-in skin saves
it as your own `my-<skin>`. Choices are remembered across sessions.

## Preview

Drawn by the mod's own card code (`scripts/previews.ts`), not screenshots.

<picture>
  <source media="(prefers-color-scheme: light)" srcset="docs/previews/hero-light.svg">
  <img alt="A Claude Code turn with the noir skin: tool rows with icons, an edit as a diff card, and a table card" src="docs/previews/hero-dark.svg">
</picture>

<picture>
  <source media="(prefers-color-scheme: light)" srcset="docs/previews/spinners-light.svg">
  <img alt="The four spinner animations: thinking, running a tool, writing, waiting" src="docs/previews/spinners-dark.svg">
</picture>

<picture>
  <source media="(prefers-color-scheme: light)" srcset="docs/previews/terminal-light.svg">
  <img alt="Shell output in a terminal card" src="docs/previews/terminal-dark.svg">
</picture>

<picture>
  <source media="(prefers-color-scheme: light)" srcset="docs/previews/code-light.svg">
  <img alt="A code block as a card with line numbers" src="docs/previews/code-dark.svg">
</picture>

<picture>
  <source media="(prefers-color-scheme: light)" srcset="docs/previews/usage-light.svg">
  <img alt="Context and plan limit rings" src="docs/previews/usage-dark.svg">
</picture>

## What it redraws

| Part | Desktop app | Terminal |
|---|---|---|
| Tool calls | Icon per kind, spinner while running, lines changed, time taken | A node on the turn's rail |
| Edits | Diff card with `+N −M` and numbered lines | Claude Code's own diff |
| Shell commands | Terminal card with status, stderr apart, long output folded | Card with the command, `✓` or `✗ exit N`, stderr in red under its own label, each stream folded to 8 + 4 lines (`/skin shell off` for Claude Code's own) |
| Quiet output (off by default) | Reads, searches and read-only commands fold to one row; a failure keeps its error line | The same |
| Tables | Card with header rule, zebra rows, colour swatches | Cell grid with a header band |
| Charts | ` ```mermaid ` as a card: flowchart, xy, pie, gantt, timeline, journey, kanban, mindmap, quadrant, radar, sankey, gitGraph, treemap, packet, block, architecture, C4 | The same seventeen drawn in cells, ASCII with `/skin icons ascii` |
| Math | `$$…$$`, `\[…\]` and ` ```math ` as a typeset card: fractions, roots, sums and integrals with limits, matrices, aligned lines; `$…$` inline turns into Unicode | Fractions and limits stacked in cells, inline `$…$` as Unicode |
| Command output | `/cost`, `/context` and plugin output: tables, code and `key: value` runs as cards | The same as cell grids |
| Alerts and task lists | `> [!NOTE]` as a titled box, `- [ ]` with ticks and a done count | The same |
| Code blocks | Card with language, line numbers, highlighting; shell blocks keep the Run button | Claude Code's own markdown |
| Spinner | Animated icon per phase | The skin's word with a band of light |
| Above the prompt | Context and plan-limit rings, Compact button, nudge at 70% | Block meters, same button |
| Your prompts | Rounded outline | The same |

Every card has a Copy button and animates once, on first draw, respecting reduced motion. Only the
drawing changes: the stored conversation and what the model reads are untouched. Agents, plan mode
and the permission prompt keep Claude Code's own drawing.

**Light and dark.** Every skin has both and follows Claude Code's theme. On `auto` it follows your
terminal (`COLORFGBG`) or the system. Force one with `SKINS_THEME=light` or `SKINS_THEME=dark`.

## Compatibility

Checked by hand on Windows (terminal and desktop app, 0.3.0) and run on Linux (terminal, 0.4.0,
Claude Code 2.1.288). macOS, VS Code and mobile are untested. The surface × OS matrix and
render times per row are in [docs/compat.md](docs/compat.md). To measure on your machine:

```bash
scripts/bench.sh
```

## Known limitations

| What | What you get instead | Where |
|---|---|---|
| Agents, plan mode, todos, the permission prompt | Claude Code's own rows and dialogs | `kindOf` in [`hooks/tools.ts`](hooks/tools.ts); test "tools a skin cannot redraw faithfully keep their own row" |
| Edits on the terminal, failed edits everywhere | Claude Code's own diff | [`hooks/register.tsx`](hooks/register.tsx) `ToolResult`; test "on the desktop an edit is a diff card…" |
| Code blocks on the terminal | Claude Code's own markdown | `replyRows` in [`hooks/rows.tsx`](hooks/rows.tsx); test "a code fence is a card on the desktop and stays markdown in the terminal" |
| Shell fences (` ```bash `) on the desktop | The app's own block, so its Run button stays | test "on the desktop a shell fence keeps the app's own block" |
| Sequence, state, class and ER diagrams on the desktop | A code card: only the terminal's vendored layout draws them | `artKind` in [`hooks/mermaid-art.ts`](hooks/mermaid-art.ts), `parseMermaid` in [`hooks/mermaid.ts`](hooks/mermaid.ts) |
| A diagram too wide or too long (over 80 lines or 8,000 characters on the terminal) | Rows for flowchart, xy and pie, else the code | test "a diagram too wide for the terminal falls back to rows…" |
| A reply block over 9,000 characters, a prompt over 4,000 | Claude Code's own drawing of the whole message | `MAX_MARKDOWN`, `MAX_PROMPT` in [`hooks/register.tsx`](hooks/register.tsx) |
| Code cards past 80 lines | The first 80 and a `N more lines` note; Copy takes all of it | `MAX_LINES` in [`hooks/svg-code.ts`](hooks/svg-code.ts) |
| TeX commands the parser does not know | Drawn as written, `\name` | [`hooks/math.ts`](hooks/math.ts) |
| Shell output on the terminal vs the desktop | The terminal card names the command and folds each stream to 8 + 4 lines; the desktop card says `Output` and folds both streams together to 6 + 6 | [`hooks/shell-rows.tsx`](hooks/shell-rows.tsx), [`hooks/svg-terminal.ts`](hooks/svg-terminal.ts) |
| A failed shell call that hands back error text, not its record | stdout and stderr arrive merged, so the whole text is drawn as stderr | `shellResultOf` in [`hooks/shell.ts`](hooks/shell.ts) |
| Shell cards and tool timings after `/resume` | No command in the header and no time: both are recorded as the call runs | `commandAtom`, `durationAtom` in [`hooks/register.tsx`](hooks/register.tsx) |
| Slash-command errors and `/skin`'s own output | Claude Code's own row | test "slash-command output with key: value lines is a table, prose keeps its row" |
| `/skin calm` and Claude Code's spinner | Calm hands the spinner back to Claude Code, whose own spinner still moves | `Spinner` in [`hooks/register.tsx`](hooks/register.tsx) |
| The settings pane on mobile | A line saying to use the terminal or the desktop app | `Pane` in [`hooks/register.tsx`](hooks/register.tsx) |
| Icons and the rail | Icons on the desktop only (the terminal draws no `Svg`); the rail on the terminal only | `lookOf` in [`hooks/register.tsx`](hooks/register.tsx) |

## Compared with

Other mods that change how the transcript looks, from their READMEs on 2026-10-10. Blank means
the README does not say.

| | skins | [Prismantis](https://github.com/NahumLitvin/prismantis) | [tweakcc](https://github.com/Piebald-AI/tweakcc) | [claude-gfm-render](https://github.com/briangtn/claude-gfm-render) | [ccstatusline](https://github.com/sirmalloc/ccstatusline) |
|---|---|---|---|---|---|
| How | Function-hooks plugin | Function-hooks plugin | Patches Claude Code's JavaScript; reapply after each update | Function-hooks mod | Status line command |
| Claude Code | 2.1.287+ | 2.1.287+ | Verified on 2.1.162 | 2.1.286+ | |
| Platforms named | Windows by hand, Linux by tests ([compat](docs/compat.md)) | macOS terminal by hand; CI on macOS, Linux, Windows | Windows, macOS, Linux | Terminal and desktop app | Windows guide in its docs |
| Themes | 15, repaint any colour, or have Claude design one | 15 and `mono`, 20 colour slots | Your own, for Claude Code's whole UI | | Powerline themes |
| Recolours Claude Code's own UI | No | No | **Yes** | No | No |
| Tool rows | Icons, timings, rail | 4 styles | | No | No |
| Read-only output hidden | `/skin quiet` | `toolOutput: quiet` | | No | No |
| Edit diffs | Card on the desktop | Claude Code's own | | No | No |
| Shell output | Card on both surfaces | Boxed in expanded groups | | No | No |
| Tables | Card or cell grid | 4 styles, side by side with diagrams | 4 formats | No | No |
| Mermaid | 17 kinds; sequence, state, class, ER on the terminal only | Flowchart, sequence, state, class, ER, xy; no pie | | Flowchart, sequence, state, class, ER, xy; SVG on the desktop | No |
| Math | Card on the desktop, stacked cells on the terminal | Typeset image in kitty and Ghostty via RaTeX, text elsewhere | | Not handled | No |
| Right-to-left text | No | **Hebrew and Arabic** | | | No |
| Usage meters | Context and plan limits above the prompt | | | No | **Many widgets**, Powerline |
| Spinner words | The skin's, with a shimmer | | **Your own verbs and animations** | No | No |
| Copy | Button on cards, `/skin copy` | Buttons, `/prismantis copy`, HTML tables | | | No |

Where they are better: **tweakcc** recolours all of Claude Code, not only what a hook can
redraw, at the cost of patching the binary. **Prismantis** lays tables and diagrams side by side,
handles right-to-left text and copies tables as HTML. **ccstatusline** has a far deeper status
line. **claude-gfm-render** draws sequence and other diagrams as SVG on the desktop, where skins
falls back to a code card.

## Privacy

skins draws and remembers, nothing else. It reads the session directory, your context and plan
usage, the theme setting and `SKINS_THEME` / `COLORFGBG`, and keeps its settings in the mod store.
Its one network call is the daily version check: a GET of this repo's
[`plugin.json`](.claude-plugin/plugin.json) on `raw.githubusercontent.com`, sending nothing. On `auto`
it asks the OS for light or dark mode (`defaults` on macOS, `gsettings` on GNOME). It compacts or
copies only when you press the button. Check it yourself with `claude plugin validate .`.

## Vendored code

Terminal diagrams are laid out by [beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid)
(MIT), bundled into `hooks/vendor/mermaid-ascii.js` with its licence in the header. To rebuild it:

```bash
cd scripts/vendor && npm install && npm run build
```

## Develop

```bash
git clone https://github.com/hellosverre/claude-skins && cd claude-skins
```

```bash
claude --plugin-dir .
```

Saving a file reloads the mod in the running session. Tests: `claude plugin test .`. Previews:
`npx tsx scripts/previews.ts`. A new built-in skin is one file: copy `hooks/themes/nord.ts`, change
the colours and words, add a line to `hooks/themes/index.ts`.

## License

MIT
