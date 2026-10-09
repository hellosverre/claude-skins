# Compatibility and performance

What skins 0.5.0 has been checked on, and how fast it draws. Only what was actually run is
marked as verified; everything else says so.

## Surface × OS

| Surface | Windows | macOS | Linux |
|---|---|---|---|
| Terminal | **Verified at 0.3.0** by the author: 120 engine tests, manual use. CI from 0.5.0: engine tests, validate, tsc | CI from 0.5.0: engine tests, validate, tsc; never looked at | **Verified at 0.5.0**: 168 engine tests, benchmark below, Claude Code 2.1.288 |
| Desktop app (Code tab) | **Verified at 0.3.0** by the author: manual use | Untested | No desktop app on Linux; the desktop path runs in the engine tests and the benchmark only |
| VS Code | Untested | Untested | Untested |
| Mobile | Untested | Untested | Untested |

**VS Code and mobile have no path of their own.** Both surfaces offer `Svg`, so they take the
same branch as the desktop app: vector cards, icon rows, the desktop spinner
(`lookOf` in [`hooks/register.tsx`](../hooks/register.tsx)). Nothing has checked how they look
there. The settings pane does not open on mobile, which has no `Input`; it says to use the
terminal or the desktop app instead.

The tests run in Claude Code's own test host (`claude plugin test .`), which draws each surface's
element tree but not a real terminal or window. A test passing on Linux for the `desktop` surface
means the tree is right, not that the desktop app was looked at.

**Tested with:** Claude Code 2.1.288 on Linux, 2026-10-10 (0.4.0 and 0.5.0). [CI](../.github/workflows/ci.yml) runs the engine tests, `claude plugin validate` and the type check on Linux, Windows and macOS on every push to main. A CI pass is not a hand check: it is marked as CI above. The README badge's minimum, 2.1.287,
is the version 0.3.0 was built against.

## Performance

Run with `scripts/bench.sh`. It mounts each row through `$.ui.mount` in the test host, so
a time covers the skin's hook, the engine's check of the tree it returns and the test host's
drawing. It does not cover the terminal's or the desktop app's own paint.

**Machine:** AMD Ryzen 5 5500 (12 threads), 16 GB RAM, NixOS 26.05, Linux 6.18.54,
Claude Code 2.1.288. One run of skins 0.5.0, 2026-10-10. The `0.4.0` column is that release's run on the same machine.

### Per row type

100 mounts per row after 10 to warm up. The `desktop` rows are the desktop surface drawn by the
test host on Linux.

| Row | Surface | Median ms | p95 ms | Mean ms | 0.4.0 median ms |
|---|---|---:|---:|---:|---:|
| tool row (Bash) | terminal | 4.54 | 9.67 | 5.23 | 1.40 |
| tool row (Bash) | desktop | 3.94 | 6.38 | 4.09 | 1.21 |
| text (markdown) | terminal | 2.84 | 4.88 | 3.01 | 1.50 |
| text (markdown) | desktop | 2.34 | 4.14 | 2.41 | 0.84 |
| table (6 rows) | terminal | 3.87 | 7.23 | 4.26 | 1.94 |
| table (6 rows) | desktop | 2.38 | 3.62 | 2.51 | 1.37 |
| code (20 lines) | terminal | 3.98 | 6.94 | 4.38 | 0.72 |
| code (20 lines) | desktop | 2.77 | 4.87 | 3.01 | 2.27 |
| math (display) | terminal | 1.14 | 1.78 | 1.23 | 1.16 |
| math (display) | desktop | 1.35 | 2.00 | 1.44 | 1.34 |
| mermaid (flowchart) | terminal | 2.71 | 5.29 | 3.02 | 2.31 |
| mermaid (flowchart) | desktop | 1.02 | 1.48 | 1.08 | 0.95 |
| diff (Edit result) | terminal | 0.81 | 1.02 | 0.84 | 0.80 |
| diff (Edit result) | desktop | 0.97 | 1.35 | 1.02 | 0.84 |
| shell (61 lines) | terminal | 2.12 | 4.17 | 2.35 | 0.95 |
| shell (61 lines) | desktop | 1.15 | 1.93 | 1.23 | 0.77 |

**Why 0.5.0 is slower per row.** The terminal now draws code itself, highlighted, where 0.4.0
handed it back (code: 0.72 → 3.98 ms). Shell output is coloured span by span. Each tool row
carries its `▸` control and reads its open state. Replies read this turn's files and their
fold state when they have something to show with them. Session facts that every row used to
ask for (the folder, whether the terminal draws links) are now read once a turn
(`sessionLook` and `cwdOf` in [`hooks/register.tsx`](../hooks/register.tsx)). That took the
terminal text row from 4.10 to 2.84 ms and the tool row from 5.57 to 4.54 ms in the runs made
while fixing it. Edit diffs on the terminal are still Claude Code's own drawing, so that row
times the skin handing the row back.

Runs on this machine vary: re-running 0.4.0's own code tonight gave the terminal tool row 2.15
to 2.37 ms, not the 1.40 ms recorded at its release. The 0.4.0 column is that release's number
as published, so part of each gap is the machine, not the change.

### Long transcripts

The eight row types above in turn, each row mounted and unmounted. The skin `off` rows are the
same transcript with `/skin off`: the cost of the harness and Claude Code's stand-in alone.

| Transcript | Surface | Skin | Total s | ms per row |
|---|---|---|---:|---:|
| 1,000 mixed rows | terminal | noir | 3.08 | 3.08 |
| 1,000 mixed rows | desktop | noir | 2.18 | 2.18 |
| 5,000 mixed rows | terminal | noir | 12.19 | 2.44 |
| 5,000 mixed rows | desktop | noir | 9.38 | 1.88 |
| 1,000 mixed rows | terminal | off | 1.52 | 1.52 |
| 1,000 mixed rows | desktop | off | 1.49 | 1.49 |
| 5,000 mixed rows | terminal | off | 7.24 | 1.45 |
| 5,000 mixed rows | desktop | off | 7.16 | 1.43 |

With the skin on, a row costs about 0.4 to 1.5 ms more than with it off (0.3 to 0.9 ms at 0.4.0).

**Fixed while measuring.** The first run had the desktop code card at 23.0 ms median and the
5,000-row desktop transcript at 20.7 s. Cutting a card's text to width was quadratic
(`fitText` in [`hooks/svg-kit.ts`](../hooks/svg-kit.ts)); it is now one pass, and the numbers
above are after the fix.
