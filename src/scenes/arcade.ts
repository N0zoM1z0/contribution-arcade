import type { Calendar, Cell } from '../calendar.js';
import type { SceneDefinition, SceneEvent } from './types.js';
import { THEMES, colors, n, film, motion, text, visible, calendarActivity, calendarClears, center, discrete, type Theme } from './kit.js';

import { planCalendarMeals } from './route.js';

type Point = { x: number; y: number };
type TimedPoint = Point & { time: number };
const sortedDays = (calendar: Calendar): Cell[] => calendar.cells.filter(day => day.count > 0).sort((a, b) => a.count - b.count || a.date.localeCompare(b.date));

/** Streaks are computed from the actual dates, including gaps in partial calendars. */
function streaks(calendar: Calendar): Map<string, number> {
  const result = new Map<string, number>();
  let previous = 0;
  let streak = 0;
  for (const day of [...calendar.cells].sort((a, b) => a.date.localeCompare(b.date))) {
    const timestamp = Date.parse(`${day.date}T00:00:00Z`);
    streak = day.count > 0 ? (timestamp - previous === 86_400_000 ? streak + 1 : 1) : 0;
    result.set(day.date, streak);
    previous = timestamp;
  }
  return result;
}

function panel(x: number, y: number, width: number, height: number, theme: Theme): string {
  const p = THEMES[theme];
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="13" fill="${p.empty}" stroke="${p.border}"/>`;
}

/** Text changes use timed SVG groups, since SMIL cannot animate textContent. */
function changingText(x: number, y: number, frames: { time: number; value: string }[], duration: number, theme: Theme, animated: boolean, size = 15): string {
  const p = THEMES[theme];
  if (!animated) return text(x, y, frames.at(-1)?.value || '0', p.ink, size, 'class="mono"');
  return frames.map((frame, index) => `<g opacity="0">${visible(frame.time, frames[index + 1]?.time ?? duration, duration)}${text(x, y, frame.value, p.ink, size, 'class="mono"')}</g>`).join('');
}

function rotate(frames: { time: number; angle: number }[], duration: number, mode = 'linear'): string {
  return `<animateTransform attributeName="transform" type="rotate" values="${frames.map(frame => frame.angle).join(';')}" keyTimes="${frames.map(frame => (frame.time / duration).toFixed(6)).join(';')}" calcMode="${mode}" dur="${n(duration)}s" repeatCount="indefinite"/>`;
}

export interface PacmanPellet extends Cell, Point { time: number; streak: number; step: number }
export interface PacmanModel {
  columns: number;
  duration: number;
  /** Draw these in calendar order, never in the order of consumption. */
  pellets: PacmanPellet[];
  meals: PacmanPellet[];
  points: (TimedPoint & { column: number; row: number; direction: number })[];
  ghosts: { delay: number; points: TimedPoint[] }[];
  events: SceneEvent[];
}

/** The calendar stays fixed while a shortest-route planner visits count tiers. */
export function simulatePacman(calendar: Calendar): PacmanModel {
  const start = { column: 0, row: 8 };
  const dailyStreaks = streaks(calendar);
  const points: PacmanModel['points'] = [{ ...start, ...center(calendar, start), time: 0, direction: -90 }, { ...start, ...center(calendar, start), time: 1.4, direction: -90 }];
  const meals: PacmanPellet[] = [];
  const events: SceneEvent[] = [];
  let time = 1.4;
  for (const move of planCalendarMeals(calendar, start)) {
    const streak = move.meal ? dailyStreaks.get(move.meal.date) || 1 : meals.at(-1)?.streak || 1;
    const step = 0.115 / (1 + Math.min(streak - 1, 14) * 0.045);
    time += step;
    const position = center(calendar, move), last = points.at(-1)!;
    const direction = Math.atan2(move.row - last.row, move.column - last.column) * 180 / Math.PI;
    points.push({ column: move.column, row: move.row, ...position, time, direction });
    if (move.meal) {
      const pellet = { ...move.meal, ...position, time, streak, step };
      meals.push(pellet);
      events.push({ time, type: 'pellet', date: pellet.date, value: pellet.count, data: { column: pellet.column, row: pellet.row, x: pellet.x, y: pellet.y, streak, secondsPerCell: step } });
    }
  }
  const mealByDate = new Map(meals.map(meal => [meal.date, meal]));
  const pellets = calendar.cells.filter(cell => cell.count > 0).map(cell => mealByDate.get(cell.date)!);
  const ghosts = [0.7, 1.15, 1.6].map(delay => ({ delay, points: points.map(point => ({ x: point.x, y: point.y, time: point.time + delay })) }));
  const duration = Math.max(12, time + 3.1);
  for (const [ghost, chase] of ghosts.entries()) {
    for (const meal of meals) events.push({ time: meal.time + chase.delay, type: 'ghost-chase', date: meal.date, data: { ghost, x: meal.x, y: meal.y, trailDelay: chase.delay } });
  }
  return { columns: calendar.columns, duration, pellets, meals, points, ghosts, events: events.sort((a, b) => a.time - b.time) };
}

function pacmanDrawing(model: PacmanModel, theme: Theme, animated: boolean): string {
  const p = THEMES[theme];
  const pitch = 1024 / model.columns, size = Math.min(14.5, pitch - 3);
  const radius = Math.min(7.4, size * .48);
  const stillTime = model.meals[Math.floor(model.meals.length * .58)]?.time || 0;
  const stillPoint = [...model.points].reverse().find(point => point.time <= stillTime) || model.points[0];
  const tiers = [...new Set(model.meals.map(meal => meal.count))];
  const tierStart = (count: number) => model.meals.filter(meal => meal.count < count).at(-1)?.time || 0;
  const currentTier = model.meals.find(meal => meal.time > stillTime)?.count;
  const pellets = model.pellets.map(pellet => {
    if (!animated && pellet.time <= stillTime) return '';
    const start = tierStart(pellet.count), opacity = animated ? start ? '.3' : '1' : pellet.count === currentTier ? '1' : '.3';
    return `<circle cx="${n(pellet.x)}" cy="${n(pellet.y)}" r="${n(2.3 + Math.min(1.5, Math.log2(pellet.count + 1) * .24))}" fill="${p.colors[pellet.level]}" opacity="${opacity}" data-date="${pellet.date}" data-count="${pellet.count}" data-column="${pellet.column}" data-row="${pellet.row}" data-eaten-at="${n(pellet.time)}"><title>${pellet.date}: ${pellet.count} contributions</title>${animated ? discrete('opacity', [{ time: 0, value: opacity }, ...(start ? [{ time: start, value: '1' }] : []), { time: pellet.time, value: '0' }, { time: model.duration, value: opacity }], model.duration) : ''}</circle>`;
  }).join('');
  const open = `M0 0L${n(radius * .7)} ${n(-radius * .7)}A${n(radius)} ${n(radius)} 0 1 0 ${n(radius * .7)} ${n(radius * .7)}Z`;
  const shut = `M0 0L${n(radius)} -.3A${n(radius)} ${n(radius)} 0 1 0 ${n(radius)} .3Z`;
  const mouth = `<path d="${open}" fill="${p.accent}">${animated && model.meals.length ? `<animate attributeName="d" values="${open};${shut};${open}" dur=".22s" repeatCount="indefinite"/>` : ''}</path>`;
  const facing = animated ? rotate([{ time: 0, angle: -90 }, ...model.points.slice(2).map((point, index) => ({ time: model.points[index + 1].time, angle: point.direction })), { time: model.duration, angle: model.points.at(-1)!.direction }], model.duration, 'discrete') : '';
  const pacman = `<g data-actor="pacman" transform="translate(${n(stillPoint.x)} ${n(stillPoint.y)})">${animated ? motion(model.points, model.duration) : ''}<g transform="rotate(${stillPoint.direction})">${facing}${mouth}</g></g>`;
  const ghosts = model.meals.length ? model.ghosts.map((ghost, index) => {
    const target = [...model.points].reverse().find(point => point.time <= stillTime - ghost.delay) || model.points[0];
    const r = radius * .86, color = colors(theme)[index + 1];
    return `<g transform="translate(${n(target.x)} ${n(target.y)})" opacity="${animated ? 0 : .85}">${animated ? visible(1.4 + ghost.delay, model.duration, model.duration) + motion(ghost.points, model.duration) : ''}<path d="M${n(-r)} ${n(r)}V0a${n(r)} ${n(r)} 0 0 1 ${n(r * 2)} 0v${n(r)}l${n(-r * .5)} ${n(-r * .35)} ${n(-r * .5)} ${n(r * .35)} ${n(-r * .5)} ${n(-r * .35)}Z" fill="${color}"/><g fill="${p.background}"><ellipse cx="${n(-r * .35)}" cy="-1" rx="1.4" ry="2"/><ellipse cx="${n(r * .35)}" cy="-1" rx="1.4" ry="2"/></g><g fill="${p.ink}"><circle cx="${n(-r * .27)}" cy="-1" r=".7"/><circle cx="${n(r * .43)}" cy="-1" r=".7"/></g></g>`;
  }).join('') : '';
  const frames = [{ time: 0, value: `0 / ${model.meals.length} dates` }, ...model.meals.map((pellet, index) => ({ time: pellet.time, value: `${index + 1} / ${model.meals.length} dates · ${pellet.count} contributions` }))];
  const next = animated ? tiers.map(count => `<g>${visible(tierStart(count), model.meals.filter(meal => meal.count === count).at(-1)!.time, model.duration)}${text(48, 327, `NEXT · ${count} CONTRIBUTION${count === 1 ? '' : 'S'}`, p.secondary, 10, 'class="mono"')}</g>`).join('') : currentTier ? text(48, 327, `NEXT · ${currentTier} CONTRIBUTIONS`, p.secondary, 10, 'class="mono"') : '';
  return `<path d="M48 292H1072" stroke="${p.line}" stroke-dasharray="2 7"/>${pellets}${ghosts}${pacman}${next}${changingText(48, 356, animated ? frames : frames.filter(frame => frame.time <= stillTime), model.duration, theme, animated, 11)}${text(1072, 356, 'DATES STAY PUT · LOW COUNTS FIRST', p.muted, 9, 'text-anchor="end" class="mono"')}`;
}

export type TetrominoKind = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
export const TETROMINOES: Record<TetrominoKind, Point[]> = {
  I: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }],
  O: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
  T: [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
  S: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
  Z: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
  J: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
  L: [{ x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
};
const TETROMINO_KINDS = Object.keys(TETROMINOES) as TetrominoKind[];
export type CalendarMask = boolean[][];
export type TetrisBoard = (number | null)[][];
export interface TetrisBlock { id: number; kind: TetrominoKind; date: string; start: number; end: number; points: TimedPoint[] }
export interface TetrisDrop {
  kind: TetrominoKind; shape: Point[]; x: number; y: number; start: number; lock: number; clearAt: number;
  week: number; count: number; date: string; before: TetrisBoard; landed: TetrisBoard; after: TetrisBoard; clearedRows: number[];
}
export interface TetrisModel {
  width: number; height: number; mask: CalendarMask; duration: number; drops: TetrisDrop[]; blocks: TetrisBlock[]; events: SceneEvent[];
  board: TetrisBoard; lines: number; restarts: number; contributions: number; skipped: Cell[];
}
const cloneBoard = (board: TetrisBoard): TetrisBoard => board.map(row => [...row]);
const emptyTetris = (width: number, height: number): TetrisBoard => Array.from({ length: height }, () => Array<number | null>(width).fill(null));
const calendarMask = (calendar: Calendar): CalendarMask => {
  const mask = Array.from({ length: 7 }, () => Array<boolean>(calendar.columns).fill(false));
  for (const cell of calendar.cells) mask[cell.row][cell.column] = true;
  return mask;
};
const fullMask = (board: unknown[][]): CalendarMask => board.map(row => row.map(() => true));

/** Column segments are separated by missing dates. Gravity cannot cross them. */
function segments(mask: CalendarMask, column: number): number[][] {
  const result: number[][] = [];
  for (let row = 0; row < mask.length; row++) {
    if (!mask[row][column]) continue;
    const segment: number[] = [];
    while (row < mask.length && mask[row][column]) segment.push(row++);
    result.push(segment);
  }
  return result;
}

export function tetrominoRotations(kind: TetrominoKind): Point[][] {
  const result: Point[][] = [];
  let shape = TETROMINOES[kind].map(point => ({ ...point }));
  const key = (cells: Point[]) => [...cells].sort((a, b) => a.y - b.y || a.x - b.x).map(point => `${point.x},${point.y}`).join(';');
  for (let rotation = 0; rotation < 4; rotation++) {
    if (!result.some(existing => key(existing) === key(shape))) result.push(shape);
    const turned = shape.map(point => ({ x: -point.y, y: point.x }));
    const minX = Math.min(...turned.map(point => point.x));
    const minY = Math.min(...turned.map(point => point.y));
    shape = turned.map(point => ({ x: point.x - minX, y: point.y - minY }));
  }
  return result;
}

export function tetrisFits(board: TetrisBoard, shape: Point[], x: number, y: number, mask: CalendarMask = fullMask(board)): boolean {
  return shape.every(point => x + point.x >= 0 && x + point.x < (board[0]?.length || 0) && y + point.y >= 0 && y + point.y < board.length &&
    mask[y + point.y][x + point.x] && board[y + point.y][x + point.x] === null);
}

/** Complete weekday lines clear only real date slots; missing slots never move. */
export function clearTetrisRows(board: TetrisBoard, mask: CalendarMask = fullMask(board)): { board: TetrisBoard; rows: number[] } {
  const rows = board.flatMap((row, y) => mask[y].some(Boolean) && row.every((value, x) => !mask[y][x] || value !== null) ? [y] : []);
  const result = cloneBoard(board);
  if (!rows.length) return { board: result, rows };
  for (let x = 0; x < (board[0]?.length || 0); x++) for (const segment of segments(mask, x)) {
    const removed = segment.filter(y => rows.includes(y)).length;
    const kept = segment.filter(y => !rows.includes(y)).map(y => board[y][x]);
    const shifted = [...Array<number | null>(removed).fill(null), ...kept];
    segment.forEach((y, index) => { result[y][x] = shifted[index]; });
  }
  return { rows, board: result };
}

function chooseDrop(board: TetrisBoard, kind: TetrominoKind, mask: CalendarMask): { shape: Point[]; x: number; y: number } | undefined {
  let best: { shape: Point[]; x: number; y: number; score: number } | undefined;
  for (const shape of tetrominoRotations(kind)) {
    const width = Math.max(...shape.map(point => point.x)) + 1;
    for (let x = 0; x <= board[0].length - width; x++) {
      if (!tetrisFits(board, shape, x, 0, mask)) continue;
      let y = 0;
      while (tetrisFits(board, shape, x, y + 1, mask)) y++;
      const landed = cloneBoard(board);
      for (const point of shape) landed[y + point.y][x + point.x] = -1;
      const cleared = clearTetrisRows(landed, mask);
      const heights = Array.from({ length: board[0].length }, (_, column) => {
        const top = cleared.board.findIndex((row, rowIndex) => mask[rowIndex][column] && row[column] !== null);
        return top < 0 ? 0 : board.length - top;
      });
      let holes = 0;
      for (let column = 0; column < heights.length; column++) for (let row = board.length - heights[column]; row < board.length; row++) {
        if (mask[row][column] && cleared.board[row][column] === null) holes++;
      }
      const bumpiness = heights.slice(1).reduce((sum, value, index) => sum + Math.abs(value - heights[index]), 0);
      const score = cleared.rows.length * board[0].length * 1.8 - heights.reduce((sum, value) => sum + value, 0) * .51 - holes * 3.6 - bumpiness * .24 - Math.max(...heights) * .1;
      if (!best || score > best.score) best = { shape, x, y, score };
    }
  }
  return best;
}

/** Activity supplies pieces; their board is exactly the original seven-row graph. */
export function simulateTetris(calendar: Calendar): TetrisModel {
  const width = calendar.columns, height = 7, mask = calendarMask(calendar);
  let board = emptyTetris(width, height);
  const drops: TetrisDrop[] = [], blocks: TetrisBlock[] = [], events: SceneEvent[] = [];
  const days = sortedDays(calendar), skipped: Cell[] = [];
  const peak = Math.max(1, ...days.map(day => day.count));
  const tempo = Math.min(1, 48 / Math.max(1, days.length));
  let time = 1.4, lines = 0, restarts = 0;
  for (const day of days) {
    const firstKind = (day.count + day.row + day.column) % TETROMINO_KINDS.length;
    const choices = [...TETROMINO_KINDS.slice(firstKind), ...TETROMINO_KINDS.slice(0, firstKind)];
    const select = () => {
      for (const kind of choices) {
        const placement = chooseDrop(board, kind, mask);
        if (placement) return { kind, ...placement };
      }
      return undefined;
    };
    let choice = select();
    if (!choice) {
      const empty = emptyTetris(width, height);
      const canStart = choices.some(kind => chooseDrop(empty, kind, mask));
      if (!canStart) {
        skipped.push(day);
        events.push({ time, type: 'no-piece-space', date: day.date, value: day.count, data: { columns: width, rows: height } });
        continue;
      }
      events.push({ time, type: 'top-out', date: day.date, data: { round: restarts + 1 } });
      for (const row of board) for (const id of row) if (id !== null) blocks[id].end = time;
      board = empty;
      restarts++;
      time += .45 * tempo;
      events.push({ time, type: 'restart', data: { round: restarts + 1 } });
      choice = select()!;
    }
    const { kind, shape, x, y } = choice;
    const before = cloneBoard(board), start = time;
    const lock = start + (.65 - .25 * day.count / peak) * tempo;
    const clearAt = lock + .13 * tempo;
    for (const point of shape) {
      const id = blocks.length;
      blocks.push({ id, kind, date: day.date, start, end: Infinity, points: [{ time: start, x: x + point.x, y: point.y }, { time: lock, x: x + point.x, y: y + point.y }] });
      board[y + point.y][x + point.x] = id;
    }
    const landed = cloneBoard(board), cleared = clearTetrisRows(board, mask);
    const drop: TetrisDrop = { kind, shape, x, y, start, lock, clearAt, week: day.column, count: day.count, date: day.date,
      before, landed, after: cloneBoard(cleared.board), clearedRows: cleared.rows };
    drops.push(drop);
    events.push({ time: start, type: 'spawn', date: day.date, value: day.count, data: { kind, sourceColumn: day.column, sourceRow: day.row, shape } });
    events.push({ time: lock, type: 'lock', date: day.date, value: 4, data: { kind, x, y, blocks: shape.map(point => ({ column: x + point.x, row: y + point.y })) } });
    if (cleared.rows.length) {
      lines += cleared.rows.length;
      const removedBlocks = cleared.rows.reduce((sum, row) => sum + mask[row].filter(Boolean).length, 0);
      events.push({ time: clearAt, type: 'row-clear', date: day.date, value: cleared.rows.length, data: { rows: cleared.rows, lines, removedBlocks } });
      const destinations = new Map(cleared.board.flatMap((row, rowIndex) => row.flatMap((id, column) => id === null ? [] : [[id, { x: column, y: rowIndex }] as const])));
      for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
        const id = board[row][column];
        if (id === null) continue;
        const destination = destinations.get(id);
        if (!destination) blocks[id].end = clearAt;
        else if (destination.y !== row) blocks[id].points.push({ time: clearAt, x: column, y: row }, { time: clearAt + .12 * tempo, ...destination });
      }
    }
    board = cleared.board;
    time = clearAt + (cleared.rows.length ? .25 : .1) * tempo;
  }
  const duration = Math.max(7, time + 1.6);
  for (const block of blocks) if (!Number.isFinite(block.end)) block.end = duration;
  return { width, height, mask, duration, drops, blocks, events, board, lines, restarts, contributions: drops.reduce((sum, drop) => sum + drop.count, 0), skipped };
}

function tetrisDrawing(calendar: Calendar, model: TetrisModel, theme: Theme, animated: boolean): string {
  const p = THEMES[theme], size = Math.min(16.5, 1024 / calendar.columns - 1);
  const pieceColor = (kind: TetrominoKind) => [...colors(theme), p.colors[2], p.colors[4]][TETROMINO_KINDS.indexOf(kind)];
  const outline = (kind: TetrominoKind) => `<rect x="${n(-size / 2)}" y="${n(-size / 2)}" width="${n(size)}" height="${n(size)}" rx="3.5" fill="none" stroke="${pieceColor(kind)}" stroke-width="2"/><path d="M-3 -3H3V3" fill="none" stroke="${pieceColor(kind)}" stroke-width="1"/>`;
  const stack = animated ? model.blocks.map(block => `<g data-tetris-block="${block.id}" data-source-date="${block.date}" opacity="0">${visible(block.start, block.end, model.duration)}<g>${motion(block.points.map(point => ({ time: point.time, ...center(calendar, { column: point.x, row: point.y }) })), model.duration)}${outline(block.kind)}</g></g>`).join('') :
    model.board.map((row, y) => row.map((id, x) => id === null ? '' : `<g data-tetris-block="${id}" transform="translate(${n(center(calendar, { column: x, row: y }).x)} ${n(center(calendar, { column: x, row: y }).y)})">${outline(model.blocks[id].kind)}</g>`).join('')).join('');
  const flashes = animated ? model.drops.filter(drop => drop.clearedRows.length).map(drop => `<g data-row-clear="${drop.clearedRows.join(',')}" opacity="0" stroke="${p.accent}" stroke-width="2" fill="none">${visible(drop.lock + .015, drop.clearAt, model.duration)}${calendar.cells.filter(cell => drop.clearedRows.includes(cell.row)).map(cell => { const point = center(calendar, cell); return `<circle cx="${n(point.x)}" cy="${n(point.y)}" r="${n(size * .56)}"/>`; }).join('')}</g>`).join('') : '';
  const frames = [{ time: 0, value: '0 completed weekday lines' }, ...model.events.filter(event => event.type === 'row-clear').map(event => ({ time: event.time, value: `${event.data!.lines} completed weekday lines` }))];
  const sources = [{ time: 0, value: model.skipped.length ? 'No legal four-block drop fits these date slots.' : 'Complete a line to clear its calendar tiles.' }, ...model.drops.map(drop => ({ time: drop.start, value: `${drop.kind} piece · ${drop.date} · ${drop.count} contributions` }))];
  return `${calendarActivity(calendar, theme, .78, { duration: model.duration, clears: calendarClears(calendar, model.events), animated, stillTime: model.duration })}${stack}${flashes}${panel(48, 289, 1024, 69, theme)}${text(66, 311, 'TETRIS / SEVEN WEEKDAYS', p.secondary, 10, 'letter-spacing="1.2"')}${changingText(66, 339, frames, model.duration, theme, animated, 18)}${changingText(505, 313, sources, model.duration, theme, animated, 11)}${text(505, 339, `${model.drops.length} planned date pieces · ${model.restarts} restarts · ${model.skipped.length} without drop space`, p.muted, 10)}`;
}

export interface MatchGem { id: number; date: string; count: number; kind: number; column?: number; row?: number }
export type MatchBoard = (MatchGem | null)[][];
export interface MatchSwap { a: Point; b: Point; matches: Point[] }
export interface GemTrack extends MatchGem { start: number; end: number; points: TimedPoint[] }
export interface MatchResolution { time: number; depth: number; matched: MatchGem[]; before: MatchBoard; after: MatchBoard; refilled: MatchGem[] }
export interface MatchTurn { time: number; swap: MatchSwap; before: MatchBoard; swapped: MatchBoard; resolutions: MatchResolution[] }
export interface MatchModel {
  width: number; height: number; mask: CalendarMask; duration: number; initial: MatchBoard; board: MatchBoard; turns: MatchTurn[]; opening: MatchResolution[];
  tracks: GemTrack[]; events: SceneEvent[]; score: number; matched: number; cascades: number; unused: MatchGem[];
}
const cloneMatch = (board: MatchBoard): MatchBoard => board.map(row => [...row]);

/** Union of horizontal and vertical runs; crossing gems are counted once. */
export function findMatchRuns(board: MatchBoard): Point[] {
  const found = new Map<string, Point>(), rows = board.length, columns = board[0]?.length || 0;
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    const gem = board[y][x];
    if (!gem) continue;
    if (x === 0 || board[y][x - 1]?.kind !== gem.kind) {
      let end = x;
      while (end < columns && board[y][end]?.kind === gem.kind) end++;
      if (end - x >= 3) for (let column = x; column < end; column++) found.set(`${column},${y}`, { x: column, y });
    }
    if (y === 0 || board[y - 1][x]?.kind !== gem.kind) {
      let end = y;
      while (end < rows && board[end][x]?.kind === gem.kind) end++;
      if (end - y >= 3) for (let row = y; row < end; row++) found.set(`${x},${row}`, { x, y: row });
    }
  }
  return [...found.values()];
}

/** Only adjacent swaps creating a new run containing a moved gem are legal. */
export function legalMatchSwaps(board: MatchBoard): MatchSwap[] {
  const swaps: MatchSwap[] = [];
  const previous = new Set(findMatchRuns(board).map(point => `${point.x},${point.y}`));
  for (let y = 0; y < board.length; y++) for (let x = 0; x < board[y].length; x++) for (const b of [{ x: x + 1, y }, { x, y: y + 1 }]) {
    const a = { x, y }, first = board[y][x], second = board[b.y]?.[b.x];
    if (!first || !second || first.kind === second.kind) continue;
    const copy = cloneMatch(board);
    copy[y][x] = second;
    copy[b.y][b.x] = first;
    const matches = findMatchRuns(copy);
    if (matches.some(point => !previous.has(`${point.x},${point.y}`) && (point.x === a.x && point.y === a.y || point.x === b.x && point.y === b.y))) swaps.push({ a, b, matches });
  }
  return swaps;
}

/** Empty dates accept falling gems, but missing dates are barriers. No refill exists. */
export function settleMatchBoard(board: MatchBoard, mask: CalendarMask = fullMask(board)): { board: MatchBoard; refilled: MatchGem[]; remaining: MatchGem[] } {
  const result = cloneMatch(board);
  for (let x = 0; x < (board[0]?.length || 0); x++) for (const segment of segments(mask, x)) {
    const survivors = segment.map(y => board[y][x]).filter((gem): gem is MatchGem => gem !== null);
    const missing = segment.length - survivors.length;
    segment.forEach((y, index) => { result[y][x] = index < missing ? null : survivors[index - missing]; });
  }
  return { board: result, refilled: [], remaining: [] };
}

/** Start from the graph verbatim. Every gem is present; no dates wait off-board. */
export function simulateMatch3(calendar: Calendar): MatchModel {
  const width = calendar.columns, height = 7, mask = calendarMask(calendar);
  let board: MatchBoard = Array.from({ length: height }, () => Array<MatchGem | null>(width).fill(null));
  const tracks: GemTrack[] = [];
  for (const cell of calendar.cells) if (cell.count > 0) {
    const gem: MatchGem = { id: tracks.length, date: cell.date, count: cell.count, kind: Math.max(1, cell.level), column: cell.column, row: cell.row };
    board[cell.row][cell.column] = gem;
    tracks.push({ ...gem, start: 0, end: Infinity, points: [{ time: 0, x: cell.column, y: cell.row }] });
  }
  const initial = cloneMatch(board), turns: MatchTurn[] = [], opening: MatchResolution[] = [], events: SceneEvent[] = [];
  let time = 1.6, score = 0, matched = 0, cascades = 0;
  const resolve = (): MatchResolution[] => {
    const resolutions: MatchResolution[] = [];
    let positions = findMatchRuns(board), depth = 0;
    while (positions.length) {
      const before = cloneMatch(board), removed = positions.map(point => board[point.y][point.x]!);
      const removedIds = new Set(removed.map(gem => gem.id));
      for (const point of positions) {
        const gem = board[point.y][point.x]!;
        tracks[gem.id].end = time + .2;
        board[point.y][point.x] = null;
        score += gem.count;
        matched++;
        events.push({ time, type: 'gem-match', date: gem.date, value: gem.count, data: { depth, column: point.x, row: point.y, originalColumn: gem.column, originalRow: gem.row } });
      }
      if (depth > 0) { cascades++; events.push({ time, type: 'cascade', value: removed.length, data: { depth } }); }
      const settled = settleMatchBoard(board, mask);
      const oldPositions = new Map(before.flatMap((row, y) => row.flatMap((gem, x) => gem && !removedIds.has(gem.id) ? [[gem.id, { x, y }] as const] : [])));
      const falls: { date: string; column: number; fromRow: number; row: number }[] = [];
      settled.board.forEach((row, y) => row.forEach((gem, x) => {
        if (!gem) return;
        const old = oldPositions.get(gem.id)!;
        if (old.y !== y) {
          tracks[gem.id].points.push({ time: time + .23, ...old }, { time: time + .6, x, y });
          falls.push({ date: gem.date, column: x, fromRow: old.y, row: y });
        }
      }));
      resolutions.push({ time, depth, matched: removed, before, after: cloneMatch(settled.board), refilled: [] });
      events.push({ time: time + .6, type: 'gravity', value: falls.length, data: { depth, falls, refilledDates: [] } });
      board = settled.board;
      time += .82;
      depth++;
      positions = findMatchRuns(board);
    }
    return resolutions;
  };
  opening.push(...resolve());
  const swapCost = (swap: MatchSwap): number => {
    const copy = cloneMatch(board);
    [copy[swap.a.y][swap.a.x], copy[swap.b.y][swap.b.x]] = [copy[swap.b.y][swap.b.x], copy[swap.a.y][swap.a.x]];
    return swap.matches.reduce((sum, point) => sum + copy[point.y][point.x]!.count, 0);
  };
  while (turns.length < 40) {
    const swaps = legalMatchSwaps(board).sort((a, b) => swapCost(a) - swapCost(b) || a.a.y - b.a.y || a.a.x - b.a.x || a.b.y - b.b.y);
    if (!swaps.length) break;
    const swap = swaps[0], cost = swapCost(swap), before = cloneMatch(board), first = board[swap.a.y][swap.a.x]!, second = board[swap.b.y][swap.b.x]!;
    tracks[first.id].points.push({ time, ...swap.a }, { time: time + .32, ...swap.b });
    tracks[second.id].points.push({ time, ...swap.b }, { time: time + .32, ...swap.a });
    board[swap.a.y][swap.a.x] = second;
    board[swap.b.y][swap.b.x] = first;
    events.push({ time, type: 'swap', value: cost, data: { a: swap.a, b: swap.b, dates: [first.date, second.date], matchSize: swap.matches.length } });
    const turn: MatchTurn = { time, swap, before, swapped: cloneMatch(board), resolutions: [] };
    time += .45;
    turn.resolutions = resolve();
    turns.push(turn);
    time += .28;
  }
  events.push({ time, type: legalMatchSwaps(board).length ? 'turn-limit' : 'no-moves', value: score });
  const duration = Math.max(7, time + 1.5);
  for (const track of tracks) if (!Number.isFinite(track.end)) track.end = duration;
  return { width, height, mask, duration, initial, board, turns, opening, tracks, events: events.sort((a, b) => a.time - b.time), score, matched, cascades, unused: [] };
}

function matchDrawing(calendar: Calendar, model: MatchModel, theme: Theme, animated: boolean): string {
  const p = THEMES[theme], radius = Math.min(6, (1024 / calendar.columns - 4) / 2), tileSize = Math.min(14.5, 1024 / calendar.columns - 3);
  const gem = (item: MatchGem) => `<title>${item.date}: ${item.count} contributions</title><rect x="${n(-tileSize / 2)}" y="${n(-tileSize / 2)}" width="${n(tileSize)}" height="${n(tileSize)}" rx="3" fill="${p.colors[item.kind]}"/><path d="M0 ${n(-radius)}L${n(radius)} 0 0 ${n(radius)} ${n(-radius)} 0Z" fill="${p.colors[item.kind]}" stroke="${p.ink}" stroke-width=".65" stroke-opacity=".6"/><circle r="1.1" fill="${p.background}"/>`;
  const moving = animated ? model.tracks.map(track => `<g data-gem-date="${track.date}" data-original-column="${track.column}" data-original-row="${track.row}" opacity="0">${visible(track.start, track.end, model.duration)}<g>${motion(track.points.map(point => ({ time: point.time, ...center(calendar, { column: point.x, row: point.y }) })), model.duration)}${gem(track)}</g></g>`).join('') :
    model.initial.map((row, y) => row.map((item, x) => item ? `<g data-gem-date="${item.date}" data-original-column="${x}" data-original-row="${y}" transform="translate(${n(center(calendar, { column: x, row: y }).x)} ${n(center(calendar, { column: x, row: y }).y)})">${gem(item)}</g>` : '').join('')).join('');
  const highlights = animated ? model.turns.map(turn => `<g data-match-swap="${n(turn.time)}" opacity="0" stroke="${p.accent}" stroke-width="1.7" fill="none">${visible(turn.time - .1, turn.time + .4, model.duration)}${[turn.swap.a, turn.swap.b].map(point => { const at = center(calendar, { column: point.x, row: point.y }); return `<circle cx="${n(at.x)}" cy="${n(at.y)}" r="8"/>`; }).join('')}</g>`).join('') : '';
  let score = 0, matched = 0, swaps = 0;
  const frames = [{ time: 0, value: '0 contributions · 0 matched dates' }], moves = [{ time: 0, value: `${calendar.activeDays} dates in their original slots` }];
  for (const event of model.events) {
    if (event.type === 'gem-match') {
      score += event.value || 0; matched++;
      const value = `${score} contributions · ${matched} matched dates`;
      if (frames.at(-1)!.time === event.time) frames.at(-1)!.value = value;
      else frames.push({ time: event.time, value });
    } else if (event.type === 'swap') moves.push({ time: event.time, value: `${++swaps} adjacent swaps · lowest legal match total first` });
    else if (event.type === 'cascade') moves.push({ time: event.time, value: `Cascade ×${Number(event.data!.depth) + 1} · gravity continues the match` });
    else if (event.type === 'gravity') moves.push({ time: event.time, value: `Gravity settled · ${calendar.activeDays - matched} gems remain · no refills` });
    else if (event.type === 'no-moves') moves.push({ time: event.time, value: `No legal swaps remain · ${calendar.activeDays - matched} gems left` });
  }
  return `${moving}${highlights}${panel(48, 289, 1024, 69, theme)}${text(66, 310, 'MATCH THREE / ORIGINAL DATE GEMS', p.secondary, 10, 'letter-spacing="1"')}${changingText(66, 339, animated ? frames : frames.slice(0, 1), model.duration, theme, animated, 18)}${changingText(611, 311, animated ? moves : moves.slice(0, 1), model.duration, theme, animated, 11)}${text(611, 338, 'Real intensity matches · no reserve or fabricated refills', p.muted, 10)}`;
}

export interface MoleAttempt {
  column: number; row: number; date: string; count: number; level: number; x: number; y: number; start: number; strike: number;
  expires: number; end: number; hit: boolean; streak: number; reaction: number; score: number;
}
export interface MoleModel { duration: number; attempts: MoleAttempt[]; hammer: TimedPoint[]; events: SceneEvent[]; score: number; hits: number; misses: number }

/** Each actual active date is its own burrow, at its original calendar location. */
export function simulateMoles(calendar: Calendar): MoleModel {
  const days = sortedDays(calendar), dailyStreaks = streaks(calendar), peak = Math.max(1, ...days.map(day => day.count));
  const tempo = Math.min(2, 96 / Math.max(1, days.length));
  const attempts: MoleAttempt[] = [], hammer: TimedPoint[] = [{ time: 0, x: 65, y: 310 }], events: SceneEvent[] = [];
  let time = 1.4, score = 0, previous = { x: 65, y: 310 };
  for (const day of days) {
    const point = center(calendar, day), streak = dailyStreaks.get(day.date) || 1;
    const reaction = Math.max(.17, .24 + Math.hypot(point.x - previous.x, point.y - previous.y) / 2300 - Math.min(streak, 14) * .006) * tempo;
    const expires = time + (.66 - .51 * day.count / peak) * tempo, strike = time + reaction;
    const hit = strike < expires;
    if (hit) score += day.count;
    const end = hit ? strike + .12 * tempo : expires;
    const attempt: MoleAttempt = { column: day.column, row: day.row, date: day.date, count: day.count, level: day.level, ...point,
      start: time, strike, expires, end, hit, streak, reaction, score };
    attempts.push(attempt);
    events.push({ time, type: 'mole-pop', date: day.date, value: day.count, data: { column: day.column, row: day.row, x: point.x, y: point.y, expires, streak } });
    events.push({ time: strike, type: hit ? 'hammer-hit' : 'hammer-miss', date: day.date, value: hit ? day.count : 0,
      data: { column: day.column, row: day.row, x: point.x, y: point.y, score, reaction, window: expires - time } });
    hammer.push({ time, x: previous.x, y: previous.y - 10 }, { time: strike - .075 * tempo, x: point.x, y: point.y - 16 },
      { time: strike, ...point }, { time: strike + .1 * tempo, x: point.x, y: point.y - 10 });
    previous = point;
    time = Math.max(expires, strike + .1 * tempo) + .13 * tempo;
  }
  return { duration: Math.max(7, time + 1.4), attempts, hammer, events: events.sort((a, b) => a.time - b.time), score,
    hits: attempts.filter(attempt => attempt.hit).length, misses: attempts.filter(attempt => !attempt.hit).length };
}

function moleFace(theme: Theme, radius: number): string {
  const p = THEMES[theme];
  return `<g fill="${p.secondary}"><circle cx="${n(-radius * .74)}" cy="${n(-radius * .5)}" r="${n(radius * .4)}"/><circle cx="${n(radius * .74)}" cy="${n(-radius * .5)}" r="${n(radius * .4)}"/><ellipse rx="${n(radius)}" ry="${n(radius * 1.02)}"/></g><ellipse cy="${n(radius * .32)}" rx="${n(radius * .72)}" ry="${n(radius * .48)}" fill="${p.accent}"/><g fill="${p.background}"><circle cx="${n(-radius * .35)}" cy="${n(-radius * .2)}" r="${n(radius * .13)}"/><circle cx="${n(radius * .35)}" cy="${n(-radius * .2)}" r="${n(radius * .13)}"/><ellipse cy="${n(radius * .2)}" rx="${n(radius * .2)}" ry="${n(radius * .15)}"/></g>`;
}

function moleDrawing(calendar: Calendar, model: MoleModel, theme: Theme, animated: boolean): string {
  const p = THEMES[theme], radius = Math.min(6.1, (1024 / calendar.columns - 3) * .44);
  const still = model.attempts.at(-1), tempo = Math.min(2, 96 / Math.max(1, model.attempts.length));
  const pop = (attempt: MoleAttempt) => `<g data-mole-date="${attempt.date}" data-column="${attempt.column}" data-row="${attempt.row}" data-count="${attempt.count}" data-start="${n(attempt.start)}" data-strike="${n(attempt.strike)}" transform="translate(${n(attempt.x)} ${n(attempt.y)})"${animated ? ' opacity="0"' : ''}>${animated ? visible(attempt.start, attempt.end, model.duration) : ''}<title>${attempt.date}: ${attempt.count} contributions</title><circle r="8.1" fill="none" stroke="${p.accent}" stroke-width="1.1"/><g>${animated ? motion([{ time: attempt.start, x: 0, y: 6 }, { time: attempt.start + .09 * tempo, x: 0, y: -2 }, { time: attempt.end - .065 * tempo, x: 0, y: -2 }, { time: attempt.end, x: 0, y: 6 }], model.duration) : ''}${moleFace(theme, radius)}</g></g>`;
  const moles = animated ? model.attempts.map(pop).join('') : still ? pop(still) : '';
  const hammerAngle = [{ time: 0, angle: -25 }, ...model.attempts.flatMap(attempt => [{ time: attempt.strike - .075 * tempo, angle: -35 }, { time: attempt.strike, angle: 12 }, { time: attempt.strike + .1 * tempo, angle: -25 }]), { time: model.duration, angle: -25 }];
  const at = still || { x: 65, y: 310 };
  const hammer = `<g data-actor="hammer" transform="translate(${n(at.x)} ${n(at.y - 12)})">${animated ? motion(model.hammer, model.duration) : ''}<g>${animated ? rotate(hammerAngle, model.duration) : ''}<rect x="-1.5" y="-3" width="3" height="18" rx="1.5" fill="${p.accent}"/><rect x="-8" y="-7" width="16" height="7" rx="2.5" fill="${p.ink}"/><path d="M-5 -5H5" stroke="${p.background}" opacity=".3"/></g></g>`;
  const results = animated ? model.attempts.map(attempt => `<g data-hammer-result="${attempt.hit ? 'hit' : 'miss'}" opacity="0">${visible(attempt.strike, Math.min(model.duration, attempt.strike + .28 * tempo), model.duration)}${text(1072, 278, attempt.hit ? `+${attempt.count}` : 'MISS', attempt.hit ? p.accent : p.muted, 12, 'text-anchor="end" class="mono"')}</g>`).join('') : '';
  const scores = [{ time: 0, value: '0 contributions banked' }, ...model.attempts.map(attempt => ({ time: attempt.strike, value: `${attempt.score} contributions banked` }))];
  let hits = 0, misses = 0;
  const counters = [{ time: 0, value: '0 hits · 0 misses' }, ...model.attempts.map(attempt => ({ time: attempt.strike, value: `${attempt.hit ? ++hits : hits} hits · ${attempt.hit ? misses : ++misses} misses` }))];
  const source = [{ time: 0, value: 'Each mole appears on its own original date tile.' }, ...model.attempts.map(attempt => ({ time: attempt.start, value: `${attempt.date} · ${attempt.count} contributions · streak ${attempt.streak}` }))];
  return `${calendarActivity(calendar, theme, .82, { duration: model.duration, clears: calendarClears(calendar, model.events), animated, stillTime: model.attempts.at(-1)?.start ?? 0 })}${moles}${hammer}${results}${panel(48, 289, 1024, 69, theme)}${text(66, 311, 'WHACK A DATE / LOW COUNTS FIRST', p.secondary, 10, 'letter-spacing="1"')}${changingText(66, 339, scores, model.duration, theme, animated, 18)}${changingText(510, 312, source, model.duration, theme, animated, 10)}${changingText(510, 340, counters, model.duration, theme, animated, 13)}<g transform="translate(1002 323)">${moleFace(theme, 22)}</g>`;
}

const pacman: SceneDefinition = {
  id: 'pacman', number: '03', title: 'Pac-Man', category: 'Arcade',
  caption: 'Date pellets, hungry turns, and ghosts on your trail.',
  description: 'The original contribution dates stay fixed at their actual week and weekday coordinates. Pac-Man follows planned adjacent routes to eat lower contribution counts first. Actual consecutive-day streaks increase his pace, and three ghosts pursue the same connected calendar trail.',
  build(calendar) {
    const model = simulatePacman(calendar);
    return film(calendar, pacman, { duration: model.duration, events: model.events, metrics: { pellets: model.pellets.length, contributions: model.pellets.reduce((sum, pellet) => sum + pellet.count, 0), ghosts: model.pellets.length ? 3 : 0, ordering: 'contribution-count' }, stillTime: model.meals[Math.floor(model.meals.length * .58)]?.time ?? 0, checkpoints: [1.4, model.duration * 0.52, model.duration - 2], draw: (theme, animated) => pacmanDrawing(model, theme, animated) });
  },
};
const tetris: SceneDefinition = {
  id: 'tetris', number: '04', title: 'Tetris', category: 'Arcade',
  caption: 'Legal pieces fall through the original seven-row calendar.',
  description: 'Active dates supply legal tetrominoes, with lower contribution counts first. The board has the original calendar width and seven weekday rows. Missing dates are unavailable. Pieces collide with the stack, full weekday lines clear, and cleared calendar tiles disappear with the piece outlines. If no legal piece fits, the calendar rests.',
  build(calendar) {
    const model = simulateTetris(calendar);
    const clear = model.events.find(event => event.type === 'row-clear');
    return film(calendar, tetris, { duration: model.duration, events: model.events, metrics: { pieces: model.drops.length, lines: model.lines, restarts: model.restarts, contributions: model.contributions, skippedDates: model.skipped.length, missingSlots: calendar.columns * 7 - calendar.cells.length, calendarDays: calendar.cells.length }, stillTime: model.duration, checkpoints: [2, clear ? clear.time + 0.05 : model.duration * 0.5, model.duration - 1.5], draw: (theme, animated) => tetrisDrawing(calendar, model, theme, animated) });
  },
};
const match3: SceneDefinition = {
  id: 'match3', number: '18', title: 'Match Three', category: 'Arcade',
  caption: 'Swap real dates into runs. Let the cascades follow.',
  description: 'Every active date starts in its original week and weekday slot, colored by its real GitHub intensity. Existing runs resolve first. Legal adjacent swaps prefer the lowest available match total; matched dates bank their actual counts and surviving gems fall within real date slots. Missing dates block gravity. All dates start on the graph, so there are no reserves or fabricated refills; forced cascades may match larger counts.',
  build(calendar) {
    const model = simulateMatch3(calendar);
    const cleared = new Map<string, number>();
    const clearAt = (column: number, row: number, time: number) => {
      const cell = calendar.cells.find(cell => cell.column === column && cell.row === row);
      if (cell) cleared.set(cell.date, Math.min(cleared.get(cell.date) ?? Infinity, time));
    };
    for (const track of model.tracks) {
      for (let index = 1; index < track.points.length; index++) {
        const previous = track.points[index - 1], point = track.points[index];
        if (previous.x !== point.x || previous.y !== point.y) clearAt(previous.x, previous.y, previous.time);
      }
      if (track.end < model.duration) { const point = track.points.at(-1)!; clearAt(point.x, point.y, track.end); }
    }
    const clears = [...cleared].map(([date, time]) => ({ date, time }));
    return film(calendar, match3, { duration: model.duration, events: model.events, clears, metrics: { swaps: model.turns.length, matchedDates: model.matched, contributions: model.score, cascades: model.cascades, reserve: model.unused.length }, checkpoints: [1.25, model.events.find(event => event.type === 'cascade')?.time ?? model.duration * 0.5, model.duration - 1.5], draw: (theme, animated) => matchDrawing(calendar, model, theme, animated) });
  },
};
const whack: SceneDefinition = {
  id: 'whack-a-mole', number: '19', title: 'Whack-a-Mole', category: 'Arcade',
  caption: 'Moles pop on their original dates. Streaks sharpen your timing.',
  description: 'One mole appears on every actual active date at its original week and weekday coordinates, with lower counts first. Higher contribution counts shorten the pop window, while real daily streaks reduce hammer reaction time. The hammer travels to that date and banks its contributions only before the mole hides. Zero-count date tiles stay visible, and missing dates are absent.',
  build(calendar) {
    const model = simulateMoles(calendar);
    const firstMiss = model.attempts.find(attempt => !attempt.hit);
    return film(calendar, whack, { duration: model.duration, events: model.events, metrics: { attempts: model.attempts.length, hits: model.hits, misses: model.misses, contributions: model.score }, stillTime: model.attempts.at(-1)?.start ?? 0, checkpoints: [model.attempts[0] ? model.attempts[0].strike + 0.04 : 2, firstMiss ? firstMiss.strike + 0.04 : model.duration * 0.5, model.duration - 2], draw: (theme, animated) => moleDrawing(calendar, model, theme, animated) });
  },
};

export const arcadeScenes: SceneDefinition[] = [pacman, tetris, match3, whack];
