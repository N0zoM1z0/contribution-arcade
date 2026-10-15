import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCalendar } from '../lib/calendar.js';
import { THEMES } from '../lib/scenes/kit.js';
import { worldsScenes, buildGardenModel, buildCityModel, buildCivilizationModel, buildTownModel, CIVILIZATION_ERAS } from '../lib/scenes/worlds.js';

function fixture(counts, first = '2026-01-04', levels) {
  const firstStamp = Date.parse(`${first}T00:00:00Z`);
  const weeks = [];
  for (const [index, contributionCount] of counts.entries()) {
    const date = new Date(firstStamp + index * 86_400_000).toISOString().slice(0, 10);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (!weeks.length || weekday === 0) weeks.push({ firstDay: date, contributionDays: [] });
    const level = levels?.[index] ?? (contributionCount === 0 ? 0 : Math.min(4, Math.ceil(Math.log2(1 + contributionCount))));
    weeks.at(-1).contributionDays.push({ date, weekday, contributionCount, contributionLevel: ['NONE', 'FIRST_QUARTILE', 'SECOND_QUARTILE', 'THIRD_QUARTILE', 'FOURTH_QUARTILE'][level] });
  }
  return normalizeCalendar({ login: 'worlds-test', calendar: { totalContributions: 0, weeks } });
}

const publicContext = {
  source: 'github-public',
  languages: [{ name: 'TypeScript', weight: 70, color: '#3178c6' }, { name: 'Rust', weight: 30, color: '#dea584' }],
  activity: { commits: 40, issues: 7, pullRequests: 12, reviews: 9 },
  coverage: 'Observed public repositories; sampled commits and primary languages.',
};

