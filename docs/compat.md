# Compatibility and performance

What skins 0.4.0 has been checked on, and how fast it draws. Only what was actually run is
marked as verified; everything else says so.

## Surface × OS

| Surface | Windows | macOS | Linux |
|---|---|---|---|
| Terminal | **Verified at 0.3.0** by the author: 120 engine tests, manual use | Untested | **Verified at 0.4.0**: 129 engine tests, benchmark below, Claude Code 2.1.288 |
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

**Tested with:** Claude Code 2.1.288 on Linux, 2026-10-10. The README badge's minimum, 2.1.287,
is the version 0.3.0 was built against.

## Performance

Run with `scripts/bench.sh`. It mounts each row through `$.ui.mount` in the test host, so
a time covers the skin's hook, the engine's check of the tree it returns and the test host's
drawing. It does not cover the terminal's or the desktop app's own paint.

**Machine:** AMD Ryzen 5 5500 (12 threads), 16 GB RAM, NixOS 26.05, Linux 6.18.54,
Claude Code 2.1.288. One run, 2026-10-10.

### Per row type

100 mounts per row after 10 to warm up. The `desktop` rows are the desktop surface drawn by the
test host on Linux.

| Row | Surface | Median ms | p95 ms | Mean ms |
|---|---|---:|---:|---:|
| tool row (Bash) | terminal | 1.40 | 2.23 | 1.49 |
| tool row (Bash) | desktop | 1.21 | 2.03 | 1.38 |
| text (markdown) | terminal | 1.50 | 2.20 | 1.60 |
| text (markdown) | desktop | 0.84 | 1.50 | 0.95 |
| table (6 rows) | terminal | 1.94 | 3.82 | 2.13 |
| table (6 rows) | desktop | 1.37 | 2.25 | 1.46 |
| code (20 lines) | terminal | 0.72 | 1.11 | 0.78 |
| code (20 lines) | desktop | 2.27 | 4.26 | 2.50 |
| math (display) | terminal | 1.16 | 2.07 | 1.32 |
| math (display) | desktop | 1.34 | 2.30 | 1.44 |
| mermaid (flowchart) | terminal | 2.31 | 5.00 | 2.65 |
| mermaid (flowchart) | desktop | 0.95 | 1.72 | 1.09 |
| diff (Edit result) | terminal | 0.80 | 1.38 | 0.90 |
| diff (Edit result) | desktop | 0.84 | 1.14 | 0.91 |
| shell (61 lines) | terminal | 0.95 | 1.43 | 1.06 |
| shell (61 lines) | desktop | 0.77 | 1.23 | 0.85 |

Code and diffs on the terminal are Claude Code's own drawing (see Known limitations in the
README), so those two rows time the skin handing the row back.

### Long transcripts

The eight row types above in turn, each row mounted and unmounted. The skin `off` rows are the
same transcript with `/skin off`: the cost of the harness and Claude Code's stand-in alone.

| Transcript | Surface | Skin | Total s | ms per row |
|---|---|---|---:|---:|
| 1,000 mixed rows | terminal | noir | 2.40 | 2.40 |
| 1,000 mixed rows | desktop | noir | 2.21 | 2.21 |
| 5,000 mixed rows | terminal | noir | 9.82 | 1.96 |
| 5,000 mixed rows | desktop | noir | 8.87 | 1.77 |
| 1,000 mixed rows | terminal | off | 1.55 | 1.55 |
| 1,000 mixed rows | desktop | off | 1.49 | 1.49 |
| 5,000 mixed rows | terminal | off | 7.25 | 1.45 |
| 5,000 mixed rows | desktop | off | 7.14 | 1.43 |

With the skin on, a row costs about 0.3 to 0.9 ms more than with it off.

**Fixed while measuring.** The first run had the desktop code card at 23.0 ms median and the
5,000-row desktop transcript at 20.7 s. Cutting a card's text to width was quadratic
(`fitText` in [`hooks/svg-kit.ts`](../hooks/svg-kit.ts)); it is now one pass, and the numbers
above are after the fix.
