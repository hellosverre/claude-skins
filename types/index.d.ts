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
}

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

declare module 'claude-code' {
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
      compacting: boolean
      pinned: boolean
      settle: number
    }
  }
}
