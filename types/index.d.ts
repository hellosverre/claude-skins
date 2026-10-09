// Every colour a skin names. `fg` is body text, `muted` secondary text, `surface` the
// band behind a table header, `zebra` every other table row.
export type SkinSlot =
  | 'read'
  | 'write'
  | 'run'
  | 'search'
  | 'web'
  | 'mcp'
  | 'other'
  | 'user'
  | 'fg'
  | 'muted'
  | 'surface'
  | 'zebra'
  | 'ok'
  | 'err'
  | 'warn'

// What /skin and the settings pane change. `skin` is a skin's name, or 'off'.
export type Prefs = {
  skin: string
  icons: 'unicode' | 'ascii'
  rail: boolean
  // 'text' keeps the skin but draws tables and code as text the desktop can select.
  tables: 'on' | 'text' | 'off'
  shimmer: boolean
  band: boolean
  clipOutput: boolean
  markdown: boolean
  quiet: boolean
  charts: boolean
  // Display formulas as cards and inline TeX as Unicode.
  math: boolean
  // Tables and code in slash-command output drawn the way replies are.
  commands: boolean
  // Shell output as a card: the command, its exit status, stderr apart, long output folded.
  shell: boolean
  // Fenced code on the terminal and shell output in the skin's colours.
  highlight: boolean
  // The model-only note that charts and diagrams draw here.
  hints: boolean
  // Bare URLs as links: OSC 8 where the terminal draws it, anchors on the desktop.
  links: boolean
  // Copy buttons on tables, code, diagrams and whole replies.
  copy: boolean
  // Long code, tables and shell output folded behind a `▾ N more` control.
  fold: boolean
  // While /skin calm is on, the parts it changed as they were before it, for calm off to
  // put back; null while it is off.
  calm: CalmSnapshot | null
}

// The prefs /skin calm changes: no shimmer, no rail line above each tool row, quiet output.
export type CalmSnapshot = { shimmer: boolean; rail: boolean; quiet: boolean }

// A skin someone made in the settings pane or through their agent: a built-in skin
// with some slots and words changed.
export type CustomSkin = {
  name: string
  label: string
  base: string
  palette: Partial<Record<SkinSlot, string>>
  spinner: string[]
  done: string[]
}

// How full the context window is and how much of each plan limit is spent, in percent,
// as the band above the prompt shows them.
export type UsageSnap = { context: number | null; limits: { label: string; percent: number }[] }

// What one turn did, shown in its footer.
export type TurnStats = { tools: number; added: number; removed: number }

// What this turn did to a file: made it, or changed one that was there.
export type Touch = 'created' | 'edited'

// How a tool row stands: opened or closed by the person, or `auto`, open only when the
// call failed.
export type Disclosure = 'auto' | 'open' | 'closed'

// `$.skins.markdown`'s argument: where the tree draws, the markdown, the width in columns.
export type SkinsMarkdownArgs = { surface: 'terminal' | 'desktop' | 'vscode' | 'mobile'; text: string; columns: number }

declare module 'claude-code' {
  // What skins adds to `$` for other mods.
  interface EngineInterface {
    skins: {
      // Markdown drawn the way skins draws a reply in the person's skin: tables, code,
      // diagrams, math, alerts. Undefined when skins is off or the text holds nothing it
      // draws; throws on a malformed argument. No copy or fold controls.
      markdown: (args: SkinsMarkdownArgs) => Promise<RenderElement | undefined>
    }
  }

  interface PluginState {
    skins: {
      prefs: Prefs
      custom: Record<string, CustomSkin>
      startedAt: number
      frame: number
      turns: Record<string, TurnStats>
      duration: StateFamily<number>
      editing: SkinSlot
      usage: UsageSnap
      isLight: boolean
      images: StateFamily<boolean>
      quiet: StateFamily<boolean>
      // A shell call's command, for its output card's header: ToolResult does not carry it.
      command: StateFamily<string>
      // Each tool row's chevron, and whether its opened answer shows past the fold.
      disclosure: StateFamily<Disclosure>
      showAll: StateFamily<boolean>
      // Files the turn created or edited, by absolute path, for their colour in rows and prose.
      touched: Record<string, Touch>
      // Whether the terminal draws OSC 8 links, read from its environment at start.
      hyperlinks: boolean
      // Per drawing, the keys of the blocks the person unfolded.
      folds: StateFamily<string[]>
      compacting: boolean
      pinned: boolean
      lastReply: string
    }
  }
}
