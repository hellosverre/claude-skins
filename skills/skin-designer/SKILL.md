---
name: skin-designer
description: Design or change the person's Claude Code transcript skin with the skins mod. Use when they ask to restyle, recolour or theme Claude Code, make a skin from a mood, a brand, a wallpaper or another theme, change the spinner or footer words, or switch the rail, tables or shimmer on or off.
---

# Designing a skin

The skins mod redraws this transcript: tool calls on a timeline rail, tables with a header band and
zebra rows, a shimmering spinner and a turn footer. It gives you one tool, `mcp__skins__design`, and
every change shows on screen the moment the call returns.

## Steps

1. Call `{"action": "show"}`. It returns the current skin's palette, what each slot paints, the
   built-in skins and the ones already made.
2. Pick the built-in skin closest to what they asked for as `base`; a made skin only lists the slots
   it changes.
3. Call `save` with a lowercase hyphenated `name`, the `base`, the changed `palette` slots, and, when
   the mood calls for it, `spinner` gerunds and `done` past-tense words that match it.
4. Tell them what you changed in one line, and that `/skin` opens the settings to fine-tune it.

```json
{
  "action": "save",
  "name": "sunset",
  "base": "gruvbox",
  "palette": { "user": "#ff8a5b", "run": "#ffcf70", "surface": "#3a2b2b", "zebra": "#2e2424" },
  "spinner": ["Glowing", "Fading", "Drifting"],
  "done": ["Set", "Faded"]
}
```

## What makes a skin look good

- **One accent.** `user` paints the rail, the prompt marker and the spinner. Make it the colour the
  skin is about; leave everything else quieter.
- **Readable text.** `fg` and `muted` sit on the person's terminal background, which is almost always
  dark. Keep `muted` clearly readable: it carries commands, paths and timings.
- **Quiet bands.** `surface` and `zebra` are backgrounds behind table rows. Keep them one small step
  off a dark background, never bright, or tables turn into stripes.
- **A prompt box that stands out.** `border` is the outline around the person's typed prompt. Leave it
  out and the box follows `muted`, as it does in every built-in skin; set it when they want the box
  to read as part of the look without brightening `muted`, which also paints commands and paths.
- **Kinds told apart.** `read`, `write`, `run`, `search`, `web` and `mcp` colour tool names. Give the
  common ones (`run`, `write`, `read`) clearly different hues.
- **Status stays conventional.** Keep `ok` green-ish and `err` red-ish whatever the theme.

## Other actions

- `{"action": "apply", "name": "nord"}` switches skins.
- `{"action": "delete", "name": "sunset"}` removes a made skin.
- `{"action": "settings", "settings": {"rail": false, "shimmer": true, "tables": true, "clip": false, "icons": "ascii"}}`
  switches the parts on and off. `icons: "ascii"` helps terminals whose font lacks the glyphs.
