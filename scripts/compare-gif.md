# Recording the before/after GIF

The README's comparison is one prompt answered twice in the same session, first with
Claude Code's own drawing (`/skin off`), then with the skin. Same model, same prompt, same
window size. Only the drawing changes. These steps record each half with
[VHS](https://github.com/charmbracelet/vhs) and put the two halves side by side with ffmpeg.

## 1. Tools

```bash
go install github.com/charmbracelet/vhs@latest
```

VHS needs `ttyd` and `ffmpeg` on the `PATH` (`brew install ttyd ffmpeg`, `nix-shell -p ttyd ffmpeg`,
or `winget install ttyd ffmpeg`).

## 2. A clean folder

```bash
mkdir -p /tmp/skins-demo && cd /tmp/skins-demo && git init -q
```

```bash
printf 'export function limit(used: number, max: number) {\n  return used < max\n}\n' > limit.ts
```

## 3. The prompt

The same text in both halves. It exercises a tool row (Read), an edit, a shell command, a table,
a chart and a diff:

```text
Read limit.ts, change limit so it allows used == max, run `node --version`, then answer with a
table of the three files you would test next, an xychart-beta bar chart of how often each is
edited (make up numbers), and the change as a ```diff fence.
```

## 4. The tape

Save as `/tmp/skins-demo/half.tape`. `SKIN` is `off` for the stock half and `noir` for the
skinned one.

```text
Output half.gif
Set Shell bash
Set FontSize 15
Set Width 1100
Set Height 900
Set Theme "Builtin Dark"
Set TypingSpeed 25ms

Hide
Type "cd /tmp/skins-demo && git checkout -q -- limit.ts && claude"
Enter
Sleep 4s
Type "/skin $SKIN"
Enter
Sleep 1s
Show

Type "Read limit.ts, change limit so it allows used == max, run `node --version`, then answer with a table of the three files you would test next, an xychart-beta bar chart of how often each is edited (make up numbers), and the change as a ```diff fence."
Enter
Sleep 60s
```

VHS does not expand `$SKIN`. Make one copy per half:

```bash
sed 's/\$SKIN/off/; s/half.gif/stock.gif/' half.tape > stock.tape
```

```bash
sed 's/\$SKIN/noir/; s/half.gif/skinned.gif/' half.tape > skinned.tape
```

## 5. Record

Each run sends the prompt to the model once, on your account.

```bash
vhs stock.tape
```

```bash
vhs skinned.tape
```

If a reply is still streaming when the tape ends, raise the last `Sleep` and record that half again.

## 6. Side by side

```bash
ffmpeg -i stock.gif -i skinned.gif -filter_complex "[0][1]hstack=inputs=2,split[a][b];[a]palettegen[p];[b][p]paletteuse" compare.gif
```

Check that both halves end on the turn's footer, then copy it into the repo:

```bash
cp compare.gif ~/Projects/claude-skins/docs/compare.gif
```

## 7. The README line

Under the demo GIF in `README.md`:

```markdown
<img alt="The same prompt in Claude Code without skins (left) and with the noir skin (right)" src="docs/compare.gif">
```

## The desktop app

VHS records terminals only. For the desktop app's Code tab, use the OS screen recorder on
the same prompt (macOS: Cmd+Shift+5; Windows: Win+Alt+R with Game Bar, or ShareX). Record
`/skin off`, then `/skin noir`, crop both to the transcript column, then run the same ffmpeg
line on the two clips.
