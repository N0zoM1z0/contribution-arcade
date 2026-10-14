import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCalendar } from '../lib/calendar.js';
import {
  arcadeScenes, simulatePacman, TETROMINOES, tetrominoRotations, tetrisFits, clearTetrisRows,
  simulateTetris, findMatchRuns, legalMatchSwaps, settleMatchBoard, simulateMatch3, simulateMoles, MOLE_HOLES,
} from '../lib/scenes/arcade.js';

function fixture(columns = 12, countFor = index => index % 16 + 1) {
  const first = Date.UTC(2026, 0, 4);
  return normalizeCalendar({ login: 'arcade<&"', calendar: { totalContributions: 0, weeks: Array.from({ length: columns }, (_, column) => {
    const contributionDays = Array.from({ length: 7 }, (_, row) => {
      const index = column * 7 + row;
      const count = countFor(index);
      const level = count === 0 ? 0 : Math.min(4, Math.ceil(count / 4));
      return { date: new Date(first + index * 86_400_000).toISOString().slice(0, 10), weekday: row, contributionCount: count,
        contributionLevel: ['NONE', 'FIRST_QUARTILE', 'SECOND_QUARTILE', 'THIRD_QUARTILE', 'FOURTH_QUARTILE'][level] };
    });
    return { firstDay: contributionDays[0].date, contributionDays };
  }) } });
}
const occupied = board => board.flat().filter(value => value !== null);
const shapeKey = shape => [...shape].sort((a, b) => a.y - b.y || a.x - b.x).map(point => `${point.x},${point.y}`).join(';');
const gems = kinds => kinds.map((row, y) => row.map((kind, x) => kind === 0 ? null : ({ id: y * row.length + x, date: `date-${y}-${x}`, count: kind * 3, kind })));

test('Pac-Man consumes every actual active date once in exact count order on adjacent maze cells', () => {
  const calendar = fixture(53, index => index % 7 === 0 ? 0 : (index * 37) % 29 + 1);
  const model = simulatePacman(calendar);
  assert.deepEqual(model, simulatePacman(calendar));
  assert.deepEqual(model.pellets.map(pellet => pellet.date).sort(), calendar.cells.filter(day => day.count).map(day => day.date).sort());
  assert.equal(model.pellets.reduce((sum, pellet) => sum + pellet.count, 0), calendar.total);
  assert.equal(new Set(model.pellets.map(pellet => pellet.date)).size, calendar.activeDays);
  assert.ok(model.pellets.every((pellet, index) => index === 0 || pellet.count >= model.pellets[index - 1].count));
  for (let index = 3; index < model.points.length; index++) {
    const previous = model.points[index - 1];
    const current = model.points[index];
    assert.equal(Math.abs(current.column - previous.column) + Math.abs(current.row - previous.row), 1);
    assert.ok(current.time > previous.time);
  }
  for (const pellet of model.pellets) {
    const point = model.points.find(point => point.time === pellet.time);
    assert.deepEqual([point.x, point.y], [pellet.x, pellet.y]);
    assert.ok(pellet.y >= 110 && pellet.y <= 350);
  }
});

test('real consecutive dates accelerate Pac-Man and three ghosts pursue his connected trail', () => {
  const model = simulatePacman(fixture(4, () => 1));
  assert.ok(model.pellets[12].step < model.pellets[0].step);
  assert.equal(model.pellets[12].streak, 13);
  assert.equal(model.ghosts.length, 3);
  for (const ghost of model.ghosts) for (const [index, point] of ghost.points.entries()) {
    assert.deepEqual([point.x, point.y], [model.points[index].x, model.points[index].y]);
    assert.ok(Math.abs(point.time - model.points[index].time - ghost.delay) < 1e-9);
    assert.ok(point.time < model.duration);
  }
  assert.equal(model.events.filter(event => event.type === 'ghost-chase').length, model.pellets.length * 3);
  const broken = simulatePacman(fixture(2, index => index === 5 ? 0 : 1));
  assert.equal(broken.pellets.find(pellet => pellet.date === '2026-01-10').streak, 1);
});

