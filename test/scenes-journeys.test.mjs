import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCalendar } from '../lib/calendar.js';
import { invaderSway, journeysScenes, modelArchaeology, modelDungeon, modelInvaders, modelSpaceRoute, modelTrain, oreTier, seasonFor } from '../lib/scenes/journeys.js';

function fixture(columns = 8, count = (column, row) => (column * 7 + row) % 9, start = Date.UTC(2026, 0, 4)) {
  return normalizeCalendar({ login: 'journey-test', calendar: { totalContributions: 0,
    weeks: Array.from({ length: columns }, (_, column) => ({
      firstDay: new Date(start + column * 7 * 86_400_000).toISOString().slice(0, 10),
      contributionDays: Array.from({ length: 7 }, (_, row) => {
        const contributionCount = count(column, row);
        return { date: new Date(start + (column * 7 + row) * 86_400_000).toISOString().slice(0, 10), weekday: row,
          contributionCount, contributionLevel: contributionCount ? ['FIRST_QUARTILE', 'SECOND_QUARTILE', 'THIRD_QUARTILE', 'FOURTH_QUARTILE'][Math.min(3, Math.floor(contributionCount / 8))] : 'NONE' };
      }),
    })),
  } });
}
const expectedDates = calendar => calendar.cells.filter(cell => cell.count).sort((a, b) => a.count - b.count || a.date.localeCompare(b.date));
const ofType = (model, type) => model.events.filter(event => event.type === type);

test('invaders consume every real date by exact ascending count, with a fire before each removal', () => {
  const calendar = fixture(12, (column, row) => [0, 1, 2, 8, 3, 1, 24][(column + row) % 7]);
  const model = modelInvaders(calendar), hits = ofType(model, 'invader-hit'), fires = ofType(model, 'ship-fire');
  assert.deepEqual(hits.map(hit => [hit.date, hit.value]), expectedDates(calendar).map(cell => [cell.date, cell.count]));
  assert.equal(new Set(hits.map(hit => hit.date)).size, calendar.activeDays);
  assert.equal(hits.reduce((sum, hit) => sum + hit.value, 0), calendar.total);
  for (let index = 0; index < hits.length; index++) {
    const target = model.targets[index], fire = fires[index], hit = hits[index];
    assert.ok(fire.time < hit.time);
    assert.equal(fire.data.hitTime, hit.time);
    assert.equal(fire.data.targetX, hit.data.x);
    assert.equal(fire.data.targetY, hit.data.y);
    assert.ok(Math.abs(hit.data.x - target.x - invaderSway(hit.time)) < 1e-9);
    assert.ok(target.y > Math.max(...model.targets.map(target => target.homeY)) + 10, 'the interception lane clears all unselected invaders');
    assert.equal(hit.data.removed, true);
  }
});

test('projectiles intersect only the selected diving invader before its removal', () => {
  const model = modelInvaders(fixture(53, (column, row) => 1 + (column + row * 5) % 33));
  for (const target of model.targets) {
    for (let step = 0; step <= 20; step++) {
      const time = target.fire + (target.hit - target.fire) * step / 20;
      const laserY = 303 + (target.y - 303) * step / 20;
      for (const other of model.targets) {
        if (other === target || other.hit <= time) continue;
        const ratio = Math.max(0, Math.min(1, (time - (other.fire - 0.08)) / 0.08));
        const y = other.homeY + (other.y - other.homeY) * ratio;
        const x = other.x + invaderSway(time);
        assert.ok(Math.abs(x - target.aimX) > 8 || Math.abs(y - laserY) > 8,
          `${target.date}'s projectile must not hit ${other.date}`);
      }
    }
  }
});

