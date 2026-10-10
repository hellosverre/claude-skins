import type { Skin } from '../skin'

const skin: Skin = {
  name: 'night-owl',
  label: 'Night Owl',
  palette: {
    read: '#7fdbca',
    write: '#f78c6c',
    run: '#ecc48d',
    search: '#c792ea',
    web: '#82aaff',
    mcp: '#7fdbca',
    other: '#d6deeb',
    user: '#82aaff',
    fg: '#d6deeb',
    muted: '#637777',
    surface: '#0b2942',
    zebra: '#071d33',
    ok: '#addb67',
    err: '#ef5350',
    warn: '#ecc48d',
  },
  spinner: ['Hooting', 'Perching', 'Swooping', 'Watching', 'Prowling', 'Gliding'],
  done: ['Spotted', 'Swooped', 'Perched', 'Caught'],
}

export default skin