function markedElements(svg, element, marker) {
  return [...svg.matchAll(new RegExp(`<${element}\\b[^>]*\\b${marker}="[^"]+"[^>]*>`, 'g'))].map(match => Object.fromEntries([...match[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(attribute => [attribute[1], attribute[2]])));
}

function assertDateGeometry(rectangle, cell, columns) {
  const size = Math.min(14.5, 1024 / columns - 3);
  const close = (actual, expected) => assert.ok(Math.abs(Number(actual) - expected) <= 0.001, `Expected ${actual} to preserve ${expected}`);
  close(rectangle.x, 48 + (cell.column + 0.5) * 1024 / columns - size / 2);
  close(rectangle.y, 114 + cell.row * 19);
  close(rectangle.width, size);
  close(rectangle.height, size);
}

test('all world renders preserve every original day tile and exact date geometry, including zeros and missing dates', () => {
  const calendar = fixture([0, 8, 1, 0, 13, 2, 0, 4, 0, 3, 0, 9, 0, 1, 0, 7], '2026-01-07');
  const missing = calendar.cells.splice(5, 1)[0].date;
  const original = structuredClone(calendar);
  for (const scene of worldsScenes) {
    const film = scene.build(calendar, publicContext);
    for (const theme of ['dark', 'light']) {
      for (const animated of [true, false]) {
        const svg = film.render(theme, animated);
        const tiles = markedElements(svg, 'rect', 'data-cell-date');
        assert.equal(tiles.length, calendar.cells.length, `${scene.id} must have exactly one permanent tile per recorded date`);
        assert.deepEqual(tiles.map(tile => tile['data-cell-date']), calendar.cells.map(cell => cell.date));
        assert.ok(!tiles.some(tile => tile['data-cell-date'] === missing));
        for (const [index, cell] of calendar.cells.entries()) {
          const tile = tiles[index];
          assert.equal(Number(tile['data-column']), cell.column);
          assert.equal(Number(tile['data-row']), cell.row);
          assert.equal(Number(tile['data-count']), cell.count);
          assert.equal(tile.fill, THEMES[theme].empty);
          assertDateGeometry(tile, cell, calendar.columns);
        }
        const activeMarks = markedElements(svg, 'rect', 'data-activity-date');
        assert.equal(activeMarks.length, calendar.cells.filter(cell => cell.count > 0).length * (animated ? 2 : 1));
        for (const mark of activeMarks) {
          const cell = calendar.cells.find(item => item.date === mark['data-activity-date']);
          assert.ok(cell && cell.count > 0);
          assertDateGeometry(mark, cell, calendar.columns);
          assert.equal(mark.fill, THEMES[theme].colors[cell.level]);
        }
        assert.match(svg, new RegExp(`data-world-ribbon="${scene.id}" clip-path="url\\(#${scene.id}-ribbon-`));
        assert.match(svg, /<clipPath[^>]*><rect x="48" y="270" width="1024" height="90"\/>/);
      }
    }
  }
  assert.deepEqual(calendar, original);
});

test('garden plant actors remain anchored to exact original day centers and never occupy zero or missing days', () => {
  const calendar = fixture([0, 16, 1, 9, 0, 3, 0, 5, 0, 2]);
  calendar.cells.splice(3, 1);
  const svg = worldsScenes[0].build(calendar).render('dark', false);
  const plants = markedElements(svg, 'g', 'data-plant-date');
  assert.equal(plants.length, calendar.cells.filter(cell => cell.count > 0).length);
  for (const plant of plants) {
    const cell = calendar.cells.find(item => item.date === plant['data-plant-date']);
    assert.ok(cell && cell.count > 0);
    assert.equal(Number(plant['data-count']), cell.count);
    const [x, y] = plant.transform.match(/[\d.]+/g).map(Number);
    assert.ok(Math.abs(x - (48 + (cell.column + 0.5) * 1024 / calendar.columns)) <= 0.001);
    assert.equal(y, 114 + cell.row * 19 + 7.25);
  }
});

test('world builders and all theme/static renders accept immutable calendars and real context without mutation', () => {
  const calendar = fixture([0, 8, 1, 0, 13, 2, 0, 4, 0, 3, 0, 9, 0, 1]);
  const context = structuredClone(publicContext);
  const originalCalendar = structuredClone(calendar);
  const originalContext = structuredClone(context);
  const freeze = value => {
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  };
  freeze(calendar); freeze(context);
  for (const scene of worldsScenes) {
    const film = scene.build(calendar, context);
    for (const theme of ['dark', 'light']) for (const animated of [false, true]) assert.ok(film.render(theme, animated).length > 0);
  }
  assert.deepEqual(calendar, originalCalendar);
  assert.deepEqual(context, originalContext);
});

test('world definitions are four independent numbered worlds', () => {
  assert.deepEqual(worldsScenes.map(scene => [scene.id, scene.number, scene.category]), [
    ['garden', '05', 'Worlds'], ['city', '06', 'Worlds'], ['civilization', '09', 'Worlds'], ['town', '17', 'Worlds'],
  ]);
});

test('garden grows exactly one plant per active date, conserving counts and actual count growth', () => {
  const calendar = fixture([0, 1, 4, 5, 16, 0], '2026-03-01', [0, 1, 1, 1, 1, 0]);
  const model = buildGardenModel(calendar);
  assert.equal(model.plants.length, 4);
  assert.equal(model.contributions, 26);
  assert.deepEqual(model.plants.map(plant => plant.count), [1, 4, 5, 16]);
  assert.deepEqual(model.plants.map(plant => plant.flower), [false, false, true, true]);
  assert.equal(model.flowers, 2);
  for (let index = 1; index < model.plants.length; index++) assert.ok(model.plants[index].height > model.plants[index - 1].height);
  assert.equal(model.events.filter(event => event.type === 'seed').reduce((total, event) => total + event.value, 0), calendar.total);
  for (const plant of model.plants) {
    assert.ok(plant.height > 0 && plant.height <= 26);
    assert.ok(plant.leaves >= 1 && plant.leaves <= 4);
    assert.ok(plant.grown > plant.planted && plant.grown < model.duration);
  }
});

test('garden seasons follow recorded calendar months and tolerate partial years', () => {
  const model = buildGardenModel(fixture(Array(364).fill(1)));
  assert.deepEqual(model.seasons.map(item => item.season), ['Winter', 'Spring', 'Summer', 'Autumn', 'Winter']);
  assert.deepEqual(model.seasons.slice(1).map(item => item.date.slice(5)), ['03-01', '06-01', '09-01', '12-01']);
  assert.deepEqual(buildGardenModel(fixture([0, 1], '2026-10-14')).seasons.map(item => item.season), ['Autumn']);
});

test('language-informed planting uses aggregate real context without changing daily growth evidence', () => {
  const calendar = fixture([1, 5, 8, 3, 12, 2, 0]);
  const plain = buildGardenModel(calendar);
  const enriched = buildGardenModel(calendar, publicContext);
  assert.deepEqual(enriched.events, plain.events);
  assert.deepEqual(enriched.planting.map(item => [item.name, item.weight]), [['TypeScript', 0.7], ['Rust', 0.3]]);
  assert.equal(enriched.plants.reduce((total, plant) => total + plant.count, 0), calendar.total);
  assert.ok(enriched.events.every(event => !('language' in (event.data || {}))));
  assert.equal(buildGardenModel(calendar, { ...publicContext, source: 'calendar-only' }).planting.length, 0);
  const sanitized = buildGardenModel(calendar, { source: 'github-public', languages: [{ name: 'ignored', weight: NaN, color: '' }, { name: 'zero', weight: 0, color: '' }] });
  assert.equal(sanitized.planting.length, 0);
});

test('city conserves weekly activity, leaves quiet lots empty, and develops legal stages', () => {
  const counts = Array(28).fill(0);
  counts[0] = 1; counts[7] = 4; counts[21] = 9;
  const calendar = fixture(counts);
  const model = buildCityModel(calendar);
  assert.deepEqual(model.weeklyCounts, [1, 4, 0, 9]);
  assert.deepEqual(model.buildings.map(building => [building.column, building.count]), [[0, 1], [1, 4], [3, 9]]);
  assert.equal(model.buildings.reduce((total, building) => total + building.count, 0), calendar.total);
  assert.equal(model.contributions, calendar.total);
  assert.ok(model.buildings[0].height < model.buildings[1].height);
  assert.ok(model.buildings[1].height < model.buildings[2].height);
  for (const building of model.buildings) {
    assert.ok(building.founded < building.framed && building.framed < building.completed);
    assert.ok(building.completed < model.duration);
    assert.ok(building.height >= 13 && building.height <= 171);
    assert.ok(building.floors >= 1);
    assert.equal(model.events.filter(event => event.data.column === building.column).length, 3);
  }
});

test('civilization uses fixed resource thresholds rather than forcing every year through all eras', () => {
  assert.equal(buildCivilizationModel(fixture([0])).era, 0);
  assert.equal(buildCivilizationModel(fixture([1])).era, 1);
  assert.equal(buildCivilizationModel(fixture([34])).era, 1);
  assert.equal(buildCivilizationModel(fixture([35])).era, 2);
  assert.equal(buildCivilizationModel(fixture([139])).era, 2);
  assert.equal(buildCivilizationModel(fixture([140])).era, 3);
  const rich = buildCivilizationModel(fixture([2300]));
  assert.equal(rich.era, 6);
  assert.equal(rich.accumulated, 2300);
  assert.deepEqual(rich.eras.slice(1).map(entry => entry.era), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(rich.events.filter(event => event.type === 'era').map(event => event.data.threshold), CIVILIZATION_ERAS.slice(1).map(era => era.threshold));
  assert.ok(rich.events.filter(event => event.type === 'era').every(event => event.date === '2026-01-04' && event.value === 2300));
});

test('civilization accounts for every contribution and observed inactive runs weather and repair the settlement', () => {
  const model = buildCivilizationModel(fixture([40, 0, 0, 0, 0, 0, 10]));
  assert.deepEqual(model.snapshots.map(snapshot => snapshot.accumulated), [40, 40, 40, 40, 40, 40, 50]);
  assert.deepEqual(model.snapshots.map(snapshot => snapshot.idleDays), [0, 1, 2, 3, 4, 5, 0]);
  assert.equal(model.snapshots[2].weathering, 0);
  assert.ok(model.snapshots[3].weathering > 0);
  assert.ok(model.snapshots[5].weathering > model.weathering);
  assert.ok(model.snapshots.every(snapshot => snapshot.weathering >= 0 && snapshot.weathering <= 1));
  assert.equal(model.events.filter(event => event.type === 'resources').reduce((total, event) => total + event.value, 0), 50);
  assert.equal(buildCivilizationModel(fixture([1, ...Array(40).fill(0)])).weathering, 1);
  assert.equal(buildCivilizationModel(fixture(Array(40).fill(0))).weathering, 0);
});

test('civilization launches only after reaching Space and finishing the original calendar timeline', () => {
  for (const counts of [[0], [1], [2199]]) {
    const model = buildCivilizationModel(fixture(counts));
    assert.equal(model.launch, undefined);
    assert.equal(model.duration, 32);
    assert.ok(!model.events.some(event => event.type.startsWith('rocket-')));
    assert.ok(!worldsScenes[2].build(fixture(counts)).render('dark').includes('data-actor="civilization-rocket"'));
  }
  for (const counts of [[2200], [2199, 0, 1], [2200, 0, 0, 100]]) {
    const calendar = fixture(counts), model = buildCivilizationModel(calendar), launch = model.launch;
    assert.ok(launch);
    assert.ok(launch.ignition > model.snapshots.at(-1).time);
    assert.ok(launch.ignition > model.eras.at(-1).time);
    assert.ok(launch.ignition < launch.liftoff && launch.liftoff < launch.escape && launch.escape < model.duration);
    assert.equal(model.historyDuration, 32, 'adding a finale must not stretch the date history');
    assert.equal(model.snapshots.at(-1).time, counts.length > 1 ? 29 : 1.4);
    assert.equal(model.accumulated, counts.reduce((a, b) => a + b, 0), 'the launch invents no resources');
    assert.deepEqual(model.events.filter(event => event.type.startsWith('rocket-')).map(event => event.type), ['rocket-ignition', 'rocket-liftoff', 'rocket-escape']);
    assert.ok(model.events.filter(event => event.type.startsWith('rocket-')).every(event => event.date === calendar.cells.at(-1).date));
    const flight = launch.points.slice(1), distances = flight.slice(1).map((point, index) => flight[index].y - point.y);
    assert.ok(flight.every((point, index) => !index || point.time > flight[index - 1].time && point.x === flight[index - 1].x && point.y < flight[index - 1].y));
    assert.ok(distances.every((distance, index) => !index || distance > distances[index - 1]), 'liftoff accelerates upwards');
    assert.ok(flight.at(-1).y + 30 < 0, 'the entire rocket and exhaust leave the card');
    for (const theme of ['dark', 'light']) {
      const still = worldsScenes[2].build(calendar).render(theme, false);
      assert.ok(still.includes('data-actor="civilization-rocket"'));
      assert.ok(!still.includes('data-rocket-flame') && !still.includes('<animate'), 'the still keeps an unlit rocket parked');
    }
  }
});

test('missing dates break inactivity observations and cannot invent weathering', () => {
  const calendar = fixture([10, 0, 0, 0, 0]);
  calendar.cells.splice(3, 1);
  const model = buildCivilizationModel(calendar);
  assert.deepEqual(model.snapshots.map(snapshot => snapshot.idleDays), [0, 1, 2, 1]);
  assert.equal(model.weathering, 0);
});

test('town spends exact accumulated thresholds on homes and roads, bounded by its 24 lots', () => {
  const model = buildTownModel(fixture([0, 1, 23, 1, 48, 24]));
  assert.equal(model.contributions, 97);
  assert.deepEqual(model.buildings.map(building => building.threshold), [1, 25, 49, 73, 97]);
  assert.deepEqual(model.roads.map(road => road.segment), [0, 1, 2, 3, 4]);
  for (const building of model.buildings) assert.ok(building.threshold <= building.accumulated);
  assert.equal(buildTownModel(fixture([10000])).buildings.length, 24);
  assert.equal(buildTownModel(fixture([10000])).roads.length, 6);
});

test('town celebrations need an actual active streak or high-count week', () => {
  assert.equal(buildTownModel(fixture([1, 1, 1, 0, 1, 1, 0])).festivals.length, 0);
  const streak = buildTownModel(fixture([1, 1, 1, 1, 0, 0, 0]));
  assert.equal(streak.festivals.length, 1);
  assert.equal(streak.festivals[0].streak, 4);
  assert.equal(streak.festivals[0].count, 4);
  const peak = buildTownModel(fixture([35, 0, 0, 0, 0, 0, 0]));
  assert.equal(peak.festivals.length, 1);
  assert.equal(peak.festivals[0].count, 35);
  const missing = fixture([1, 1, 1, 1, 1, 0, 0]);
  missing.cells.splice(2, 1);
  assert.equal(buildTownModel(missing).festivals.length, 0);
});

test('town uses observed aggregate public types honestly and has an explicit calendar-only fallback', () => {
  const calendar = fixture([1, 1, 1, 1, 0, 0, 0]);
  const plain = buildTownModel(calendar);
  const enriched = buildTownModel(calendar, publicContext);
  assert.equal(plain.source, 'calendar-only');
  assert.equal(plain.activity, undefined);
  assert.equal(enriched.source, 'github-public');
  assert.deepEqual(enriched.activity, publicContext.activity);
  assert.deepEqual(enriched.buildings, plain.buildings);
  assert.deepEqual(enriched.festivals, plain.festivals);
  const summary = enriched.events.find(event => event.type === 'public-activity-summary');
  assert.equal(summary.date, undefined);
  assert.equal(summary.data.scope, 'aggregate-context; no date attribution');
  assert.equal(buildTownModel(calendar, { ...publicContext, source: 'calendar-only' }).activity, undefined);
  assert.deepEqual(buildTownModel(calendar, { ...publicContext, activity: { commits: -5, issues: 2.8, pullRequests: Infinity, reviews: NaN } }).activity, { commits: 0, issues: 2, pullRequests: 0, reviews: 0 });
  const town = worldsScenes.find(scene => scene.id === 'town');
  assert.match(town.build(calendar, publicContext).render('dark', false), /OBSERVED PUBLIC ACTIVITY · SAMPLED TOTALS/);
  assert.match(town.build(calendar).render('light', false), /Calendar totals · public types unavailable/);
});

test('empty and single-date worlds do not fabricate plants, construction, eras, or festivals', () => {
  const calendar = fixture(Array(14).fill(0));
  assert.equal(buildGardenModel(calendar).plants.length, 0);
  assert.equal(buildCityModel(calendar).buildings.length, 0);
  assert.equal(buildCivilizationModel(calendar).era, 0);
  assert.equal(buildTownModel(calendar).buildings.length, 0);
  assert.equal(buildTownModel(calendar).festivals.length, 0);
  for (const scene of worldsScenes) {
    for (const input of [calendar, fixture([1])]) {
      const model = scene.build(input);
      assert.ok(model.duration > 0);
      assert.ok(model.events.every(event => event.time >= 0 && event.time < model.duration));
      assert.doesNotMatch(model.render('dark'), /NaN|Infinity|undefined/);
    }
  }
});

test('world films are deterministic, have meaningful checkpoints and distinct SVG artwork in both themes', () => {
  const calendar = fixture(Array.from({ length: 84 }, (_, index) => index % 9 < 7 ? 3 + index % 19 : 0));
  const fingerprints = [];
  for (const scene of worldsScenes) {
    const first = scene.build(calendar, publicContext);
    const second = scene.build(calendar, publicContext);
    assert.deepEqual(first.events, second.events);
    assert.deepEqual(first.metrics, second.metrics);
    assert.equal(first.render('dark'), second.render('dark'));
    assert.ok(first.checkpoints.length >= 3);
    assert.ok(first.checkpoints.every(checkpoint => checkpoint > 0 && checkpoint < first.duration));
    assert.ok(first.events.every((event, index) => index === 0 || event.time >= first.events[index - 1].time));
    fingerprints.push(first.render('dark', false));
    for (const theme of ['dark', 'light']) {
      const animated = first.render(theme);
      const staticSVG = first.render(theme, false);
      assert.match(animated, /width="1120" height="448"/);
      assert.match(animated, new RegExp(`class="${scene.id}-world"`));
      assert.match(animated, /class="reduced"/);
      assert.match(animated, /prefers-reduced-motion:reduce/);
      assert.match(animated, /<animate/);
      assert.doesNotMatch(staticSVG, /<animate|<script|onload=|NaN|undefined|Infinity/);
      assert.doesNotMatch(animated, /<script|onload=/);
      assert.notEqual(animated, staticSVG);
      for (const match of animated.matchAll(/keyTimes="([^"]+)"/g)) {
        const times = match[1].split(';').map(Number);
        assert.ok(times.every((time, index) => Number.isFinite(time) && time >= 0 && time <= 1 && (index === 0 || time >= times[index - 1])), `${scene.id} has invalid animation timing`);
      }
    }
    assert.notEqual(first.render('dark', false), first.render('light', false));
  }
  assert.equal(new Set(fingerprints).size, worldsScenes.length);
  assert.match(fingerprints[0], /garden-plant/);
  assert.match(fingerprints[1], /city-building/);
  assert.match(fingerprints[2], /civilization-settlement/);
  assert.match(fingerprints[3], /town-house/);
});

test('calendar language labels are XML escaped and only observed aggregate context reaches artwork', () => {
  const context = { source: 'github-public', languages: [{ name: '<script>alert("x")</script>', weight: 1, color: '" onload="bad' }] };
  const svg = worldsScenes[0].build(fixture([9]), context).render('dark', false);
  assert.match(svg, /&lt;script&gt;/);
  assert.doesNotMatch(svg, /<script|onload=/);
});