test('invader boss requires an actual consecutive seven-day streak including calendar gaps', () => {
  const calendar = fixture(2, (_, row) => row === 6 ? 0 : 9);
  assert.equal(calendar.longestStreak, 6);
  assert.equal(modelInvaders(calendar).boss, undefined);
  const dense = fixture(2, () => 1), boss = modelInvaders(dense).boss;
  assert.equal(boss.streak, 14);
  assert.equal(boss.hits.length, 2);
  const missing = { ...dense, cells: dense.cells.filter((_, index) => index !== 6), longestStreak: 999 };
  const event = ofType(modelInvaders(missing), 'boss-arrive')[0];
  assert.equal(event.value, 7, 'the model recomputes evidence instead of trusting aggregate streak metadata');
  assert.equal(event.data.streakDates.length, 7);
});

test('train stops at exactly the active weekly stations in chronological order', () => {
  const calendar = fixture(9, (column, row) => column % 3 ? 0 : row + 1);
  const model = modelTrain(calendar), stops = ofType(model, 'station-stop');
  assert.deepEqual(stops.map(event => event.data.column), [0, 3, 6]);
  assert.equal(stops.reduce((sum, event) => sum + event.value, 0), calendar.total);
  assert.equal(ofType(model, 'week-pass').length, 6);
  model.stations.forEach((station, index) => {
    assert.equal(station.count, calendar.cells.filter(cell => cell.column === index).reduce((sum, cell) => sum + cell.count, 0));
    assert.equal(station.depart > station.arrive, station.count > 0);
    const point = model.points.find(point => point.time === station.arrive);
    assert.deepEqual([point.x, point.y], [station.x, station.y]);
    if (index) assert.ok(station.arrive > model.stations[index - 1].depart);
  });
});

test('train seasons follow actual months across year boundaries', () => {
  assert.deepEqual(['2025-12-28', '2026-02-28', '2026-03-01', '2026-06-01', '2026-09-01'].map(seasonFor), ['WINTER', 'WINTER', 'SPRING', 'SUMMER', 'AUTUMN']);
  const model = modelTrain(fixture(53, () => 1));
  const seasons = ofType(model, 'season-change');
  assert.deepEqual(seasons.map(event => event.data.season), ['WINTER', 'SPRING', 'SUMMER', 'AUTUMN', 'WINTER']);
  assert.ok(seasons.every(event => event.data.season === seasonFor(event.date)));
});

test('archaeology excavates every actual date once with exact-count ore tiers and a physical shaft route', () => {
  const calendar = fixture(6, (column, row) => [0, 1, 2, 3, 9, 10, 30][(column + row) % 7]);
  const model = modelArchaeology(calendar), digs = ofType(model, 'ore-excavate');
  assert.deepEqual(digs.map(event => [event.date, event.value]), expectedDates(calendar).map(cell => [cell.date, cell.count]));
  assert.equal(digs.reduce((sum, event) => sum + event.value, 0), calendar.total);
  assert.deepEqual([1, 2, 3, 9, 10, 29, 30, 900].map(oreTier), ['quartz', 'quartz', 'copper', 'copper', 'gold', 'gold', 'diamond', 'diamond']);
  for (const deposit of model.deposits) {
    const position = model.points.find(point => point.time === deposit.dig);
    assert.deepEqual([position.x, position.y], [deposit.x, deposit.y]);
    assert.equal(deposit.tier, oreTier(deposit.count));
    const start = model.points.find(point => point.time === deposit.start);
    assert.equal(start.y, 143);
    assert.equal(start.x, position.x);
    assert.ok(deposit.leave > deposit.dig);
  }
  for (let index = 1; index < model.points.length; index++) {
    const a = model.points[index - 1], b = model.points[index];
    assert.ok(a.x === b.x || a.y === b.y, 'the miner follows horizontal tunnels or a vertical shaft');
  }
});

