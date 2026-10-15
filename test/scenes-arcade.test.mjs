import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCalendar } from '../lib/calendar.js';
import {
  arcadeScenes, simulatePacman, TETROMINOES, tetrominoRotations, tetrisFits, clearTetrisRows,
  simulateTetris, findMatchRuns, legalMatchSwaps, settleMatchBoard, simulateMatch3, simulateMoles,
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
  assert.ok(model.meals.every((pellet, index) => index === 0 || pellet.count >= model.meals[index - 1].count));
  for (let index = 2; index < model.points.length; index++) {
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
  assert.ok(model.meals.find(meal => meal.streak === 13).step < model.meals.find(meal => meal.streak === 1).step);
  assert.equal(model.meals.find(meal => meal.streak === 13).streak, 13);
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

test('Pac-Man keeps dates at their original weekday and week coordinates while its itinerary changes', () => {
  const calendar = fixture(3, index => index === 0 ? 90 : index === 10 ? 1 : index === 20 ? 15 : 0);
  const before = structuredClone(calendar);
  const model = simulatePacman(calendar);
  assert.deepEqual(calendar, before, 'planning must not mutate the source calendar');
  assert.equal(model.columns, calendar.columns);
  assert.deepEqual(model.pellets.map(pellet => pellet.date), calendar.cells.filter(cell => cell.count).map(cell => cell.date));
  assert.deepEqual(model.meals.map(meal => meal.count), [1, 15, 90]);
  for (const pellet of model.pellets) {
    const cell = calendar.cells.find(cell => cell.date === pellet.date);
    assert.deepEqual([pellet.column, pellet.row], [cell.column, cell.row]);
    assert.equal(pellet.x, 48 + (cell.column + .5) * 1024 / calendar.columns);
    assert.equal(pellet.y, 114 + cell.row * 19 + 7.25);
  }
  const changed = { ...calendar, cells: calendar.cells.map(cell => ({ ...cell, count: cell.count ? 100 - cell.count : 0 })) };
  const other = simulatePacman(changed);
  assert.deepEqual(other.pellets.map(({ date, column, row, x, y }) => ({ date, column, row, x, y })), model.pellets.map(({ date, column, row, x, y }) => ({ date, column, row, x, y })));
  assert.notDeepEqual(other.meals.map(meal => meal.date), model.meals.map(meal => meal.date));
  const withHole = { ...calendar, cells: calendar.cells.filter((_, index) => index !== 6) };
  assert.deepEqual(simulatePacman(withHole).pellets.map(({ date, column, row, x, y }) => ({ date, column, row, x, y })), model.pellets.map(({ date, column, row, x, y }) => ({ date, column, row, x, y })));
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

test('Tetris rejects floor, wall, stack and missing-date collisions', () => {
  const board = Array.from({ length: 7 }, () => Array(3).fill(null));
  const mask = board.map(row => row.map(() => true));
  const square = TETROMINOES.O;
  assert.equal(tetrisFits(board, square, 1, 5, mask), true);
  assert.equal(tetrisFits(board, square, 2, 5, mask), false);
  assert.equal(tetrisFits(board, square, -1, 5, mask), false);
  assert.equal(tetrisFits(board, square, 1, 6, mask), false);
  mask[6][2] = false;
  assert.equal(tetrisFits(board, square, 1, 5, mask), false);
  mask[6][2] = true;
  board[6][2] = 0;
  assert.equal(tetrisFits(board, square, 1, 5, mask), false);
});

test('Tetris line clearing counts only actual date slots and preserves missing-date barriers', () => {
  const board = [[null, 0, null], [1, 2, 3], [null, 4, null], [null, 5, null], [6, 7, 8]];
  const mask = [[true, true, true], [true, true, true], [false, true, true], [true, true, true], [true, true, true]];
  const before = structuredClone(board), originalMask = structuredClone(mask);
  const result = clearTetrisRows(board, mask);
  assert.deepEqual(result.rows, [1, 4]);
  assert.equal(occupied(result.board).length, occupied(board).length - 6);
  assert.equal(result.board[1][1], null);
  assert.equal(result.board[2][1], 0);
  assert.equal(result.board[3][1], 4);
  assert.equal(result.board[4][1], 5);
  assert.equal(result.board[2][0], null);
  assert.equal(result.board[3][0], null);
  assert.equal(result.board[4][0], null);
  assert.deepEqual(board, before);
  assert.deepEqual(mask, originalMask);
  const partial = clearTetrisRows([[9, null], [null, 2]], [[true, false], [false, true]]);
  assert.deepEqual(partial.rows, [0, 1]);
  assert.equal(occupied(partial.board).length, 0);
});

test('Tetris uses the original columns by seven rows, legal paths, stack collisions and genuine line clears', () => {
  const calendar = fixture(53), before = structuredClone(calendar), model = simulateTetris(calendar);
  assert.deepEqual(calendar, before);
  assert.deepEqual(model, simulateTetris(calendar));
  assert.equal(model.width, calendar.columns);
  assert.equal(model.height, 7);
  assert.equal(model.mask.flat().filter(Boolean).length, calendar.cells.length);
  assert.equal(model.drops.length + model.skipped.length, calendar.activeDays);
  assert.equal(model.contributions, calendar.total);
  assert.ok(model.lines > 0);
  for (const [index, drop] of model.drops.entries()) {
    assert.ok(tetrominoRotations(drop.kind).some(shape => shapeKey(shape) === shapeKey(drop.shape)));
    assert.ok(index === 0 || drop.count >= model.drops[index - 1].count);
    assert.ok(tetrisFits(drop.before, drop.shape, drop.x, drop.y, model.mask));
    assert.equal(tetrisFits(drop.before, drop.shape, drop.x, drop.y + 1, model.mask), false);
    for (let y = 0; y <= drop.y; y++) assert.ok(tetrisFits(drop.before, drop.shape, drop.x, y, model.mask));
    assert.equal(occupied(drop.landed).length, occupied(drop.before).length + 4);
    for (const point of drop.shape) assert.notEqual(drop.landed[drop.y + point.y][drop.x + point.x], null);
    const fullRows = drop.landed.flatMap((row, y) => row.every((id, x) => !model.mask[y][x] || id !== null) ? [y] : []);
    assert.deepEqual(drop.clearedRows, fullRows);
    assert.equal(occupied(drop.after).length, occupied(drop.landed).length - fullRows.reduce((sum, y) => sum + model.mask[y].filter(Boolean).length, 0));
    assert.deepEqual(drop.after, clearTetrisRows(drop.landed, model.mask).board);
  }
  assert.equal(model.lines, model.drops.reduce((sum, drop) => sum + drop.clearedRows.length, 0));
  for (const block of model.blocks) for (const point of block.points) {
    assert.ok(model.mask[point.y][point.x]);
    assert.ok(point.time >= block.start && point.time <= block.end);
  }
});

test('narrow and partial Tetris calendars never create substitute slots or impossible pieces', () => {
  const narrow = fixture(1, () => 2), model = simulateTetris(narrow);
  assert.equal(model.width, 1);
  assert.equal(model.height, 7);
  assert.ok(model.drops.length > 0);
  assert.ok(model.drops.every(drop => drop.kind === 'I' && drop.shape.every(point => point.x === 0)));
  const partial = { ...fixture(3), cells: fixture(3).cells.filter(cell => cell.column === 0 && cell.row >= 4) };
  const before = structuredClone(partial), rest = simulateTetris(partial);
  assert.deepEqual(partial, before);
  assert.equal(rest.mask.flat().filter(Boolean).length, 3);
  assert.equal(rest.drops.length, 0);
  assert.equal(rest.blocks.length, 0);
  assert.equal(rest.restarts, 0);
  assert.equal(rest.skipped.length, partial.cells.length);
  assert.ok(rest.events.every(event => event.type === 'no-piece-space'));
});

test('match detection unions crossing runs and excludes gaps and runs of two', () => {
  const board = gems([[2, 1, 3], [1, 1, 1], [3, 1, 2]]);
  assert.equal(findMatchRuns(board).length, 5);
  assert.equal(new Set(findMatchRuns(board).map(point => `${point.x},${point.y}`)).size, 5);
  assert.equal(findMatchRuns(gems([[1, 1, 0, 1, 1], [2, 3, 2, 3, 2]])).length, 0);
});

test('match-three proposes only adjacent swaps creating a run containing a moved gem', () => {
  const board = gems([[1, 2, 1], [3, 1, 4], [2, 3, 4]]), before = structuredClone(board);
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

test('match gravity preserves survivor order, never refills and cannot cross missing dates', () => {
  const board = gems([[1, 2], [0, 3], [2, 0], [0, 4], [3, 0], [0, 0], [0, 0]]);
  const mask = board.map(row => row.map(() => true));
  mask[3][0] = false;
  const before = structuredClone(board), settled = settleMatchBoard(board, mask);
  assert.equal(settled.board[1][0].id, board[0][0].id);
  assert.equal(settled.board[2][0].id, board[2][0].id);
  assert.equal(settled.board[3][0], null);
  assert.equal(settled.board[6][0].id, board[4][0].id);
  assert.deepEqual(settled.board.slice(4).map(row => row[1]).filter(Boolean), board.map(row => row[1]).filter(Boolean));
  assert.equal(occupied(settled.board).length, occupied(board).length);
  assert.deepEqual(settled.refilled, []);
  assert.deepEqual(settled.remaining, []);
  assert.deepEqual(board, before);
});

test('Match Three initial positions are the verbatim week/day graph, including zeros and missing slots', () => {
  const original = fixture(5, index => index % 3 === 0 ? 0 : index % 16 + 1);
  const calendar = { ...original, cells: original.cells.filter(cell => !(cell.column === 0 && cell.row < 3) && !(cell.column === 2 && cell.row === 4)) };
  const before = structuredClone(calendar), model = simulateMatch3(calendar);
  assert.deepEqual(calendar, before);
  assert.equal(model.width, calendar.columns);
  assert.equal(model.height, 7);
  assert.equal(model.initial.length, 7);
  assert.equal(model.initial[0].length, calendar.columns);
  assert.equal(model.unused.length, 0);
  assert.equal(model.tracks.length, calendar.cells.filter(cell => cell.count > 0).length);
  for (let row = 0; row < 7; row++) for (let column = 0; column < calendar.columns; column++) {
    const cell = calendar.cells.find(cell => cell.column === column && cell.row === row);
    assert.equal(model.mask[row][column], !!cell);
    const gem = model.initial[row][column];
    if (!cell || !cell.count) assert.equal(gem, null);
    else {
      assert.equal(gem.date, cell.date);
      assert.equal(gem.count, cell.count);
      assert.equal(gem.kind, cell.level);
      assert.deepEqual(model.tracks[gem.id].points[0], { time: 0, x: column, y: row });
    }
  }
});

function gridCalendar(grid) {
  return fixture(grid[0].length, index => { const kind = grid[index % 7][Math.floor(index / 7)]; return kind ? (kind - 1) * 4 + 1 : 0; });
}

test('match-three films perform legal lowest-total swaps and conserve all date gems and counts', () => {
  const calendar = gridCalendar([[1, 2, 1], [3, 1, 4], [2, 3, 4], [4, 2, 3], [2, 4, 1], [1, 3, 2], [3, 1, 4]]);
  const model = simulateMatch3(calendar);
  assert.deepEqual(model, simulateMatch3(calendar));
  assert.ok(model.turns.length > 0);
  assert.equal(model.opening.length, 0);
  const matched = [];
  const verifyResolution = resolution => {
    const positions = findMatchRuns(resolution.before);
    assert.deepEqual(resolution.matched.map(gem => gem.id).sort((a, b) => a - b), positions.map(point => resolution.before[point.y][point.x].id).sort((a, b) => a - b));
    assert.ok(resolution.matched.length >= 3);
    const removed = new Set(resolution.matched.map(gem => gem.id));
    assert.ok(occupied(resolution.after).every(gem => !removed.has(gem.id)));
    assert.equal(occupied(resolution.after).length, occupied(resolution.before).length - removed.size);
    assert.deepEqual(resolution.refilled, []);
    const removedBoard = resolution.before.map(row => row.map(gem => gem && removed.has(gem.id) ? null : gem));
    assert.deepEqual(resolution.after, settleMatchBoard(removedBoard, model.mask).board);
    matched.push(...resolution.matched);
  };
  for (const turn of model.turns) {
    assert.equal(findMatchRuns(turn.before).length, 0);
    assert.equal(Math.abs(turn.swap.a.x - turn.swap.b.x) + Math.abs(turn.swap.a.y - turn.swap.b.y), 1);
    const cost = swap => {
      const board = turn.before.map(row => [...row]);
      [board[swap.a.y][swap.a.x], board[swap.b.y][swap.b.x]] = [board[swap.b.y][swap.b.x], board[swap.a.y][swap.a.x]];
      return swap.matches.reduce((sum, point) => sum + board[point.y][point.x].count, 0);
    };
    assert.equal(cost(turn.swap), Math.min(...legalMatchSwaps(turn.before).map(cost)));
    assert.deepEqual(turn.resolutions[0].before, turn.swapped);
    turn.resolutions.forEach(verifyResolution);
  }
  assert.equal(new Set(matched.map(gem => gem.date)).size, matched.length);
  assert.equal(model.matched, matched.length);
  assert.equal(model.score, matched.reduce((sum, gem) => sum + gem.count, 0));
  const remaining = occupied(model.board);
  assert.equal(remaining.length + matched.length, calendar.activeDays);
  assert.equal(remaining.reduce((sum, gem) => sum + gem.count, 0) + model.score, calendar.total);
  for (const track of model.tracks) for (const point of track.points) assert.ok(model.mask[point.y][point.x]);
});

test('original natural runs resolve honestly and gravity can create a real cascade without a refill', () => {
  const calendar = gridCalendar([[2, 3, 4], [3, 4, 2], [4, 2, 3], [2, 3, 4], [1, 4, 3], [1, 3, 4], [1, 2, 2]]);
  const model = simulateMatch3(calendar);
  assert.equal(model.opening[0].matched.length, 3);
  assert.deepEqual(model.opening[0].matched.map(gem => [gem.column, gem.row]), [[0, 4], [0, 5], [0, 6]]);
  assert.ok(model.opening.length >= 2);
  assert.equal(model.opening[1].depth, 1);
  assert.equal(model.opening[1].matched.length, 3);
  assert.ok(model.cascades >= 1);
  assert.ok(model.opening.every(resolution => resolution.refilled.length === 0));
  assert.equal(model.initial[6][0].date, calendar.cells.find(cell => cell.column === 0 && cell.row === 6).date);
});

test('moles pop once per actual active date in ascending counts at the exact original tile', () => {
  const calendar = fixture(30, index => index % 3 ? index % 29 + 1 : 0), before = structuredClone(calendar), model = simulateMoles(calendar);
  assert.deepEqual(calendar, before);
  assert.deepEqual(model, simulateMoles(calendar));
  assert.equal(model.attempts.length, calendar.activeDays);
  assert.equal(new Set(model.attempts.map(attempt => attempt.date)).size, calendar.activeDays);
  assert.equal(model.hits + model.misses, calendar.activeDays);
  assert.ok(model.hits > 0 && model.misses > 0);
  let score = 0;
  for (const [index, attempt] of model.attempts.entries()) {
    const day = calendar.cells.find(day => day.date === attempt.date);
    assert.deepEqual([attempt.column, attempt.row, attempt.count], [day.column, day.row, day.count]);
    assert.equal(attempt.x, 48 + (day.column + .5) * 1024 / calendar.columns);
    assert.equal(attempt.y, 114 + day.row * 19 + 7.25);
    assert.equal(attempt.hit, attempt.strike < attempt.expires);
    if (!attempt.hit) assert.ok(attempt.end <= attempt.strike);
    assert.ok(index === 0 || attempt.count >= model.attempts[index - 1].count);
    if (attempt.hit) score += attempt.count;
    assert.equal(attempt.score, score);
    const event = model.events.find(event => event.time === attempt.strike && event.type.startsWith('hammer-'));
    assert.equal(event.type, attempt.hit ? 'hammer-hit' : 'hammer-miss');
    assert.equal(event.value, attempt.hit ? day.count : 0);
    assert.deepEqual([event.data.x, event.data.y, event.data.column, event.data.row], [attempt.x, attempt.y, day.column, day.row]);
    assert.deepEqual(model.hammer.find(point => point.time === attempt.strike), { time: attempt.strike, x: attempt.x, y: attempt.y });
  }
  assert.equal(model.score, score);
  assert.equal(model.attempts.reduce((sum, attempt) => sum + attempt.count, 0), calendar.total);
});

test('a real continuing streak turns the same date, travel and pop window from a miss into a hit', () => {
  const make = broken => simulateMoles(fixture(3, index => index === 5 && broken ? 0 : index < 13 ? 1 : index === 13 ? 37 : 40));
  const broken = make(true).attempts.find(attempt => attempt.date === '2026-01-17');
  const continuing = make(false).attempts.find(attempt => attempt.date === '2026-01-17');
  assert.deepEqual([broken.x, broken.y, broken.count], [continuing.x, continuing.y, continuing.count]);
  assert.ok(Math.abs((broken.expires - broken.start) - (continuing.expires - continuing.start)) < 1e-9);
  assert.equal(broken.streak, 8);
  assert.equal(continuing.streak, 14);
  assert.ok(continuing.reaction < broken.reaction);
  assert.equal(broken.hit, false);
  assert.equal(continuing.hit, true);
});

test('empty and sparse histories preserve missing dates, quiet zero tiles and absent activity', () => {
  for (const source of [fixture(53, () => 0), fixture(2, index => index === 8 ? 3 : 0)]) {
    const calendar = { ...source, cells: source.cells.filter(cell => !(cell.column === 0 && cell.row < 2)) };
    const before = structuredClone(calendar), pacman = simulatePacman(calendar), tetris = simulateTetris(calendar), match = simulateMatch3(calendar), moles = simulateMoles(calendar);
    assert.deepEqual(calendar, before);
    assert.equal(pacman.pellets.length, calendar.activeDays);
    assert.equal(moles.attempts.length, calendar.activeDays);
    assert.equal(match.tracks.length, calendar.activeDays);
    assert.equal(match.turns.length, 0);
    assert.equal(match.matched, 0);
    assert.equal(match.score, 0);
    assert.equal(tetris.mask.flat().filter(Boolean).length, calendar.cells.length);
    if (!calendar.activeDays) {
      assert.equal(pacman.events.length, 0);
      assert.equal(tetris.blocks.length, 0);
      assert.equal(moles.events.length, 0);
    }
  }
});

test('arcade films retain one exact permanent day mesh in every theme and motion mode', () => {
  assert.deepEqual(arcadeScenes.map(scene => [scene.number, scene.id]), [['03', 'pacman'], ['04', 'tetris'], ['18', 'match3'], ['19', 'whack-a-mole']]);
  for (const calendar of [fixture(6), fixture(1, () => 0)]) for (const definition of arcadeScenes) {
    const film = definition.build(calendar);
    assert.ok(film.duration >= 5 && film.duration < 400);
    assert.ok(film.events.every((event, index) => Number.isFinite(event.time) && event.time >= 0 && event.time <= film.duration && (index === 0 || event.time >= film.events[index - 1].time)));
    assert.ok(film.checkpoints.every(time => time > 0 && time < film.duration));
    for (const theme of ['dark', 'light']) for (const animated of [true, false]) {
      const svg = film.render(theme, animated);
      assert.match(svg, /width="1120" height="448"/);
      assert.match(svg, /arcade&lt;&amp;&quot;/);
      assert.equal((svg.match(/data-calendar-grid="true"/g) || []).length, 1);
      assert.equal((svg.match(/data-cell-date=/g) || []).length, calendar.cells.length);
      assert.ok(!/NaN|Infinity|dur="0s"|<script|<foreignObject|javascript:/.test(svg));
      assert.ok(!/https?:\/\//.test(svg.replace('http://www.w3.org/2000/svg', '')));
      if (animated) assert.match(svg, /prefers-reduced-motion:reduce/);
      else assert.ok(!/<animate/.test(svg));
    }
  }
});
