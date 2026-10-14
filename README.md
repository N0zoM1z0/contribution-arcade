# Contribution Arcade

A little arcade, made from a year of GitHub contributions.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="generated/breakout-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="generated/breakout-light.svg">
  <img src="generated/breakout-light.svg" alt="N0zoM1z0's GitHub contribution calendar playing itself as a breakout game" width="1120">
</picture>

**Your commits. Your game.** Each date keeps its place in the calendar. Active days become bricks, stronger contribution levels take more hits, and a long streak unlocks multiball. The original calendar returns at the start of every loop.

[Watch the animated GIF](previews/breakout.gif) · [Midnight preview](previews/preview-dark.png) · [Paper preview](previews/preview-light.png) · [Mobile preview](previews/preview-mobile.png)

## Run locally

Requires Node.js 20 or later.

```bash
npm ci
npm run generate -- --username N0zoM1z0
npm run preview
```

Open **http://localhost:4173**. Switch between Midnight and Paper, pause the animation, or replay it. Space toggles playback when the page itself has focus.

The generator reads `GH_TOKEN` or `GITHUB_TOKEN`. If neither is set, it uses an existing `gh auth login` session. Tokens are used only for the API request and are never written to the output.

To reproduce the checked-in example without a token or network request:

```bash
npm run generate -- --input generated/calendar.json
```

Optional arguments:

```bash
npm run generate -- --username YOUR_USERNAME --output generated --seed my-arcade
```

## Add it to your GitHub profile

The example assets are generated from **N0zoM1z0**. Add this to a profile README to display them:

```html
<picture>
  <source
    media="(prefers-color-scheme: dark)"
    srcset="https://raw.githubusercontent.com/N0zoM1z0/contribution-arcade/main/generated/breakout-dark.svg"
  >
  <source
    media="(prefers-color-scheme: light)"
    srcset="https://raw.githubusercontent.com/N0zoM1z0/contribution-arcade/main/generated/breakout-light.svg"
  >
  <img
    src="https://raw.githubusercontent.com/N0zoM1z0/contribution-arcade/main/generated/breakout-light.svg"
    alt="My GitHub contributions, reimagined as a breakout game"
    width="100%"
  >
</picture>
```

The SVGs play automatically, contain no JavaScript, and switch to the original calendar for visitors who prefer reduced motion. Static SVGs are also generated for use in places that do not support animation.

## Update automatically

This repository includes a [daily update workflow](.github/workflows/update.yml). It fetches the latest calendar at 03:23 UTC, regenerates `generated/`, and commits changed assets. It can also be run manually from the Actions tab. GitHub may delay scheduled runs.

The generator is available as a reusable composite action:

```yaml
- uses: N0zoM1z0/contribution-arcade@main
  with:
    github_username: ${{ github.repository_owner }}
    output_path: generated
```

| Input | Default | Purpose |
| --- | --- | --- |
| `github_username` | Repository owner | Account whose contribution calendar becomes the level |
| `github_token` | Workflow token | Token used to read the calendar |
| `output_path` | `generated` | Output directory relative to the workflow workspace |
| `seed` | Account name | Reproducible auto-player variations |

The action generates files; the calling workflow chooses how to publish them. Use the included workflow to commit them to a repository, or upload them as build artifacts. Pin the action to a commit when you want a fixed version.

## Generated files

| File | Contents |
| --- | --- |
| `breakout-dark.svg` | Animated Midnight scene |
| `breakout-light.svg` | Animated Paper scene |
| `breakout-dark-static.svg` | Still Midnight calendar |
| `breakout-light-static.svg` | Still Paper calendar |
| `calendar.json` | Saved input for offline reproduction |
| `summary.json` | Contributions, active days, streak, loop duration, hits, and cleared bricks |

Contribution totals include the activity visible to the supplied token and follow GitHub's profile settings. They are contribution totals, rather than commit counts alone.

## How it works

1. **Calendar:** read GitHub's GraphQL contribution calendar, preserving actual weekday coordinates and partial weeks.
2. **Scene:** simulate an automatic breakout game at a fixed timestep. Swept collisions prevent fast balls from skipping bricks. Levels 1–2 take one hit; levels 3–4 take two. More than 100 active days and a streak of at least seven days unlock two extra balls after six seconds.
3. **SVG:** turn collision vertices, hit events, and paddle positions into a script-free animation. The same scene supplies both color themes.

The simulation is deterministic for the same calendar and seed. Loops last roughly 12–41 seconds, including the opening and closing pause. Difficult calendars may restart before every brick is cleared; `summary.json` records the actual result.

## Verify and capture

```bash
npm test
npx playwright install chromium
npm run capture
```

Tests cover partial weeks, streak gaps, input validation, empty histories, fast collisions, durability, deterministic dense calendars, safe SVG output, and API failures. Browser checks verify real motion, both themes, pause, replay, mobile overflow, README image embedding, and reduced motion. The [CI workflow](.github/workflows/ci.yml) runs both suites and uploads preview artifacts.

To export an animated GIF, install FFmpeg and run:

```bash
node scripts/capture.mjs --frames
ffmpeg -framerate 12 -i previews/frames/%04d.png \
  -filter_complex '[0:v]scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=3' \
  -loop 0 -y previews/breakout.gif
```

## Acknowledgments

Inspired by [Platane/snk](https://github.com/Platane/snk), [cyprieng/github-breakout](https://github.com/cyprieng/github-breakout), and [danbom's contribution animation](https://github.com/danbom/danbom). This implementation shares the idea of a precomputed SVG performance and implements its own calendar normalization, simulation, visual design, and renderer.
