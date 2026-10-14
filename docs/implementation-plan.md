# Complete contribution arcade collection

The deliverable is nineteen distinct, polished, contribution-driven SVG scenes on one collection homepage. Breakout remains intact. Growing Snake must grow gradually (one segment per five consumed dates, capped at sixteen) and consume exact contribution counts in nondecreasing order, with planned adjacent movement and no self-collision.

## Scope and acceptance

| Number | Scene | Required behavior |
| --- | --- | --- |
| 01 | Breakout | Preserve existing collision physics and progressive multiball |
| 02 | Growing Snake | Plan routes, eat lower counts first, grow gradually to a compact length cap, avoid the body |
| 03 | Pac-Man | Eat contribution pellets, animate a mouth and pursuing ghosts; streak affects pace |
| 04 | Tetris | Drop legal tetrominoes, collide with stacks, complete and clear rows |
| 05 | Garden | Activity controls plant growth and flowering; seasonal changes |
| 06 | City | Weekly activity controls skyline height and building development |
| 07 | Space Invaders | Moving invaders, ship fire, actual hits, streak-triggered boss |
| 08 | Train | Travel along weeks, stop at active stations, change seasons |
| 09 | Civilization | Accumulate actual activity into settlement and era progression; inactivity weathers the settlement |
| 10 | Archaeology | Miner excavates dates, intensity controls ore, streaks unlock treasure |
| 11 | Life | Actual Conway generations seeded by contributions |
| 12 | Ant Colony | Ants collect resources from contribution deposits and return to a nest |
| 13 | Weather | Inactive periods rain; active streaks clear skies; peaks bring a celebration |
| 14 | Dungeon | Contribution rooms, fog reveal, traversal, and a final encounter |
| 15 | Music | Weeks become beats and contribution intensity controls note heights and rhythm |
| 16 | Space Route | Weekly planets, ship travel, and contribution-powered fuel/stations |
| 17 | Town | Construction and celebrations reflect public activity; typed activity is used when available |
| 18 | Match Three | Legal adjacent swaps, runs of at least three, removal, gravity, cascades |
| 19 | Whack-a-Mole | Contribution-driven appearances, hammer timing, hits and misses, visible score |

Named variants in the reference map to these scenes: RPG maps to Dungeon and Town; music visualization and music track map to Music; archaeology variants map to Archaeology; weather variants map to Weather. Tetris was mentioned twice and is one scene. Language-based details use real public repository language weights when available, never fabricated daily language attribution.

Every scene needs deterministic semantic events, meaningful model tests, animated and static SVGs in both themes, a scene summary, actual browser playback verification, representative screenshots, and an exported animation. The collection must list all scenes and preserve independent playback, global themes, downloads, reduced motion, and mobile layout. API credentials must never enter artifacts. Code, documentation, and commits are English. Every new commit includes the requested gensokyo-dev co-author. Preparation files remain untracked and unignored.

## Work ownership and gathering contract

The coordinator owns shared interfaces, kit, registry, generation, GitHub enrichment, homepage, capture tools, documentation, commits, and final verification. Producers own only their named source module and test file. They do not stage, commit, push, or edit shared files. All producers use `SceneDefinition`, `SceneFilm`, `SceneContext`, and the shared SVG kit. They return actual models plus evidence, not placeholder themed versions of one animation.

| Packet | Owned files | Scenes | Evidence |
| --- | --- | --- | --- |
| Arcade | `src/scenes/arcade.ts`, `test/scenes-arcade.test.mjs` | Pac-Man, Tetris, Match Three, Whack-a-Mole | Collision, legal moves, clears, chases, score invariants |
| Worlds | `src/scenes/worlds.ts`, `test/scenes-worlds.test.mjs` | Garden, City, Civilization, Town | Intensity mappings, growth, eras, activity accounting |
| Journeys | `src/scenes/journeys.ts`, `test/scenes-journeys.test.mjs` | Invaders, Train, Archaeology, Dungeon, Space Route | Travel, hits, stations, excavation, reveal, fuel |
| Coordinator | Shared files and `src/scenes/patterns.ts` | Snake correction, Life, Ants, Weather, Music | Ordered meals and safe routes, generations, transport, weather and beats |

The interface is frozen before producers start. Producers may ask for a helper but cannot change the interface themselves. Each packet can advance independently with the same saved contribution calendar and context schema. The coordinator resolves conflicts, reviews evidence, and integrates in this order: shared interfaces; independent producers; registry and consumers; operational surfaces and documentation; complete rendered acceptance.

The split is retained because the three scene-family modules and their tests do not overlap and can be reviewed independently. Shared state and publishing remain centralized. Completion requires both unit evidence and rendered runtime evidence for every row above, then green GitHub CI and a verified push. Passing metadata checks alone does not establish a completed game mechanic.

## Accepted integration

All three independent producer packets were accepted after their model tests and direct Chromium probes. The coordinator integrated Patterns, ascending-count gradual Snake, public context, the complete registry, generation, gallery controls, daily refresh compatibility, documentation, and preview tooling.

The integrated local acceptance run on 2026-10-14 passed 63 model tests, generated 76 valid SVGs, rendered all nineteen scenes in both themes, verified animation-free static exports and reduced motion, and observed all nineteen SVGs animating inside real image elements. Gallery category counts, expansion, independent pause/replay, theme changes, download paths and mobile overflow passed. Full-loop GIFs and both-theme collection sheets accompany the canonical SVG exports.

The existing Breakout and its compatible outputs remain present. No preparation/reference files are part of the tracked deliverable. Remaining operational verification is the normal remote CI and scheduled-refresh run after pushing this release.
