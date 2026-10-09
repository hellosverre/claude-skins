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
