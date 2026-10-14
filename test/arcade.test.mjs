import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCalendar, fetchCalendar } from '../lib/calendar.js';
import { BOARD, intersectBox, simulate } from '../lib/breakout.js';
import { renderSVG } from '../lib/svg.js';

function fixture(columns = 4, active = () => true, level = 'FIRST_QUARTILE') {
  const first = Date.UTC(2026, 0, 4);
  return { login: 'arcade-test', calendar: { totalContributions: 0, weeks: Array.from({ length: columns }, (_, column) => {
    const days = Array.from({ length: 7 }, (_, row) => {
      const date = new Date(first + (column * 7 + row) * 86_400_000).toISOString().slice(0, 10);
      const on = active(column, row);
      return { date, weekday: row, contributionCount: on ? 4 : 0, contributionLevel: on ? level : 'NONE' };
    });
    return { firstDay: days[0].date, contributionDays: days };
  }) } };
}

test('partial weeks keep weekday coordinates and missing days stay absent', () => {
  const input = fixture(2);
  input.calendar.weeks[0].contributionDays = input.calendar.weeks[0].contributionDays.slice(3);
  input.calendar.weeks[1].contributionDays = input.calendar.weeks[1].contributionDays.slice(0, 2);
  const calendar = normalizeCalendar(input);
  assert.equal(calendar.cells.length, 6);
  assert.deepEqual(calendar.cells.map(cell => [cell.column, cell.row]), [[0, 3], [0, 4], [0, 5], [0, 6], [1, 0], [1, 1]]);
  assert.equal(calendar.longestStreak, 6);
  assert.equal(calendar.total, 24);
});

test('streaks end at zero contribution days and missing dates', () => {
  const input = fixture(2, (column, row) => column !== 0 || row !== 2);
  input.calendar.weeks[1].contributionDays.splice(2, 1);
  assert.equal(normalizeCalendar(input).longestStreak, 6);
});

test('malformed dates, duplicate dates and mismatched weekdays fail clearly', () => {
  for (const edit of [
    day => { day.date = '2026-02-31'; },
    day => { day.weekday = 5; },
    day => { day.contributionCount = -1; },
    day => { day.contributionLevel = 'UNKNOWN'; },
  ]) {
    const input = fixture(); edit(input.calendar.weeks[0].contributionDays[0]);
    assert.throws(() => normalizeCalendar(input), /Invalid or duplicate/);
  }
  const input = fixture();
  input.calendar.weeks[1].contributionDays[0] = { ...input.calendar.weeks[0].contributionDays[0] };
  assert.throws(() => normalizeCalendar(input), /Invalid or duplicate/);
});

test('an empty history produces a valid still scene without zero-duration animation', () => {
  const calendar = normalizeCalendar(fixture(53, () => false));
  const scene = simulate(calendar);
  assert.equal(scene.cleared, 0);
  assert.equal(scene.totalHits, 0);
  assert.equal(scene.balls.length, 0);
  const svg = renderSVG(calendar, scene, 'dark');
  assert.ok(!/NaN|Infinity|dur="0s"/.test(svg));
  assert.equal((svg.match(/data-date=/g) || []).length, 0);
});

test('a fast ball collides with a thin brick and reports the correct face', () => {
  assert.deepEqual(intersectBox(0, 5, 100, 0, 40, 0, 50, 10), { fraction: 0.4, nx: -1, ny: 0 });
  assert.deepEqual(intersectBox(45, 30, 0, -100, 40, 0, 50, 10), { fraction: 0.2, nx: 0, ny: 1 });
  assert.equal(intersectBox(0, 11, 100, 0, 40, 0, 50, 10), null);
});

test('stronger contribution levels require more hits in the same geometry', () => {
  const low = simulate(normalizeCalendar(fixture(8, (column, row) => column === 4 && row === 6)));
  const high = simulate(normalizeCalendar(fixture(8, (column, row) => column === 4 && row === 6, 'FOURTH_QUARTILE')));
  assert.equal(low.cleared, 1);
  assert.equal(high.cleared, 1);
  assert.equal(low.totalHits, 1);
  assert.equal(high.totalHits, 2);
});

test('dense histories stay bounded, deterministic, and conserve brick durability', () => {
  const calendar = normalizeCalendar(fixture(53, () => true, 'FOURTH_QUARTILE'));
  const scene = simulate(calendar);
  assert.deepEqual(scene, simulate(calendar));
  assert.equal(scene.balls.length, 3);
  assert.ok(scene.duration < 48);
  assert.ok(scene.cleared > 0);
  assert.equal(scene.totalHits + scene.bricks.reduce((sum, brick) => sum + brick.hp, 0), 371 * 2);
  for (const ball of scene.balls) {
    let last = 0;
    for (const point of ball.points) {
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
      assert.ok(point.time >= last);
      assert.ok(point.x >= BOARD.left - 0.01 && point.x <= BOARD.right + 0.01);
      assert.ok(point.y >= BOARD.top - 0.01 && point.y <= BOARD.paddleY);
      last = point.time;
    }
  }
  for (const brick of scene.bricks) {
    assert.equal(brick.hits.length, brick.initialHp - brick.hp);
    assert.ok(brick.hits.every(hit => hit.time >= scene.playStart && hit.time <= scene.playEnd));
  }
});

test('SVG output escapes usernames and provides reduced-motion and static alternatives', () => {
  const input = fixture(2);
  input.login = 'test<&"';
  const calendar = normalizeCalendar(input);
  const scene = simulate(calendar);
  const animated = renderSVG(calendar, scene, 'light');
  const still = renderSVG(calendar, scene, 'dark', false);
  assert.ok(animated.includes('test&lt;&amp;&quot;'));
  assert.ok(animated.includes('prefers-reduced-motion:reduce'));
  assert.ok(animated.includes('class="reduced"'));
  assert.ok(!/<script|<foreignObject|https?:\/\//.test(animated.replace('http://www.w3.org/2000/svg', '')));
  assert.ok(!/<animate/.test(still));
});

test('API failures and missing users surface as actionable errors', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: false, status: 401 });
    await assert.rejects(fetchCalendar('missing', 'test'), /401/);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ data: { user: null } }) });
    await assert.rejects(fetchCalendar('missing', 'test'), /user not found/);
  } finally { globalThis.fetch = original; }
});
