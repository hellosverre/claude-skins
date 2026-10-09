# Roadmap

What comes after 0.5.0, roughly in order. Most items close a gap against the other
transcript mods (see "Compared with" in the README), read from their READMEs on 2026-10-10.
Open an issue to vote for an item or to ask for one that is missing.

## Next

| Item | Why | Gap against |
|---|---|---|
| **Clickable file paths** | Paths in prose and tool rows are coloured but cannot be opened: the engine's `Link` takes only `https:`. Try a pressable path that opens the file through the OS, or `file:` links inside `Markdown` | glint opens a clicked path; Prismantis links paths |
| **Desktop folding for table cards** | Long tables on the desktop keep their full height; code cards already fold | glint folds tables |
| **Right-to-left text** | Hebrew and Arabic read left to right today | Prismantis, glint |
| **Copy a table as HTML** | Pastes as a real table in mail and docs | Prismantis |
| **Copy a diagram as drawn** | The terminal's drawing for chat and tickets; today only the source is copied | Prismantis (`⧉ art`) |
| **A link band** | The last reply's links and files above the prompt, one press each | glint |

## Later

| Item | Why |
|---|---|
| **Sequence, state, class and ER diagrams on the desktop** | They draw on the terminal only; the desktop shows a code card |
| **Typeset math as an image in kitty and Ghostty** | Sharper than stacked cells where the terminal draws pictures |
| **Table and heading styles** | A choice of rules, grid or minimal tables and heading looks, set per skin |
| **`/skin demo`** | Every element in one reply, to try a skin on real content (the gallery shows the parts, not a reply) |
| **Hand-checked macOS, VS Code and mobile** | The compat matrix marks them untested; CI covers the engine tests on macOS only |
| **A highlighter for more languages** | Kotlin, Swift, Ruby, PHP, Dockerfile and HCL are plain on the terminal today |

## Done in 0.5.0

Tool rows open onto their input and answer, PowerShell treated as a shell everywhere, terminal
syntax highlighting, coloured shell output, OSC 8 links, this turn's files in colour, copy as
drawn and `copy reply`, folding, diff fences, side by side, `$.skins.markdown`, and CI on three
systems.
