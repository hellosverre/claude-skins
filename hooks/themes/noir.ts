import type { Skin } from '../skin'

// Black and white, and white and black on a light background.
const skin: Skin = {
  name: 'noir',
  label: 'Noir',
  palette: {
    read: '#ededed',
    write: '#ededed',
    run: '#ededed',
    search: '#ededed',
    web: '#ededed',
    mcp: '#ededed',
    other: '#ededed',
    user: '#f5f5f5',
    fg: '#ededed',
    muted: '#8c8c8c',
    surface: '#151515',
    zebra: '#1c1c1c',
    ok: '#ededed',
    err: '#f87171',
    warn: '#a3a3a3',
  },
  light: {
    read: '#111111',
    write: '#111111',
    run: '#111111',
    search: '#111111',
    web: '#111111',
    mcp: '#111111',
    other: '#111111',
    user: '#111111',
    fg: '#151515',
    muted: '#6b6b6b',
    surface: '#ededed',
    zebra: '#f2f2f2',
    ok: '#151515',
    err: '#c42b2b',
    warn: '#6b6b6b',
  },
  spinner: ['Thinking', 'Working', 'Composing', 'Considering', 'Weighing'],
  done: ['Done', 'Finished', 'Settled'],
}

export default skin
