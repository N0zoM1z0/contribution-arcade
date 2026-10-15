# Scene mechanics and evidence

Every board is a deterministic, precomputed performance over a real contribution calendar. The homepage controls playback of those SVG performances. Generated summaries expose the events behind each visible transition; no runtime script is embedded in an SVG.

## Fixed calendar geometry

All nineteen scenes share one permanent calendar mesh derived directly from the input dates. The mesh has exactly one tile per actual day, including zero-count dates. A partial week or absent date never becomes synthetic food or an extra cell. Columns remain weeks and rows remain weekdays in chronological order. The same layout applies to both themes, static exports and reduced-motion views.

Food, moles, ore and rooms use those original coordinates. Target selection changes an actor's itinerary rather than rearranging the calendar. Tetris overlays legal pieces on this mesh and marks missing date slots unavailable. Matching begins with actual date gems in their original slots; movement afterwards is visible game play. Landscape and narrative artwork sits below the graph rather than replacing or covering its dates.

Tests compare every scene's actual SVG tile coordinates and counts against the source calendar, including zero days, missing dates and narrow histories. Browser checks repeat that contract on rendered SVG documents.

## Ordering and growth

Growing Snake consumes exact positive daily counts in nondecreasing order. Equal GitHub quartile colors do not imply equal counts. The next edible tier is highlighted; future tiers are dormant traversable floor. The planner selects a short reachable meal, simulates growth, checks escape space, and takes safe side steps when the tail has to unwind. It never skips a smaller remaining count to eat a larger one.

Growth is intentionally restrained: start at four segments, gain one per five meals, and cap at sixteen. Narrow boards reserve a smaller safe cap. All actual active dates still count as meals after the length cap. Movement remains adjacent and every disappearance coincides with the head reaching that date. A moving stroke window follows the planned trail without drawing hundreds of separate body elements.

Pac-Man, Invaders, Archaeology, Dungeon and Ant Colony also order daily food or targets by exact count while keeping every date in place. Tetris progresses through ascending daily sources on the original date mesh; Whack-a-Mole visits ascending daily totals at original date slots. Match Three retains genuine matching and gravity rules with a finite pool of real date gems. Calendar narratives such as seasons, construction and station travel follow chronological weeks or dates.

## The nineteen models

