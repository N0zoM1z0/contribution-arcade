import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCalendar } from '../lib/calendar.js';
import { simulate } from '../lib/breakout.js';
import { renderSVG } from '../lib/svg.js';
import { simulateSnake } from '../lib/snake.js';
import { renderSnakeSVG } from '../lib/snake-svg.js';
import { scenes } from '../lib/scenes/index.js';
import { planCalendarMeals } from '../lib/scenes/route.js';

function fixture(columns, omit = new Set(), active = true) {
  const start = Date.UTC(2026, 0, 4);
  return normalizeCalendar({ login: 'fixed-calendar', calendar: { totalContributions: 0,
    weeks: Array.from({ length: columns }, (_, column) => ({
      firstDay: new Date(start + column * 7 * 86400000).toISOString().slice(0, 10),
      contributionDays: Array.from({ length: 7 }, (_, row) => {
        const index = column * 7 + row, count = active && index % 3 ? 1 + index % 9 : 0;
        return { date: new Date(start + index * 86400000).toISOString().slice(0, 10), weekday: row,
          contributionCount: count, contributionLevel: count ? 'FIRST_QUARTILE' : 'NONE' };
      }).filter((_, row) => !omit.has(column * 7 + row)),
    })),
  } });
}
function verifyTiles(svg, calendar, label) {
  const groups = [...svg.matchAll(/<g data-calendar-grid="true">([\s\S]*?)<\/g>/g)];
  assert.equal(groups.length, 1, `${label}: one permanent calendar, shared by both motion states`);
  const tiles = [...groups[0][1].matchAll(/<rect\b([^>]*)\/>/g)].map(match => Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(attribute => [attribute[1], attribute[2]])));
  assert.equal(tiles.length, calendar.cells.length, `${label}: zero days stay present and missing days stay absent`);
  assert.equal((svg.match(/data-cell-date=/g) || []).length, calendar.cells.length, `${label}: no second board mesh`);
  assert.deepEqual(tiles.map(tile => tile['data-cell-date']), calendar.cells.map(cell => cell.date), `${label}: date order is chronological, never count order`);
  for (const [index, tile] of tiles.entries()) {
    const cell = calendar.cells[index];
    assert.equal(Number(tile['data-column']), cell.column);
    assert.equal(Number(tile['data-row']), cell.row);
    assert.equal(Number(tile['data-count']), cell.count);
    const x = Number(tile.x) + Number(tile.width) / 2, y = Number(tile.y) + Number(tile.height) / 2;
    assert.ok(Math.abs(x - (48 + (cell.column + .5) * 1024 / calendar.columns)) < .002, `${label}: ${cell.date} week position`);
    assert.ok(Math.abs(y - (121.25 + cell.row * 19)) < .002, `${label}: ${cell.date} weekday position`);
  }
}

test('every scene retains exactly the original date graph in both themes and motion modes', () => {
  for (const calendar of [fixture(4, new Set([0, 1, 12, 26, 27])), fixture(1, new Set([0, 6])), fixture(2, new Set(), false)]) {
    const before = structuredClone(calendar), breakout = simulate(calendar), snake = simulateSnake(calendar);
    const films = [
      { id: 'breakout', render: (theme, animated) => renderSVG(calendar, breakout, theme, animated) },
      { id: 'snake', render: (theme, animated) => renderSnakeSVG(calendar, snake, theme, animated) },
      ...scenes.map(definition => ({ id: definition.id, ...definition.build(calendar) })),
    ];
    assert.equal(films.length, 19);
    for (const film of films) for (const theme of ['dark', 'light']) for (const animated of [true, false]) {
      verifyTiles(film.render(theme, animated), calendar, `${film.id}/${theme}/${animated}`);
    }
    assert.deepEqual(calendar, before, 'no simulation may mutate or sort the input calendar in place');
  }
});

test('minimum-count routing changes the itinerary rather than relocating dates', () => {
  const calendar = fixture(1);
  calendar.cells.forEach(cell => { cell.count = cell.row === 0 ? 1 : cell.row === 3 ? 50 : cell.row === 6 ? 1 : 0; });
  const before = structuredClone(calendar);
  const moves = planCalendarMeals(calendar, { column: 0, row: 8 });
  const meals = moves.filter(move => move.meal);
  assert.deepEqual(meals.map(move => move.meal.row), [6, 0, 3], 'the nearest tied minimum can be a later date');
  assert.deepEqual(meals.map(move => move.meal.count), [1, 1, 50]);
  assert.ok(moves.some(move => move.row === 3 && !move.meal), 'a larger dormant date can be crossed before its collection turn');
  moves.forEach((move, index) => {
    const previous = index ? moves[index - 1] : { column: 0, row: 8 };
    assert.equal(Math.abs(move.column - previous.column) + Math.abs(move.row - previous.row), 1);
    if (move.meal) assert.deepEqual([move.column, move.row], [move.meal.column, move.meal.row]);
  });
  assert.deepEqual(calendar, before);
});
