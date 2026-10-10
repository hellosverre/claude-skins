import type { Skin } from '../skin'

const skin: Skin = {
  name: 'ayu',
  label: 'Ayu',
  palette: {
    read: '#95e6cb',
    write: '#ff8f40',
    run: '#ffb454',
    search: '#d2a6ff',
    web: '#59c2ff',
    mcp: '#39bae6',
    other: '#bfbdb6',
    user: '#e6b450',
    fg: '#bfbdb6',
    muted: '#626a73',
    surface: '#131721',
    zebra: '#0f131a',
    ok: '#aad94c',
    err: '#f07178',
    warn: '#ffb454',
  },
  light: {
    read: '#4cbf99',
    write: '#fa8d3e',
    run: '#f2ae49',
    search: '#a37acc',
    web: '#399ee6',
    mcp: '#55b4d4',
    other: '#787b80',
    user: '#ffaa33',
    fg: '#5c6166',
    muted: '#8a9199',
    surface: '#f3f4f5',
    zebra: '#f8f9fa',
    ok: '#86b300',
    err: '#e65050',
    warn: '#f2ae49',
  },
  spinner: ['Dawning', 'Glinting', 'Warming', 'Kindling', 'Shining', 'Ripening'],
  done: ['Dawned', 'Shone', 'Warmed', 'Lit'],
}

export default skin
