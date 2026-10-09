import ayu from './ayu'
import catppuccin from './catppuccin'
import dracula from './dracula'
import everforest from './everforest'
import github from './github'
import gruvbox from './gruvbox'
import kanagawa from './kanagawa'
import mono from './mono'
import nightOwl from './night-owl'
import noir from './noir'
import nord from './nord'
import oneDark from './one-dark'
import rosePine from './rose-pine'
import solarized from './solarized'
import tokyoNight from './tokyo-night'
import type { Skin } from '../skin'

// A new built-in skin is one file beside these and one line here. The first is the default.
export const SKINS: readonly Skin[] = [
  noir,
  tokyoNight,
  dracula,
  nord,
  gruvbox,
  catppuccin,
  rosePine,
  everforest,
  oneDark,
  solarized,
  github,
  kanagawa,
  ayu,
  nightOwl,
  mono,
]