test('all seven Tetris shapes have four connected blocks and only legal normalized rotations', () => {
  for (const [kind, original] of Object.entries(TETROMINOES)) {
    const rotations = tetrominoRotations(kind);
    assert.equal(new Set(rotations.map(shapeKey)).size, rotations.length);
    assert.ok(rotations.some(shape => shapeKey(shape) === shapeKey(original)));
    for (const shape of rotations) {
      assert.equal(shape.length, 4);
      assert.equal(new Set(shape.map(point => `${point.x},${point.y}`)).size, 4);
      assert.equal(Math.min(...shape.map(point => point.x)), 0);
      assert.equal(Math.min(...shape.map(point => point.y)), 0);
      const reached = new Set([0]);
      for (let pass = 0; pass < 4; pass++) shape.forEach((point, index) => {
        if (shape.some((other, otherIndex) => reached.has(otherIndex) && Math.abs(point.x - other.x) + Math.abs(point.y - other.y) === 1)) reached.add(index);
      });
      assert.equal(reached.size, 4);
    }
  }
  assert.equal(tetrominoRotations('O').length, 1);
  assert.equal(tetrominoRotations('I').length, 2);
  assert.equal(tetrominoRotations('T').length, 4);
});

test('Tetris rejects floor, wall and stack collisions, and clears simultaneous complete rows', () => {
  const board = Array.from({ length: 6 }, () => Array(10).fill(null));
  const square = TETROMINOES.O;
  assert.equal(tetrisFits(board, square, 8, 4), true);
  assert.equal(tetrisFits(board, square, 9, 4), false);
  assert.equal(tetrisFits(board, square, -1, 4), false);
  assert.equal(tetrisFits(board, square, 8, 5), false);
  board[4][8] = 0;
  assert.equal(tetrisFits(board, square, 8, 4), false);
  board[5] = Array.from({ length: 10 }, (_, index) => index + 1);
  board[3] = Array.from({ length: 10 }, (_, index) => index + 11);
  board[2][2] = 99;
  const before = structuredClone(board);
  const cleared = clearTetrisRows(board);
  assert.deepEqual(cleared.rows, [3, 5]);
  assert.equal(cleared.board[4][2], 99);
  assert.equal(cleared.board[5][8], 0);
  assert.equal(occupied(cleared.board).length, 2);
  assert.deepEqual(board, before);
});

test('weekly Tetris drops collide with existing blocks and only clear genuinely full rows', () => {
  const calendar = fixture(53);
  const model = simulateTetris(calendar);
  assert.deepEqual(model, simulateTetris(calendar));
  assert.equal(model.drops.length, 53);
  assert.equal(model.contributions, calendar.total);
  assert.ok(model.lines > 0);
  assert.ok(new Set(model.drops.map(drop => drop.kind)).size >= 6);
  for (const [index, drop] of model.drops.entries()) {
    assert.ok(tetrominoRotations(drop.kind).some(shape => shapeKey(shape) === shapeKey(drop.shape)));
    assert.ok(index === 0 || drop.count >= model.drops[index - 1].count);
    assert.ok(tetrisFits(drop.before, drop.shape, drop.x, drop.y));
    assert.equal(tetrisFits(drop.before, drop.shape, drop.x, drop.y + 1), false);
    for (let y = 0; y <= drop.y; y++) assert.ok(tetrisFits(drop.before, drop.shape, drop.x, y));
    assert.equal(occupied(drop.landed).length, occupied(drop.before).length + 4);
    for (const point of drop.shape) assert.notEqual(drop.landed[drop.y + point.y][drop.x + point.x], null);
    const fullRows = drop.landed.flatMap((row, y) => row.every(value => value !== null) ? [y] : []);
    assert.deepEqual(drop.clearedRows, fullRows);
    assert.equal(occupied(drop.after).length, occupied(drop.landed).length - fullRows.length * model.width);
    assert.deepEqual(drop.after, clearTetrisRows(drop.landed).board);
  }
  assert.equal(model.lines, model.drops.reduce((sum, drop) => sum + drop.clearedRows.length, 0));
  assert.ok(model.drops.at(-1).lock - model.drops.at(-1).start <= model.drops[0].lock - model.drops[0].start + 1e-9);
  for (const block of model.blocks) {
    assert.ok(block.end > block.start && block.end <= model.duration);
    assert.ok(block.points.every((point, index) => point.time >= block.start && point.time <= block.end && (index === 0 || point.time >= block.points[index - 1].time)));
  }
});

test('match detection unions crossing runs and excludes gaps and runs of two', () => {
  const board = gems([[2, 1, 3], [1, 1, 1], [3, 1, 2]]);
  assert.equal(findMatchRuns(board).length, 5);
  assert.equal(new Set(findMatchRuns(board).map(point => `${point.x},${point.y}`)).size, 5);
  assert.equal(findMatchRuns(gems([[1, 1, 0, 1, 1], [2, 3, 2, 3, 2]])).length, 0);
});

