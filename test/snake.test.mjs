import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCalendar } from '../lib/calendar.js';
import { simulateSnake } from '../lib/snake.js';
import { renderSnakeSVG } from '../lib/snake-svg.js';

function calendar(columns, active) {
  const first = Date.UTC(2026, 0, 4);
  return normalizeCalendar({ login: 'growing-snake', calendar: { totalContributions: 0,
    weeks: Array.from({ length: columns }, (_, column) => ({
      firstDay: new Date(first + column * 7 * 86_400_000).toISOString().slice(0, 10),
      contributionDays: Array.from({ length: 7 }, (_, row) => ({
        date: new Date(first + (column * 7 + row) * 86_400_000).toISOString().slice(0, 10),
        weekday: row, contributionCount: Number(active(column, row)),
        contributionLevel: active(column, row) ? 'FIRST_QUARTILE' : 'NONE',
      })),
    })),
  } });
}
const key = point => `${point.column},${point.row}`;
const distance = (a, b) => Math.abs(a.column - b.column) + Math.abs(a.row - b.row);

test('food follows exact ascending counts even when quartile colors match', () => {
  const input = calendar(10, (column, row) => 1 + (column * 37 + row * 13) % 41);
  const scene = simulateSnake(input);
  assert.equal(scene.meals.length, input.activeDays);
  assert.deepEqual(scene.meals.map(meal => meal.cell.count), input.cells.map(cell => cell.count).sort((a, b) => a - b));
  assert.equal(new Set(scene.meals.map(meal => meal.cell.date)).size, input.activeDays);
});

function verifyMovement(scene) {
  for (const [index, frame] of scene.frames.entries()) {
    assert.equal(new Set(frame.body.map(key)).size, frame.body.length);
    assert.equal(frame.body.length, Math.min(scene.maxLength, scene.initialLength + Math.floor(frame.eaten / scene.growthEvery)));
    frame.body.forEach((point, segment) => {
      assert.ok(point.column >= 0 && point.column < scene.columns);
      assert.ok(point.row >= 0 && point.row < scene.rows);
      if (segment) assert.equal(distance(point, frame.body[segment - 1]), 1);
    });
    if (!index) continue;
    const previous = scene.frames[index - 1];
    assert.equal(distance(frame.body[0], previous.body[0]), 1);
    assert.ok(frame.time > previous.time);
    const grows = frame.body.length > previous.body.length;
    if (grows) {
      assert.ok(frame.food);
      assert.equal(frame.eaten % scene.growthEvery, 0);
      assert.deepEqual(frame.body.at(-1), previous.body.at(-1));
    } else assert.equal(frame.body.length, previous.body.length);
    if (frame.food) assert.deepEqual(frame.body[0], { column: frame.food.column, row: frame.food.row });
  }
}

test('growth is gradual and remains capped for a fully active year', () => {
  const input = calendar(53, (column, row) => 1 + (column * 19 + row * 7) % 67);
  const scene = simulateSnake(input);
  assert.equal(scene.finalLength, 16);
  assert.equal(scene.meals.length, 371);
  assert.equal(scene.meals[0].length, 4);
  assert.equal(scene.meals[3].length, 4);
  assert.equal(scene.meals[4].length, 5);
  verifyMovement(scene);
});

test('narrow, empty, sparse and tied-count histories remain deterministic and collision-free', () => {
  for (const columns of [1, 2, 3, 4, 9, 54]) {
    for (const mode of [0, 1, 2]) {
      const input = calendar(columns, (column, row) => mode === 0 ? 0 : mode === 1 ? 1 : (column * 11 + row * 3) % 17);
      const scene = simulateSnake(input);
      assert.equal(scene.meals.length, input.activeDays);
      assert.deepEqual(scene, simulateSnake(input));
      verifyMovement(scene);
      assert.ok(scene.meals.every((meal, index) => !index || meal.cell.count >= scene.meals[index - 1].cell.count));
      if (!input.activeDays) { assert.equal(scene.finalLength, 4); assert.equal(scene.duration, 12); }
    }
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
  assert.ok(svg.includes(`data-final-length="${scene.finalLength}"`));
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