test('streak treasure unlocks only after every date in its genuine streak has been excavated', () => {
  const calendar = fixture(2, (column, row) => column ? 0 : [10, 1, 8, 3, 30, 0, 0][row]);
  const model = modelArchaeology(calendar), treasure = ofType(model, 'treasure-unlock')[0];
  assert.equal(treasure.value, 5);
  assert.equal(treasure.data.threshold, 5);
  for (const date of treasure.data.streakDates) assert.ok(model.deposits.find(deposit => deposit.date === date).dig < treasure.time);
  assert.equal(modelArchaeology(fixture(2, (_, row) => row < 4 ? 30 : 0)).treasure, undefined);
});

test('dungeon walks adjacent graph edges and reveals only locally observable fog', () => {
  const calendar = fixture(8, (column, row) => (column + row) % 4 === 0 ? column + row + 1 : 0);
  const model = modelDungeon(calendar);
  for (let index = 1; index < model.route.length; index++) {
    const a = model.route[index - 1], b = model.route[index];
    assert.equal(Math.abs(a.column - b.column) + Math.abs(a.row - b.row), 1);
    assert.ok(b.time > a.time);
  }
  assert.equal(new Set(model.revealed.map(room => `${room.column},${room.row}`)).size, model.revealed.length);
  for (const reveal of model.revealed) {
    const hero = model.route.find(point => Math.abs(point.time - reveal.time) < 1e-8);
    assert.ok(hero);
    assert.ok(Math.abs(hero.column - reveal.column) + Math.abs(hero.row - reveal.row) <= 1);
    assert.ok(reveal.column >= 0 && reveal.column < calendar.columns && reveal.row >= 0 && reveal.row < 7);
  }
});

test('dungeon collects each active room once and spends actual loot to defeat the final encounter', () => {
  const calendar = fixture(7), model = modelDungeon(calendar), loot = ofType(model, 'room-loot');
  assert.equal(loot.length, calendar.activeDays);
  assert.equal(new Set(loot.map(event => event.date)).size, calendar.activeDays);
  assert.equal(loot.reduce((sum, event) => sum + event.value, 0), calendar.total);
  for (const event of loot) {
    const at = model.route.find(point => Math.abs(point.time - event.time) < 1e-8);
    assert.deepEqual([at.column, at.row], [event.data.column, event.data.row]);
  }
  const encounter = model.encounter;
  assert.equal(encounter.hp, Math.max(...calendar.cells.map(cell => cell.count)));
  assert.ok(encounter.start > Math.max(...loot.map(event => event.time)));
  assert.equal(encounter.attacks.reduce((sum, attack) => sum + attack.damage, 0), encounter.hp);
  assert.equal(encounter.attacks.at(-1).hp, 0);
  const budget = new Map(model.loot.map(cell => [cell.date, cell.count]));
  for (const attack of encounter.attacks) {
    budget.set(attack.sourceDate, budget.get(attack.sourceDate) - attack.damage);
    assert.ok(budget.get(attack.sourceDate) >= 0);
  }
  assert.ok(encounter.attacks.length > 1);
});

test('space route uses exact weekly fuel and pays for every jump without negative reserves', () => {
  const calendar = fixture(13, (column, row) => [1, 5, 9, 12].includes(column) && row === 0 ? 1 : 0);
  const model = modelSpaceRoute(calendar), refuels = ofType(model, 'station-refuel'), jumps = ofType(model, 'jump-depart');
  assert.deepEqual(refuels.map(event => event.data.column), [1, 5, 9, 12]);
  assert.equal(model.planets.length, calendar.columns);
  assert.equal(refuels.reduce((sum, event) => sum + event.value, 0), calendar.total);
  assert.equal(jumps.length, 3);
  assert.equal(model.fuel, 1);
  assert.equal(model.burned + model.fuel, calendar.total);
  assert.ok(model.events.filter(event => event.data?.fuel !== undefined).every(event => event.data.fuel >= 0));
  assert.ok(ofType(model, 'planet-flyby').length > 0);
  for (const event of model.events.filter(event => ['planet-arrive', 'planet-flyby'].includes(event.type))) {
    const planet = model.planets[event.data.column], point = model.points.find(point => point.time === event.time);
    assert.deepEqual([point.x, point.y], [planet.x, planet.y - 23]);
    assert.equal(event.value, planet.count);
    assert.equal(event.type === 'planet-arrive', planet.count > 0);
  }
});