| Scene | Actual input and visible mechanism | Model verification |
| --- | --- | --- |
| Breakout | Date-positioned bricks; level-based durability; swept impacts; streak-unlocked multiball | Fast thin-brick collision, hit durability, dense histories, bounded duration |
| Growing Snake | Exact-count meal tiers; adjacent body-aware routes; gradual length milestones | Ascending values within one color, unique dates, no self-collision, narrow/full boards, occupied-tail growth regression |
| Pac-Man | Each real active date becomes one ordered pellet at their original week and weekday positions; mouth and three delayed pursuers | Adjacent path, exact pellet contact, conserved counts, real streak pace and ghost delay |
| Tetris | One source piece per active date; all seven legal tetromino types; legal rotations and hard drops; row removal and compaction | Shape connectivity, wall/floor/stack collision, legal drop path, simultaneous clears, block conservation |
| Garden | One plant per active date; exact count controls height/leaves/flowering; actual months change seasons | Conserved growth, bounded size, seasonal dates, aggregate observed language blend |
| City | Active weeks become skyline lots; totals scale height; foundations, frames and completed buildings appear in order | Empty lots remain empty, height ordering, legal construction stages, total conservation |
| Space Invaders | The selected target dives below the fleet for a clear interception; ship aims and fires; impact removes it; real streak unlocks boss | Projectile endpoints and obstruction checks, unique sorted hits, genuine streak evidence |
| Train | Every week is a rail point; active weeks have stations and dwell time; actual months change the scenery | Exact stops, chronological arrival/departure, actual season boundaries |
| Civilization | Fixed cumulative resource thresholds unlock camp, hamlet, village and later eras; observed inactivity weathers existing development | Threshold boundaries, resource conservation, inactivity/gap semantics, repair, empty settlement |
| Archaeology | Count-ordered date ore in vertical shafts; miner follows tunnels; ore tier follows count; excavating a real streak unlocks treasure | Miner/date contact, orthogonal route, exact ore totals, tier thresholds and treasure prerequisites |
| Game of Life | Active dates seed the actual calendar tile mask; every generation uses Conway B3/S23 | Block stability, blinker oscillation, isolated death, empty-world invariance |
| Ant Colony | Three workers harvest ascending-count deposits and carry each resource home; stored total changes on arrival | Unique harvests, sorted pickups, non-overlapping trips per worker, deposit accounting |
| Weather Report | Quiet weeks rain; active streaks clear the sky; new positive weekly records celebrate | Weekly totals, record boundaries, missing-date streak breaks, inactive calendars |
| Dungeon | Hero follows adjacent graph edges; local neighbors reveal fog; active rooms provide exact loot; collected loot funds a final encounter | Adjacent traversal, local reveals, unique loot, actual encounter timing and damage budget |
| Year in Rhythm | Each week is a beat; total controls pitch/strength; active days add notes; quiet weeks remain rests | Every week and active date retained, contribution conservation, silent score semantics |
| Space Route | Weekly planets; launch from a real station; activity adds fuel; each jump between active stations costs one unit | Nonnegative fuel, exact refuels, paid jumps, planet arrival coordinates, empty/no-fuel histories |
| Town | Cumulative thresholds build up to 24 homes and six lanes; genuine streaks/high weeks earn festivals; public types shape civic buildings | Funded construction, bounded lots, real festival triggers, truthful sampled context/fallback |
| Match Three | All actual active dates start at their original graph slots; natural opening runs, legal adjacent swaps, masked gravity and cascades use only those gems | Legal swaps, crossing runs, survivor order, masked gravity, no invented gems, score/remaining conservation |
| Whack-a-Mole | One pop-up per active date at its original calendar position; activity shortens exposure; travel and real streak affect reaction; only timely strikes score | Hammer window boundary, hits and misses, streak counterfactual, exact daily score accounting |

The models deliberately retain their own rules. A Tetris row clears only when all actual date slots in that row are full; missing slots are unavailable. A matching board can finish with unmatched dates and no remaining legal move. A late hammer strike misses. An empty calendar cannot manufacture resources, plants, targets or a space launch.

Visual scales are bounded for readable artwork. Town has 24 housing lots, the skyline caps visual height, and Snake caps body length. Summaries retain the underlying counts. Northern hemisphere seasons are a visual convention derived from actual calendar months. Language planting is an aggregate observed repository blend, never a claim about a particular day's language.

## Verification surfaces

- [Shared calendar layout and routing tests](../test/calendar-layout.test.mjs)
- [Calendar and Breakout tests](../test/arcade.test.mjs)
- [Snake ordering, movement and growth tests](../test/snake.test.mjs)
- [Pac-Man, Tetris, Match Three and Mole tests](../test/scenes-arcade.test.mjs)
- [World model tests](../test/scenes-worlds.test.mjs)
- [Journey model tests](../test/scenes-journeys.test.mjs)
- [Conway, ants, weather and score tests](../test/scenes-patterns.test.mjs)
- [Public context filtering test](../test/context.test.mjs)
- [Complete Chromium gallery and embedding checks](../scripts/capture.mjs)
- [Full-loop GIF exporter](../scripts/export-gifs.mjs)

`npm run capture` renders every scene in both themes, compares meaningful runtime checkpoints, verifies both animation-free static exports and reduced motion, and checks real animated image embedding. It also exercises the complete homepage: all nineteen headings, category filters, original full-width graphs, independent pause/replay states, theme switching, downloads and mobile overflow. Offscreen SVGs pause to limit rendering work without changing the viewer's explicit playback settings.

Canonical animations and model logs are in `generated/`. Both-theme screenshots, collection sheets and full-loop GIFs are in `previews/`. Scheduled updates refresh generated assets; preview media are snapshots of the release calendar.