test('match-three proposes only adjacent swaps that create a run containing a moved gem', () => {
  const board = gems([[1, 2, 1], [3, 1, 4], [2, 3, 4]]);
  const before = structuredClone(board);
  assert.equal(findMatchRuns(board).length, 0);
  const legal = legalMatchSwaps(board);
  assert.ok(legal.some(swap => swap.a.x === 1 && swap.a.y === 0 && swap.b.x === 1 && swap.b.y === 1));
  for (const swap of legal) {
    assert.equal(Math.abs(swap.a.x - swap.b.x) + Math.abs(swap.a.y - swap.b.y), 1);
    assert.ok(swap.matches.length >= 3);
    assert.ok(swap.matches.some(point => point.x === swap.a.x && point.y === swap.a.y || point.x === swap.b.x && point.y === swap.b.y));
  }
  assert.deepEqual(board, before);
});

test('match gravity preserves survivor ordering and consumes each finite refill gem once', () => {
  const board = gems([[1, 0, 0], [2, 3, 0], [0, 4, 0]]);
  const refill = gems([[4, 3, 2, 1, 4]])[0].map((gem, index) => ({ ...gem, id: 100 + index }));
  const before = structuredClone(board);
  const settled = settleMatchBoard(board, refill);
  assert.equal(settled.board[1][0].id, board[0][0].id);
  assert.equal(settled.board[2][0].id, board[1][0].id);
  assert.equal(settled.board[1][1].id, board[1][1].id);
  assert.equal(settled.board[2][1].id, board[2][1].id);
  assert.equal(occupied(settled.board).length, 9);
  assert.equal(new Set(occupied(settled.board).map(gem => gem.id)).size, 9);
  assert.equal(settled.refilled.length, 5);
  assert.equal(settled.remaining.length, 0);
  assert.equal(refill.length, 5);
  assert.deepEqual(board, before);
});

test('match-three films prove legal swaps, removals, gravity, real-date refills and cascades', () => {
  const calendar = fixture(30);
  const model = simulateMatch3(calendar);
  assert.deepEqual(model, simulateMatch3(calendar));
  assert.ok(model.turns.length > 0);
  assert.ok(model.cascades > 0);
  assert.equal(model.opening.length, 0);
  assert.equal(findMatchRuns(model.initial).length, 0);
  const matched = [];
  for (const turn of model.turns) {
    assert.equal(findMatchRuns(turn.before).length, 0);
    assert.equal(Math.abs(turn.swap.a.x - turn.swap.b.x) + Math.abs(turn.swap.a.y - turn.swap.b.y), 1);
    assert.ok(turn.resolutions.length >= 1);
    assert.deepEqual(turn.resolutions[0].before, turn.swapped);
    for (const [depth, resolution] of turn.resolutions.entries()) {
      assert.equal(resolution.depth, depth);
      assert.equal(resolution.matched.length, findMatchRuns(resolution.before).length);
      assert.ok(resolution.matched.length >= 3);
      const removedIds = new Set(resolution.matched.map(gem => gem.id));
      assert.ok(occupied(resolution.after).every(gem => !removedIds.has(gem.id)));
      assert.equal(occupied(resolution.after).length, occupied(resolution.before).length - resolution.matched.length + resolution.refilled.length);
      for (let x = 0; x < 8; x++) {
        const survivors = resolution.before.map(row => row[x]).filter(gem => gem && !removedIds.has(gem.id));
        const after = resolution.after.map(row => row[x]).filter(gem => gem && !resolution.refilled.some(refill => refill.id === gem.id));
        assert.deepEqual(after, survivors);
      }
      matched.push(...resolution.matched);
    }
  }
  assert.equal(model.matched, matched.length);
  assert.equal(new Set(matched.map(gem => gem.date)).size, matched.length);
  assert.equal(model.score, matched.reduce((sum, gem) => sum + gem.count, 0));
  const remaining = [...occupied(model.board), ...model.unused];
  assert.equal(remaining.length + matched.length, calendar.activeDays);
  assert.equal(remaining.reduce((sum, gem) => sum + gem.count, 0) + model.score, calendar.total);
  const dates = new Map(calendar.cells.map(day => [day.date, day]));
  for (const gem of [...matched, ...remaining]) {
    assert.equal(gem.count, dates.get(gem.date).count);
    assert.equal(gem.kind, dates.get(gem.date).level);
  }
});