test('space route cannot invent fuel on quiet weeks or manufacture a launch for an empty history', () => {
  const empty = modelSpaceRoute(fixture(9, () => 0));
  assert.equal(empty.fuel, 0);
  assert.equal(empty.burned, 0);
  assert.equal(empty.events.length, 0);
  assert.equal(empty.points.length, 1);
  const sparse = modelSpaceRoute(fixture(53, (column, row) => column === 52 && row === 6 ? 1 : 0));
  assert.equal(sparse.stations.length, 1);
  assert.equal(sparse.burned, 0);
  assert.equal(sparse.fuel, 1);
  assert.equal(ofType(sparse, 'ship-launch')[0].data.column, 52);
});

test('all journey films are deterministic, script-free, finite and support both themes and static rendering', () => {
  for (const calendar of [fixture(53), fixture(1, () => 0), fixture(1, (_, row) => row === 3 ? 1 : 0)]) {
    for (const definition of journeysScenes) {
      const film = definition.build(calendar), repeated = definition.build(calendar);
      assert.deepEqual(film.events, repeated.events);
      assert.deepEqual(film.metrics, repeated.metrics);
      assert.ok(film.duration >= 18 && film.duration < 125);
      assert.ok(film.events.every((event, index) => Number.isFinite(event.time) && event.time >= 0 && event.time <= film.duration && (!index || event.time >= film.events[index - 1].time)));
      assert.ok(film.checkpoints.every(time => time >= 0 && time < film.duration));
      for (const theme of ['light', 'dark']) {
        for (const animated of [false, true]) {
          const svg = film.render(theme, animated);
          assert.match(svg, /viewBox="0 0 1120 448"/);
          assert.ok(!/NaN|Infinity|undefined|<script|onload=|foreignObject/.test(svg), `${definition.id} ${theme} ${animated}`);
          if (animated) assert.match(svg, /prefers-reduced-motion:reduce/);
          else assert.ok(!/<animate(?:Transform)?\s/.test(svg), 'static variants contain no active animations');
          assert.equal(svg, repeated.render(theme, animated));
        }
      }
    }
  }
});

test('empty calendars preserve inactivity in every journey mechanic', () => {
  const calendar = fixture(5, () => 0);
  assert.equal(modelInvaders(calendar).events.length, 0);
  assert.equal(modelArchaeology(calendar).events.length, 0);
  assert.equal(modelDungeon(calendar).events.length, 0);
  assert.equal(modelSpaceRoute(calendar).events.length, 0);
  assert.equal(ofType(modelTrain(calendar), 'station-stop').length, 0);
});

test('missing dates and entirely absent weeks create no resource rooms or stations', () => {
  const full = fixture(4, () => 1, Date.UTC(2026, 1, 22));
  const cells = full.cells.filter(cell => (cell.column !== 1 && cell.column !== 2) && cell.row !== 0);
  const calendar = { ...full, cells, from: cells[0].date, to: cells.at(-1).date, total: cells.length, activeDays: cells.length };
  const train = modelTrain(calendar), space = modelSpaceRoute(calendar);
  assert.deepEqual(train.stations.map(station => station.date), ['2026-02-23', '2026-03-01', '2026-03-08', '2026-03-16']);
  assert.deepEqual(space.planets.map(planet => planet.date), train.stations.map(station => station.date));
  assert.deepEqual(train.stations.map(station => station.count), [6, 0, 0, 6]);
  assert.equal(modelDungeon(calendar).loot.length, cells.length);
  assert.equal(modelArchaeology(calendar).deposits.length, cells.length);
  assert.equal(modelInvaders(calendar).targets.length, cells.length);
});
