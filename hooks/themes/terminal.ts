import type { Skin } from '../skin'
import noir from './noir'

const skin: Skin = {
  name: 'terminal',
  label: 'Terminal',
  palette: noir.palette,
  ansi: {
    read: 'ansi256(6)',
    write: 'ansi256(5)',
    run: 'ansi256(3)',
    search: 'ansi256(4)',
    web: 'ansi256(14)',
    mcp: 'ansi256(13)',
    other: 'ansi256(8)',
    user: 'ansi256(12)',
    fg: 'text',
    muted: 'ansi256(8)',
    surface: 'userMessageBackground',
    zebra: 'bashMessageBackgroundColor',
    ok: 'ansi256(2)',
    err: 'ansi256(1)',
    warn: 'ansi256(3)',
  },
  spinner: noir.spinner,
  done: noir.done,
}

export default skin
