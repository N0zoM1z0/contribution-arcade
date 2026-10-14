import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCalendar } from '../lib/calendar.js';
import { makeCycle, simulateSnake } from '../lib/snake.js';
import { renderSnakeSVG } from '../lib/snake-svg.js';

function calendar(columns, active) {
  const first = Date.UTC(2026, 0, 4);
  return normalizeCalendar({ login: 'growing-snake', calendar: { totalContributions: 0,
    weeks: Array.from({ length: columns }, (_, column) => ({
      firstDay: new Date(first + column * 7 * 86_400_000).toISOString().slice(0, 10),
      contributionDays: Array.from({ length: 7 }, (_, row) => ({
        date: new Date(first + (column * 7 + row) * 86_400_000).toISOString().slice(0, 10),
        weekday: row, contributionCount: active(column, row) ? 1 : 0,
        contributionLevel: active(column, row) ? 'FIRST_QUARTILE' : 'NONE',
      })),
    })),
  } });
}
const key = point => `${point.column},${point.row}`;
const distance = (a, b) => Math.abs(a.column - b.column) + Math.abs(a.row - b.row);

test('the route is a unique, adjacent cycle for narrow and full-year boards', () => {
  for (const columns of [1, 2, 3, 52, 53, 54]) {
    const cycle = makeCycle(columns);
    assert.equal(cycle.length, Math.max(2, columns) * (columns < 4 ? 10 : 8));
    assert.equal(new Set(cycle.map(key)).size, cycle.length);
    cycle.forEach((point, index) => assert.equal(distance(point, cycle[(index + 1) % cycle.length]), 1));
  }
});

test('each meal adds exactly one segment and every other move keeps the length', () => {
  const input = calendar(10, (column, row) => (column + row) % 3 === 0);
  const scene = simulateSnake(input);
  assert.equal(scene.meals.length, input.activeDays);
  assert.equal(scene.finalLength, scene.initialLength + input.activeDays);
  assert.ok(scene.meals[0].time - scene.playStart <= 0.25);
  scene.frames.forEach((frame, index) => {
    assert.equal(frame.body.length, scene.initialLength + frame.eaten);
    if (!index) return;
    const previous = scene.frames[index - 1];
    assert.equal(distance(frame.body[0], previous.body[0]), 1);
    assert.equal(frame.body.length - previous.body.length, frame.food ? 1 : 0);
    if (frame.food) assert.deepEqual(frame.body.at(-1), previous.body.at(-1));
  });
  assert.equal(new Set(scene.meals.map(meal => meal.cell.date)).size, input.activeDays);
});

test('a completely active year grows beyond 370 segments without eating its body', () => {
  const input = calendar(53, () => true);
  const scene = simulateSnake(input);
  assert.equal(scene.finalLength, 375);
  assert.equal(scene.meals.length, 371);
  for (const frame of scene.frames) {
    assert.equal(new Set(frame.body.map(key)).size, frame.body.length);
    for (const [index, point] of frame.body.entries()) {
      assert.ok(point.column >= 0 && point.column < scene.columns);
      assert.ok(point.row >= 0 && point.row < scene.rows);
      if (index) assert.equal(distance(point, frame.body[index - 1]), 1);
    }
  }
});

test('empty and single-week calendars remain valid and deterministic', () => {
  const empty = simulateSnake(calendar(1, () => false));
  assert.equal(empty.frames.length, 1);
  assert.equal(empty.finalLength, 4);
  assert.equal(empty.duration, 12);
  const input = calendar(1, () => true);
  assert.deepEqual(simulateSnake(input), simulateSnake(input));
  assert.equal(simulateSnake(input).finalLength, 11);
});

test('short, completely active histories still leave room for all four starting segments', () => {
  for (const columns of [1, 2, 3, 4]) {
    const scene = simulateSnake(calendar(columns, () => true));
    assert.equal(scene.finalLength, 4 + columns * 7);
    for (const frame of scene.frames) assert.equal(new Set(frame.body.map(key)).size, frame.body.length);
  }
});

test('missing dates are traversable space, never synthetic food', () => {
  const input = calendar(5, () => true);
  input.cells = input.cells.filter(cell => cell.row >= 2 && cell.column < 4);
  input.activeDays = input.cells.length;
  input.total = input.cells.length;
  const scene = simulateSnake(input);
  assert.equal(scene.meals.length, input.cells.length);
  assert.deepEqual(new Set(scene.meals.map(meal => meal.cell.date)), new Set(input.cells.map(cell => cell.date)));
});

test('SVG exports preserve food dates, growth counters, and static alternatives', () => {
  const input = calendar(6, (column, row) => (column + row) % 2 === 0);
  const scene = simulateSnake(input);
  const svg = renderSnakeSVG(input, scene, 'dark');
  assert.equal((svg.match(/class="snake-food"/g) || []).length, input.activeDays);
  assert.ok(svg.includes(`data-final-length="${4 + input.activeDays}"`));
  assert.ok(svg.includes('class="snake-body"'));
  assert.ok(svg.includes('attributeName="stroke-dasharray"'));
  assert.ok(svg.includes('attributeName="stroke-dashoffset"'));
  assert.ok(svg.includes('prefers-reduced-motion:reduce'));
  assert.ok(!/NaN|Infinity|<script|<foreignObject/.test(svg));
  for (const match of svg.matchAll(/keyTimes="([^"]+)"/g)) {
    const times = match[1].split(';').map(Number);
    assert.equal(times[0], 0);
    assert.equal(times.at(-1), 1);
    assert.ok(times.every((time, index) => !index || time >= times[index - 1]));
  }
  assert.ok(!renderSnakeSVG(input, scene, 'light', false).includes('<animate'));
  assert.ok(!/NaN|Infinity|dur="0s"/.test(renderSnakeSVG(calendar(1, () => false), simulateSnake(calendar(1, () => false)), 'dark')));
});