test('mole hits and late misses follow the actual exposure window and conserve weekly score', () => {
  const calendar = fixture(30, index => index % 7 === 0 ? index + 1 : 0);
  const model = simulateMoles(calendar);
  assert.deepEqual(model, simulateMoles(calendar));
  assert.equal(model.attempts.length, 30);
  assert.equal(model.hits + model.misses, model.attempts.length);
  assert.ok(model.hits > 0 && model.misses > 0);
  let score = 0;
  for (const [index, attempt] of model.attempts.entries()) {
    assert.deepEqual([attempt.x, attempt.y], [MOLE_HOLES[attempt.hole].x, MOLE_HOLES[attempt.hole].y]);
    assert.equal(attempt.hit, attempt.strike < attempt.expires);
    if (!attempt.hit) assert.ok(attempt.end <= attempt.strike, 'a late hammer must strike an already hidden mole');
    assert.ok(attempt.strike > attempt.start && attempt.end > attempt.start);
    assert.ok(index === 0 || attempt.start > model.attempts[index - 1].strike);
    assert.ok(index === 0 || attempt.count >= model.attempts[index - 1].count);
    if (attempt.hit) score += attempt.count;
    assert.equal(attempt.score, score);
    const event = model.events.find(event => event.time === attempt.strike && event.type.startsWith('hammer-'));
    assert.equal(event.type, attempt.hit ? 'hammer-hit' : 'hammer-miss');
    assert.equal(event.value, attempt.hit ? attempt.count : 0);
  }
  assert.equal(model.score, score);
  assert.equal(model.attempts.reduce((sum, attempt) => sum + attempt.count, 0), calendar.total);
  assert.ok(model.attempts.at(-1).expires - model.attempts.at(-1).start < model.attempts[0].expires - model.attempts[0].start);
});

test('a genuine continuing streak can turn the same mole window and travel into a hit', () => {
  const broken = simulateMoles(fixture(2, index => index < 7 ? (index === 6 ? 0 : index === 0 ? 3 : 1) : 2));
  const continuing = simulateMoles(fixture(2, index => index < 7 ? 1 : 2));
  const slow = broken.attempts.find(attempt => attempt.week === 1);
  const quick = continuing.attempts.find(attempt => attempt.week === 1);
  assert.equal(broken.attempts[0].hole, continuing.attempts[0].hole);
  assert.equal(slow.hole, quick.hole);
  assert.equal(slow.count, quick.count);
  assert.ok(Math.abs((slow.expires - slow.start) - (quick.expires - quick.start)) < 1e-9);
  assert.equal(slow.streak, 7);
  assert.equal(quick.streak, 14);
  assert.ok(quick.reaction < slow.reaction);
  assert.equal(slow.hit, false);
  assert.equal(quick.hit, true);
});

test('empty and sparse histories preserve absence of source activity across all arcade models', () => {
  for (const calendar of [fixture(53, () => 0), fixture(2, index => index === 8 ? 3 : 0)]) {
    const pacman = simulatePacman(calendar);
    const tetris = simulateTetris(calendar);
    const match = simulateMatch3(calendar);
    const moles = simulateMoles(calendar);
    assert.equal(pacman.pellets.length, calendar.activeDays);
    assert.equal(tetris.drops.length, calendar.activeDays);
    assert.equal(moles.attempts.length, calendar.activeDays);
    assert.equal(match.tracks.length, calendar.activeDays);
    assert.equal(match.turns.length, 0);
    assert.equal(match.matched, 0);
    assert.equal(match.score, 0);
    if (!calendar.activeDays) {
      assert.equal(pacman.events.length, 0);
      assert.equal(tetris.blocks.length, 0);
      assert.equal(moles.score, 0);
      assert.equal(moles.events.length, 0);
    }
  }
});

test('all arcade scenes render valid bounded script-free films, themes and motion-free stills', () => {
  assert.deepEqual(arcadeScenes.map(scene => [scene.number, scene.id]), [['03', 'pacman'], ['04', 'tetris'], ['18', 'match3'], ['19', 'whack-a-mole']]);
  for (const calendar of [fixture(6), fixture(1, () => 0)]) for (const definition of arcadeScenes) {
    const film = definition.build(calendar);
    assert.ok(film.duration >= 5 && film.duration < 65);
    assert.ok(film.events.every((event, index) => Number.isFinite(event.time) && event.time >= 0 && event.time <= film.duration && (index === 0 || event.time >= film.events[index - 1].time)));
    assert.ok(film.checkpoints.every(time => time > 0 && time < film.duration));
    for (const theme of ['dark', 'light']) for (const animated of [true, false]) {
      const svg = film.render(theme, animated);
      assert.match(svg, /width="1120" height="448"/);
      assert.match(svg, /arcade&lt;&amp;&quot;/);
      assert.ok(!/NaN|Infinity|dur="0s"|<script|<foreignObject|javascript:/.test(svg));
      assert.ok(!/https?:\/\//.test(svg.replace('http://www.w3.org/2000/svg', '')));
      if (animated) assert.match(svg, /prefers-reduced-motion:reduce/);
      else assert.ok(!/<animate/.test(svg));
    }
  }
});
