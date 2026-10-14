import type { Calendar, Cell } from '../calendar.js';
import type { SceneDefinition, SceneEvent } from './types.js';
import { THEMES, colors, n, film, motion, tween, text, visible, randomFor, weeks, type Theme } from './kit.js';

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
  pellets: PacmanPellet[];
  points: (TimedPoint & { column: number; row: number; direction: number })[];
  ghosts: { delay: number; points: TimedPoint[] }[];
  events: SceneEvent[];
}

/** A folded, one-cell-wide maze makes every turn and every meal observable. */
export function simulatePacman(calendar: Calendar): PacmanModel {
  const days = sortedDays(calendar);
  const columns = Math.max(7, Math.ceil(days.length / 7));
  const spacing = 980 / columns;
  const at = (index: number) => {
    const row = Math.floor(index / columns);
    const column = row % 2 ? columns - 1 - index % columns : index % columns;
    return { x: 70 + column * spacing, y: 137 + row * 27, column, row };
  };
  const dailyStreaks = streaks(calendar);
  const first = at(0);
  const points: PacmanModel['points'] = [{ ...first, time: 0, direction: 0 }, { ...first, x: first.x - Math.min(16, spacing * 0.7), time: 0.9, direction: 0 }];
  // Start to the left of the first pellet; all subsequent movement is adjacent.
  points[0].x = points[1].x;
  const pellets: PacmanPellet[] = [];
  const events: SceneEvent[] = [];
  let time = 0.9;
  for (const [index, day] of days.entries()) {
    const position = at(index);
    const streak = dailyStreaks.get(day.date) || 1;
    const step = 0.115 / (1 + Math.min(streak - 1, 14) * 0.045);
    time += index === 0 ? 0.25 : step;
    const last = points.at(-1)!;
    const direction = position.y !== last.y ? 90 : position.x < last.x ? 180 : 0;
    points.push({ ...position, time, direction });
    pellets.push({ ...day, ...position, time, streak, step });
    events.push({ time, type: 'pellet', date: day.date, value: day.count, data: { column: position.column, row: position.row, streak, secondsPerCell: step } });
  }
  const ghosts = [0.7, 1.15, 1.6].map(delay => ({ delay, points: points.map(point => ({ x: point.x, y: point.y, time: point.time + delay })) }));
  const duration = Math.max(5, time + 3.1);
  for (const [ghost, chase] of ghosts.entries()) {
    for (const point of chase.points.slice(2)) events.push({ time: point.time, type: 'ghost-chase', data: { ghost, x: point.x, y: point.y, trailDelay: chase.delay } });
  }
  return { columns, duration, pellets, points, ghosts, events: events.sort((a, b) => a.time - b.time) };
}

function pacmanDrawing(model: PacmanModel, theme: Theme, animated: boolean): string {
  const p = THEMES[theme];
  const spacing = 980 / model.columns;
  const radius = Math.min(9, spacing * 0.4);
  const stillIndex = model.pellets.length ? Math.min(model.pellets.length - 1, Math.floor(model.pellets.length * 0.58)) : -1;
  const stillTime = stillIndex >= 0 ? model.pellets[stillIndex].time : 0;
  const stillPoint = model.points[stillIndex + 2] || model.points[0];
  const walls = Array.from({ length: 6 }, (_, row) => {
    const gapAtRight = row % 2 === 0;
    return `<path d="M${gapAtRight ? 54 : n(70 + spacing * 0.7)} ${150.5 + row * 27}H${gapAtRight ? n(70 + (model.columns - 1.7) * spacing) : 1060}"/>`;
  }).join('');
  const pellets = model.pellets.map(pellet => {
    if (!animated && pellet.time <= stillTime) return '';
    return `<circle cx="${n(pellet.x)}" cy="${pellet.y}" r="${n(2.3 + Math.min(2, Math.log2(pellet.count + 1) * 0.3))}" fill="${p.colors[pellet.level]}" data-date="${pellet.date}" data-count="${pellet.count}"><title>${pellet.date}: ${pellet.count} contributions</title>${animated ? visible(0, pellet.time, model.duration) : ''}</circle>`;
  }).join('');
  const open = `M0 0L${n(radius * 0.7)} ${n(-radius * 0.7)}A${n(radius)} ${n(radius)} 0 1 0 ${n(radius * 0.7)} ${n(radius * 0.7)}Z`;
  const shut = `M0 0L${n(radius)} -0.3A${n(radius)} ${n(radius)} 0 1 0 ${n(radius)} 0.3Z`;
  const mouth = `<path d="${open}" fill="${p.accent}">${animated && model.pellets.length ? `<animate attributeName="d" values="${open};${shut};${open}" dur="0.22s" repeatCount="indefinite"/>` : ''}</path>`;
  const facing = animated ? rotate([{ time: 0, angle: 0 }, ...model.points.slice(2).map((point, index) => ({ time: model.points[index + 1].time, angle: point.direction })), { time: model.duration, angle: 0 }], model.duration, 'discrete') : '';
  const pacman = `<g transform="translate(${n(stillPoint.x)} ${n(stillPoint.y)})">${animated ? motion(model.points, model.duration) : ''}<g transform="rotate(${stillPoint.direction})">${facing}${mouth}</g></g>`;
  const ghosts = model.pellets.length ? model.ghosts.map((ghost, index) => {
    const target = [...model.points].reverse().find(point => point.time <= stillTime - ghost.delay) || model.points[0];
    const r = radius * 0.86;
    const color = colors(theme)[index + 1];
    return `<g transform="translate(${n(target.x)} ${n(target.y)})" opacity="${animated ? 0 : 0.85}">${animated ? visible(0.9 + ghost.delay, model.duration, model.duration) + motion(ghost.points, model.duration) : ''}<path d="M${n(-r)} ${n(r)}V0a${n(r)} ${n(r)} 0 0 1 ${n(r * 2)} 0v${n(r)}l${n(-r * 0.5)} ${n(-r * 0.35)} ${n(-r * 0.5)} ${n(r * 0.35)} ${n(-r * 0.5)} ${n(-r * 0.35)}Z" fill="${color}"/><g fill="${p.background}"><ellipse cx="${n(-r * 0.35)}" cy="-1" rx="2" ry="2.8"/><ellipse cx="${n(r * 0.35)}" cy="-1" rx="2" ry="2.8"/></g><g fill="${p.ink}"><circle cx="${n(-r * 0.27)}" cy="-1" r="0.9"/><circle cx="${n(r * 0.43)}" cy="-1" r="0.9"/></g></g>`;
  }).join('') : '';
  const frames = [{ time: 0, value: `0 / ${model.pellets.length} dates` }, ...model.pellets.map((pellet, index) => ({ time: pellet.time, value: `${index + 1} / ${model.pellets.length} dates · ${pellet.count} contributions` }))];
  return `<rect x="48" y="116" width="1024" height="220" rx="14" fill="${p.empty}"/><g fill="none" stroke="${p.secondary}" stroke-opacity="0.25" stroke-width="4" stroke-linecap="round">${walls}</g>${pellets}${ghosts}${pacman}${changingText(64, 359, animated ? frames : frames.filter(frame => frame.time <= stillTime), model.duration, theme, animated, 12)}${text(1060, 359, model.pellets.length ? 'LIGHT → HEAVY  /  STREAKS BOOST PACE' : 'NO ACTIVE DATES · MAZE AT REST', p.muted, 10, 'text-anchor="end" class="mono"')}`;
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
export type TetrisBoard = (number | null)[][];
export interface TetrisBlock { id: number; kind: TetrominoKind; start: number; end: number; points: TimedPoint[] }
export interface TetrisDrop {
  kind: TetrominoKind; shape: Point[]; x: number; y: number; start: number; lock: number; clearAt: number;
  week: number; count: number; date: string; before: TetrisBoard; landed: TetrisBoard; after: TetrisBoard; clearedRows: number[];
}
export interface TetrisModel {
  width: number; height: number; duration: number; drops: TetrisDrop[]; blocks: TetrisBlock[]; events: SceneEvent[];
  board: TetrisBoard; lines: number; restarts: number; contributions: number;
}
const cloneBoard = (board: TetrisBoard): TetrisBoard => board.map(row => [...row]);
const emptyTetris = (width: number, height: number): TetrisBoard => Array.from({ length: height }, () => Array<number | null>(width).fill(null));

export function tetrominoRotations(kind: TetrominoKind): Point[][] {
  const result: Point[][] = [];
  let shape = TETROMINOES[kind].map(point => ({ ...point }));
  for (let rotation = 0; rotation < 4; rotation++) {
    const key = (cells: Point[]) => [...cells].sort((a, b) => a.y - b.y || a.x - b.x).map(point => `${point.x},${point.y}`).join(';');
    if (!result.some(existing => key(existing) === key(shape))) result.push(shape);
    const turned = shape.map(point => ({ x: -point.y, y: point.x }));
    const minX = Math.min(...turned.map(point => point.x));
    const minY = Math.min(...turned.map(point => point.y));
    shape = turned.map(point => ({ x: point.x - minX, y: point.y - minY }));
  }
  return result;
}

export function tetrisFits(board: TetrisBoard, shape: Point[], x: number, y: number): boolean {
  return shape.every(point => x + point.x >= 0 && x + point.x < board[0].length && y + point.y >= 0 && y + point.y < board.length && board[y + point.y][x + point.x] === null);
}

export function clearTetrisRows(board: TetrisBoard): { board: TetrisBoard; rows: number[] } {
  const rows = board.flatMap((row, y) => row.every(value => value !== null) ? [y] : []);
  const kept = board.filter((_, y) => !rows.includes(y)).map(row => [...row]);
  return { rows, board: [...Array.from({ length: rows.length }, () => Array<number | null>(board[0].length).fill(null)), ...kept] };
}

function chooseDrop(board: TetrisBoard, kind: TetrominoKind): { shape: Point[]; x: number; y: number } | undefined {
  let best: { shape: Point[]; x: number; y: number; score: number } | undefined;
  for (const shape of tetrominoRotations(kind)) {
    const width = Math.max(...shape.map(point => point.x)) + 1;
    for (let x = 0; x <= board[0].length - width; x++) {
      if (!tetrisFits(board, shape, x, 0)) continue;
      let y = 0;
      while (tetrisFits(board, shape, x, y + 1)) y++;
      const landed = cloneBoard(board);
      for (const point of shape) landed[y + point.y][x + point.x] = -1;
      const cleared = clearTetrisRows(landed);
      const heights = Array.from({ length: board[0].length }, (_, column) => {
        const top = cleared.board.findIndex(row => row[column] !== null);
        return top < 0 ? 0 : board.length - top;
      });
      let holes = 0;
      for (let column = 0; column < heights.length; column++) {
        for (let row = board.length - heights[column]; row < board.length; row++) if (cleared.board[row][column] === null) holes++;
      }
      const bumpiness = heights.slice(1).reduce((sum, value, index) => sum + Math.abs(value - heights[index]), 0);
      const score = cleared.rows.length * 8 - heights.reduce((sum, value) => sum + value, 0) * 0.51 - holes * 3.6 - bumpiness * 0.24 - Math.max(...heights) * 0.1;
      if (!best || score > best.score) best = { shape, x, y, score };
    }
  }
  return best;
}

/** Each active week supplies exactly one legal piece; no blocks are pre-seeded. */
export function simulateTetris(calendar: Calendar): TetrisModel {
  const width = 10;
  const height = 12;
  let board = emptyTetris(width, height);
  const drops: TetrisDrop[] = [];
  const blocks: TetrisBlock[] = [];
  const events: SceneEvent[] = [];
  const activeWeeks = weeks(calendar).filter(week => week.count > 0).sort((a, b) => a.count - b.count || a.column - b.column);
  const peak = Math.max(1, ...activeWeeks.map(week => week.count));
  let time = 1;
  let lines = 0;
  let restarts = 0;
  for (const week of activeWeeks) {
    const kind = TETROMINO_KINDS[(week.count + week.active + week.column) % TETROMINO_KINDS.length];
    let choice = chooseDrop(board, kind);
    if (!choice) {
      events.push({ time, type: 'top-out', data: { round: restarts + 1 } });
      for (const row of board) for (const id of row) if (id !== null) blocks[id].end = time;
      board = emptyTetris(width, height);
      restarts++;
      time += 0.65;
      events.push({ time, type: 'restart', data: { round: restarts + 1 } });
      choice = chooseDrop(board, kind)!;
    }
    const { shape, x, y } = choice;
    const before = cloneBoard(board);
    const start = time;
    const lock = start + 0.72 - 0.3 * week.count / peak;
    const clearAt = lock + 0.19;
    for (const point of shape) {
      const id = blocks.length;
      blocks.push({ id, kind, start, end: Infinity, points: [{ time: start, x: x + point.x, y: point.y }, { time: lock, x: x + point.x, y: y + point.y }] });
      board[y + point.y][x + point.x] = id;
    }
    const landed = cloneBoard(board);
    const cleared = clearTetrisRows(board);
    const date = week.cells[0].date;
    const drop: TetrisDrop = { kind, shape, x, y, start, lock, clearAt, week: week.column, count: week.count, date, before, landed, after: cloneBoard(cleared.board), clearedRows: cleared.rows };
    drops.push(drop);
    events.push({ time: start, type: 'spawn', date, value: week.count, data: { kind, week: week.column, shape } });
    events.push({ time: lock, type: 'lock', date, value: 4, data: { kind, x, y, blocks: shape.map(point => ({ x: x + point.x, y: y + point.y })) } });
    if (cleared.rows.length) {
      lines += cleared.rows.length;
      events.push({ time: clearAt, type: 'row-clear', date, value: cleared.rows.length, data: { rows: cleared.rows, lines } });
      for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
        const id = board[row][column];
        if (id === null) continue;
        if (cleared.rows.includes(row)) blocks[id].end = clearAt;
        else {
          const fall = cleared.rows.filter(clearedRow => clearedRow > row).length;
          if (fall) blocks[id].points.push({ time: clearAt, x: column, y: row }, { time: clearAt + 0.14, x: column, y: row + fall });
        }
      }
    }
    board = cleared.board;
    time = clearAt + (cleared.rows.length ? 0.34 : 0.12);
  }
  const duration = Math.max(5, time + 1.5);
  for (const block of blocks) if (!Number.isFinite(block.end)) block.end = duration;
  return { width, height, duration, drops, blocks, events, board, lines, restarts, contributions: activeWeeks.reduce((sum, week) => sum + week.count, 0) };
}

function tetrisDrawing(model: TetrisModel, theme: Theme, animated: boolean): string {
  const p = THEMES[theme];
  const size = 19;
  const left = 465;
  const top = 116;
  const pieceColor = (kind: TetrominoKind) => [...colors(theme), p.colors[2], p.colors[4]][TETROMINO_KINDS.indexOf(kind)];
  const block = (id: number, x: number, y: number) => `<g transform="translate(${n(left + x * size)} ${n(top + y * size)})"><rect width="17" height="17" rx="3" fill="${pieceColor(model.blocks[id].kind)}"/><path d="M3 13V4h10" stroke="${p.background}" stroke-opacity="0.32" fill="none" stroke-width="1.5"/></g>`;
  let stack = '';
  if (animated) stack = model.blocks.map(unit => `<g opacity="0">${visible(unit.start, unit.end, model.duration)}<g>${motion(unit.points.map(point => ({ time: point.time, x: left + point.x * size, y: top + point.y * size })), model.duration)}<rect width="17" height="17" rx="3" fill="${pieceColor(unit.kind)}"/><path d="M3 13V4h10" stroke="${p.background}" stroke-opacity="0.32" fill="none" stroke-width="1.5"/></g></g>`).join('');
  else stack = model.board.flatMap((row, y) => row.flatMap((id, x) => id === null ? [] : [block(id, x, y)])).join('');
  const mesh = Array.from({ length: model.width + 1 }, (_, x) => `<path d="M${left + x * size - 1} ${top - 2}v${model.height * size}"/>`).join('') + Array.from({ length: model.height + 1 }, (_, y) => `<path d="M${left - 2} ${top + y * size - 1}h${model.width * size}"/>`).join('');
  const ghosts = animated ? model.drops.map(drop => `<g opacity="0" fill="none" stroke="${pieceColor(drop.kind)}" stroke-opacity="0.35">${visible(drop.start, drop.lock, model.duration)}${drop.shape.map(point => `<rect x="${left + (drop.x + point.x) * size}" y="${top + (drop.y + point.y) * size}" width="17" height="17" rx="3"/>`).join('')}</g>`).join('') : '';
  const flashes = animated ? model.drops.filter(drop => drop.clearedRows.length).map(drop => `<g opacity="0" fill="${p.accent}">${visible(drop.lock + 0.03, drop.clearAt, model.duration)}${drop.clearedRows.map(row => `<rect x="${left - 2}" y="${top + row * size - 1}" width="${model.width * size}" height="19" rx="3"/>`).join('')}</g>`).join('') : '';
  const lineFrames = [{ time: 0, value: '00 lines' }, ...model.events.filter(event => event.type === 'row-clear').map(event => ({ time: event.time, value: `${String(event.data!.lines).padStart(2, '0')} lines` }))];
  const sourceFrames = [{ time: 0, value: 'Ready for the first week' }, ...model.drops.map(drop => ({ time: drop.start, value: `Week ${drop.week + 1} · ${drop.count} contributions` }))];
  const previews = (animated ? model.drops : model.drops.slice(-1)).map((drop, index) => {
    const next = animated ? model.drops[index + 1] : undefined;
    if (!next) return `<g${animated ? ' opacity="0"' : ''}>${animated ? visible(drop.start, model.duration, model.duration) : ''}${text(786, 156, 'ALL WEEKS PLAYED', p.muted, 10, 'class="mono" letter-spacing="1.1"')}${text(786, 198, `${model.drops.length} pieces`, p.ink, 23)}${text(786, 224, `${model.contributions} contributions`, p.muted, 11)}</g>`;
    return `<g${animated ? ' opacity="0"' : ''}>${animated ? visible(drop.start, model.drops[index + 1]?.start ?? model.duration, model.duration) : ''}${text(786, 156, 'NEXT', p.muted, 10, 'class="mono" letter-spacing="1.5"')}${TETROMINOES[next.kind].map(point => `<rect x="${786 + point.x * 20}" y="${176 + point.y * 20}" width="18" height="18" rx="3" fill="${pieceColor(next.kind)}"/>`).join('')}${text(786, 245, `${next.kind} · week ${next.week + 1}`, p.ink, 13)}${text(786, 264, `${next.count} contributions`, p.muted, 11)}</g>`;
  }).join('');
  return `${panel(453, 106, 212, 248, theme)}<g stroke="${p.border}" stroke-width="0.7" opacity="0.45">${mesh}</g>${ghosts}${stack}${flashes}${text(80, 151, 'STACK THE WEEKS', p.secondary, 11, 'letter-spacing="1.5"')}${text(80, 188, 'Small weeks first.', p.ink, 24, 'font-weight="600"')}${text(80, 213, 'More activity, faster gravity.', p.muted, 13)}${changingText(80, 267, lineFrames, model.duration, theme, animated, 27)}${text(80, 292, `${model.drops.length} active weeks · ${model.restarts ? `${model.restarts + 1} rounds` : 'one round'}`, p.muted, 11)}${changingText(80, 335, sourceFrames, model.duration, theme, animated, 11)}${previews}${model.drops.length ? '' : text(786, 192, 'No active weeks', p.muted, 13)}`;
}

export interface MatchGem { id: number; date: string; count: number; kind: number }
export type MatchBoard = (MatchGem | null)[][];
export interface MatchSwap { a: Point; b: Point; matches: Point[] }
export interface GemTrack extends MatchGem { start: number; end: number; points: TimedPoint[] }
export interface MatchResolution { time: number; depth: number; matched: MatchGem[]; before: MatchBoard; after: MatchBoard; refilled: MatchGem[] }
export interface MatchTurn { time: number; swap: MatchSwap; before: MatchBoard; swapped: MatchBoard; resolutions: MatchResolution[] }
export interface MatchModel {
  duration: number; initial: MatchBoard; board: MatchBoard; turns: MatchTurn[]; opening: MatchResolution[];
  tracks: GemTrack[]; events: SceneEvent[]; score: number; matched: number; cascades: number; unused: MatchGem[];
}
const cloneMatch = (board: MatchBoard): MatchBoard => board.map(row => [...row]);

/** Union of horizontal and vertical runs; crossing gems are counted once. */
export function findMatchRuns(board: MatchBoard): Point[] {
  const found = new Map<string, Point>();
  const rows = board.length;
  const columns = board[0]?.length || 0;
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

/** Only adjacent swaps that create a match involving a moved gem are legal. */
export function legalMatchSwaps(board: MatchBoard): MatchSwap[] {
  const swaps: MatchSwap[] = [];
  for (let y = 0; y < board.length; y++) for (let x = 0; x < board[y].length; x++) {
    for (const b of [{ x: x + 1, y }, { x, y: y + 1 }]) {
      const a = { x, y };
      const first = board[y][x];
      const second = board[b.y]?.[b.x];
      if (!first || !second || first.kind === second.kind) continue;
      const copy = cloneMatch(board);
      copy[y][x] = second;
      copy[b.y][b.x] = first;
      const matches = findMatchRuns(copy);
      if (matches.some(point => point.x === a.x && point.y === a.y || point.x === b.x && point.y === b.y)) swaps.push({ a, b, matches });
    }
  }
  return swaps;
}

/** Stable column compaction: survivors keep their order and refills consume once. */
export function settleMatchBoard(board: MatchBoard, refill: MatchGem[]): { board: MatchBoard; refilled: MatchGem[]; remaining: MatchGem[] } {
  const result = cloneMatch(board);
  const remaining = [...refill];
  const refilled: MatchGem[] = [];
  for (let x = 0; x < board[0].length; x++) {
    const survivors = board.map(row => row[x]).filter((gem): gem is MatchGem => gem !== null);
    const missing = board.length - survivors.length;
    for (let y = board.length - 1; y >= 0; y--) {
      if (y >= missing) result[y][x] = survivors[y - missing];
      else {
        const gem = remaining.shift() || null;
        result[y][x] = gem;
        if (gem) refilled.push(gem);
      }
    }
  }
  return { board: result, refilled, remaining };
}

function shuffled<T>(values: T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export function simulateMatch3(calendar: Calendar): MatchModel {
  const random = randomFor(`${calendar.login}:match-three:${calendar.from}:${calendar.total}`);
  const all = sortedDays(calendar).map((day, id) => ({ id, date: day.date, count: day.count, kind: Math.max(1, day.level) }));
  const height = 6;
  const width = 8;
  // Draw the opening board evenly from the intensity buckets where possible.
  // This prevents a skewed calendar from turning its first frame into one huge
  // automatic run, while preserving every date and its actual GitHub level.
  const buckets = [1, 2, 3, 4].map(kind => all.filter(gem => gem.kind === kind));
  const selected: MatchGem[] = [];
  const chosen = [0, 0, 0, 0];
  while (selected.length < width * height && buckets.some(bucket => bucket.length)) {
    const available = buckets.flatMap((bucket, index) => bucket.length ? [index] : []).sort((a, b) => chosen[a] - chosen[b] || a - b);
    const kind = available[0];
    selected.push(buckets[kind].shift()!);
    chosen[kind]++;
  }
  const order = shuffled(selected, random);
  let board: MatchBoard = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => order[(height - 1 - y) * width + x] || null));
  let refill = buckets.flat().sort((a, b) => a.count - b.count || a.date.localeCompare(b.date));
  // Rearrange actual date gems, never invent a gem to manufacture a move.
  const buildOpening = (): MatchBoard | undefined => {
    const groups = [1, 2, 3, 4].map(kind => shuffled(selected.filter(gem => gem.kind === kind), random));
    const candidate: MatchBoard = Array.from({ length: height }, () => Array<MatchGem | null>(width).fill(null));
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if ((height - 1 - y) * width + x >= selected.length) continue;
      const choices = groups.flatMap((group, index) => {
        const kind = index + 1;
        if (!group.length || x >= 2 && candidate[y][x - 1]?.kind === kind && candidate[y][x - 2]?.kind === kind ||
            y >= 2 && candidate[y - 1][x]?.kind === kind && candidate[y - 2][x]?.kind === kind) return [];
        return [{ index, priority: group.length + random() * 2.5 }];
      }).sort((a, b) => b.priority - a.priority);
      if (!choices.length) return undefined;
      candidate[y][x] = groups[choices[0].index].pop()!;
    }
    return candidate;
  };
  for (let attempt = 0; attempt < 120 && (findMatchRuns(board).length || !legalMatchSwaps(board).length); attempt++) {
    const candidate = buildOpening();
    if (candidate) board = candidate;
  }
  const initial = cloneMatch(board);
  const tracks: GemTrack[] = all.map(gem => ({ ...gem, start: Infinity, end: Infinity, points: [] }));
  board.forEach((row, y) => row.forEach((gem, x) => { if (gem) { tracks[gem.id].start = 0; tracks[gem.id].points.push({ time: 0, x, y }); } }));
  const turns: MatchTurn[] = [];
  const opening: MatchResolution[] = [];
  const events: SceneEvent[] = [];
  let time = 1.1;
  let score = 0;
  let matched = 0;
  let cascades = 0;
  const resolve = (): MatchResolution[] => {
    const resolutions: MatchResolution[] = [];
    let positions = findMatchRuns(board);
    let depth = 0;
    while (positions.length) {
      const before = cloneMatch(board);
      const removed = positions.map(point => board[point.y][point.x]!);
      for (const point of positions) {
        const gem = board[point.y][point.x]!;
        tracks[gem.id].end = time + 0.18;
        board[point.y][point.x] = null;
        score += gem.count;
        matched++;
        events.push({ time, type: 'gem-match', date: gem.date, value: gem.count, data: { depth, x: point.x, y: point.y } });
      }
      if (depth > 0) { cascades++; events.push({ time, type: 'cascade', value: removed.length, data: { depth } }); }
      const settled = settleMatchBoard(board, refill);
      refill = settled.remaining;
      const positionBefore = new Map(before.flatMap((row, y) => row.flatMap((gem, x) => gem && !removed.some(removedGem => removedGem.id === gem.id) ? [[gem.id, { x, y }] as const] : [])));
      settled.board.forEach((row, y) => row.forEach((gem, x) => {
        if (!gem) return;
        const old = positionBefore.get(gem.id);
        if (!old) {
          tracks[gem.id].start = time + 0.2;
          tracks[gem.id].points.push({ time: time + 0.2, x, y: y - height }, { time: time + 0.6, x, y });
        } else if (old.y !== y) tracks[gem.id].points.push({ time: time + 0.2, ...old }, { time: time + 0.6, x, y });
      }));
      resolutions.push({ time, depth, matched: removed, before, after: cloneMatch(settled.board), refilled: settled.refilled });
      events.push({ time: time + 0.6, type: 'gravity', value: settled.refilled.length, data: { depth, refilledDates: settled.refilled.map(gem => gem.date) } });
      board = settled.board;
      time += 0.78;
      depth++;
      positions = findMatchRuns(board);
    }
    return resolutions;
  };
  opening.push(...resolve());
  while (turns.length < 18 && time < 38) {
    const swaps = legalMatchSwaps(board).sort((a, b) => b.matches.length - a.matches.length);
    if (!swaps.length) break;
    const swap = swaps[0];
    const before = cloneMatch(board);
    const first = board[swap.a.y][swap.a.x]!;
    const second = board[swap.b.y][swap.b.x]!;
    tracks[first.id].points.push({ time, ...swap.a }, { time: time + 0.3, ...swap.b });
    tracks[second.id].points.push({ time, ...swap.b }, { time: time + 0.3, ...swap.a });
    board[swap.a.y][swap.a.x] = second;
    board[swap.b.y][swap.b.x] = first;
    events.push({ time, type: 'swap', data: { a: swap.a, b: swap.b, dates: [first.date, second.date], matchSize: swap.matches.length } });
    const turn: MatchTurn = { time, swap, before, swapped: cloneMatch(board), resolutions: [] };
    time += 0.42;
    turn.resolutions = resolve();
    turns.push(turn);
    time += 0.36;
  }
  events.push({ time, type: legalMatchSwaps(board).length ? 'turn-limit' : 'no-moves', value: score });
  const duration = Math.max(5, time + 1.5);
  for (const track of tracks) if (!Number.isFinite(track.end)) track.end = duration;
  return { duration, initial, board, turns, opening, tracks: tracks.filter(track => Number.isFinite(track.start)), events, score, matched, cascades, unused: refill };
}

function gemDrawing(gem: MatchGem, theme: Theme): string {
  const p = THEMES[theme];
  const color = p.colors[gem.kind];
  const shape = [
    '', '<circle cx="14" cy="14" r="11"/>', '<rect x="4" y="4" width="20" height="20" rx="5"/>',
    '<path d="M14 1L27 14 14 27 1 14Z"/>', '<path d="M14 1L25 7V21L14 27 3 21V7Z"/>',
  ][gem.kind];
  return `<title>${gem.date}: ${gem.count} contributions · intensity ${gem.kind}</title><g fill="${color}" stroke="${p.secondary}" stroke-opacity="0.35">${shape}</g>${text(14, 17.5, gem.count, gem.kind >= 3 ? (theme === 'light' ? '#fbfcf8' : '#17231c') : p.ink, 9, 'text-anchor="middle" class="mono"')}`;
}

function matchDrawing(model: MatchModel, theme: Theme, animated: boolean): string {
  const p = THEMES[theme];
  const left = 425;
  const top = 128;
  const size = 32;
  const clipId = `match-board-${animated ? 'film' : 'still'}`;
  const mesh = Array.from({ length: 6 }, (_, y) => Array.from({ length: 8 }, (_, x) => `<rect x="${left + x * size}" y="${top + y * size}" width="28" height="28" rx="6" fill="${p.empty}"/>`).join('')).join('');
  let gems: string;
  if (animated) gems = model.tracks.map(track => `<g opacity="0" data-date="${track.date}">${visible(track.start, track.end, model.duration)}<g>${motion(track.points.map(point => ({ time: point.time, x: left + point.x * size, y: top + point.y * size })), model.duration)}<g>${gemDrawing(track, theme)}${track.end < model.duration ? tween('opacity', [{ time: 0, value: 1 }, { time: track.end - 0.18, value: 1 }, { time: track.end, value: 0 }, { time: model.duration, value: 0 }], model.duration) : ''}</g></g></g>`).join('');
  else gems = model.board.map((row, y) => row.map((gem, x) => gem ? `<g transform="translate(${left + x * size} ${top + y * size})">${gemDrawing(gem, theme)}</g>` : '').join('')).join('');
  const swapHighlights = animated ? model.turns.map(turn => `<g fill="none" stroke="${p.accent}" stroke-width="2" opacity="0">${visible(turn.time - 0.12, turn.time + 0.4, model.duration)}${[turn.swap.a, turn.swap.b].map(point => `<rect x="${left + point.x * size - 1}" y="${top + point.y * size - 1}" width="30" height="30" rx="7"/>`).join('')}</g>`).join('') : '';
  let score = 0;
  let dates = 0;
  const scoreFrames = [{ time: 0, value: '0 contributions' }];
  const dateFrames = [{ time: 0, value: '0 matched dates' }];
  for (const event of model.events.filter(event => event.type === 'gem-match')) {
    score += event.value || 0;
    dates++;
    // Multiple gems disappear together, so combine their score in one frame.
    if (scoreFrames.at(-1)!.time === event.time) {
      scoreFrames.at(-1)!.value = `${score} contributions`;
      dateFrames.at(-1)!.value = `${dates} matched dates`;
    } else {
      scoreFrames.push({ time: event.time, value: `${score} contributions` });
      dateFrames.push({ time: event.time, value: `${dates} matched dates` });
    }
  }
  const cascade = animated ? model.events.filter(event => event.type === 'cascade').map(event => `<g opacity="0">${visible(event.time, event.time + 0.65, model.duration)}${text(790, 283, `CASCADE ×${Number(event.data!.depth) + 1}`, p.accent, 12, 'class="mono"')}</g>`).join('') : text(790, 283, `${model.cascades} cascades`, p.accent, 12, 'class="mono"');
  let swaps = 0;
  let reserve = model.unused.length + model.events.filter(event => event.type === 'gravity').reduce((sum, event) => sum + (event.value || 0), 0);
  const progressFrames = [{ time: 0, value: `${swaps} swaps · ${reserve} dates in reserve` }];
  for (const event of model.events) {
    if (event.type === 'swap') swaps++;
    else if (event.type === 'gravity') reserve -= event.value || 0;
    else continue;
    progressFrames.push({ time: event.time, value: `${swaps} swaps · ${reserve} dates in reserve` });
  }
  return `${panel(413, 116, 280, 216, theme)}${mesh}<defs><clipPath id="${clipId}"><rect x="${left - 2}" y="${top - 2}" width="258" height="194" rx="8"/></clipPath></defs><g clip-path="url(#${clipId})">${gems}${swapHighlights}</g>${text(80, 151, 'MATCH THE ACTIVITY', p.secondary, 11, 'letter-spacing="1.3"')}${text(80, 188, 'Swap. Match. Cascade.', p.ink, 22, 'font-weight="600"')}${text(80, 215, 'Every gem is an actual active date.', p.muted, 12)}${changingText(80, 270, scoreFrames, model.duration, theme, animated, 20)}${changingText(80, 294, dateFrames, model.duration, theme, animated, 12)}${text(790, 151, 'INTENSITY', p.muted, 10, 'class="mono" letter-spacing="1.5"')}${[1, 2, 3, 4].map((kind, index) => `<g transform="translate(${790 + index * 38} 171)">${gemDrawing({ id: -1, date: 'Activity level', count: kind, kind }, theme)}</g>`).join('')}${text(790, 232, 'Three or more to clear.', p.ink, 12)}${text(790, 251, 'Refills use remaining dates.', p.muted, 11)}${cascade}${model.tracks.length ? changingText(80, 344, progressFrames, model.duration, theme, animated, 11) : text(80, 344, 'No active dates · no gems to match', p.muted, 11)}`;
}

export interface MoleAttempt {
  week: number; date: string; count: number; hole: number; x: number; y: number; start: number; strike: number;
  expires: number; end: number; hit: boolean; streak: number; reaction: number; score: number;
}
export interface MoleModel { duration: number; attempts: MoleAttempt[]; hammer: TimedPoint[]; events: SceneEvent[]; score: number; hits: number; misses: number }
export const MOLE_HOLES: Point[] = Array.from({ length: 9 }, (_, index) => ({ x: 445 + index % 3 * 118, y: 153 + Math.floor(index / 3) * 72 }));

export function simulateMoles(calendar: Calendar): MoleModel {
  const activeWeeks = weeks(calendar).filter(week => week.count > 0).sort((a, b) => a.count - b.count || a.column - b.column);
  const dailyStreaks = streaks(calendar);
  const peak = Math.max(1, ...activeWeeks.map(week => week.count));
  const attempts: MoleAttempt[] = [];
  const hammer: TimedPoint[] = [{ time: 0, x: 850, y: 168 }];
  const events: SceneEvent[] = [];
  let time = 1;
  let score = 0;
  let previous = { x: 850, y: 168 };
  for (const week of activeWeeks) {
    const hole = (week.column * 5 + week.active + week.count) % MOLE_HOLES.length;
    const point = MOLE_HOLES[hole];
    const streak = Math.max(0, ...week.cells.map(day => dailyStreaks.get(day.date) || 0));
    const reaction = 0.26 + (7 - week.active) * 0.035 + Math.hypot(point.x - previous.x, point.y - previous.y) / 1900 - Math.min(streak, 12) * 0.009;
    const expires = time + 0.76 - 0.56 * week.count / peak;
    const strike = time + Math.max(0.19, reaction);
    const hit = strike < expires;
    if (hit) score += week.count;
    const end = hit ? strike + 0.14 : expires;
    const attempt: MoleAttempt = { week: week.column, date: week.cells[0].date, count: week.count, hole, ...point, start: time, strike, expires, end, hit, streak, reaction: strike - time, score };
    attempts.push(attempt);
    events.push({ time, type: 'mole-pop', date: attempt.date, value: week.count, data: { hole, week: week.column, expires, streak } });
    events.push({ time: strike, type: hit ? 'hammer-hit' : 'hammer-miss', date: attempt.date, value: hit ? week.count : 0, data: { hole, score, reaction: attempt.reaction, window: expires - time } });
    hammer.push({ time, x: previous.x, y: previous.y - 24 }, { time: strike - 0.09, x: point.x + 14, y: point.y - 34 }, { time: strike, x: point.x, y: point.y + 4 }, { time: strike + 0.12, x: point.x + 14, y: point.y - 24 });
    previous = point;
    time = Math.max(expires, strike + 0.12) + 0.2;
  }
  return { duration: Math.max(5, time + 1.3), attempts, hammer, events: events.sort((a, b) => a.time - b.time), score, hits: attempts.filter(attempt => attempt.hit).length, misses: attempts.filter(attempt => !attempt.hit).length };
}

function moleDrawing(model: MoleModel, theme: Theme, animated: boolean): string {
  const p = THEMES[theme];
  const clipId = `mole-window-${animated ? 'film' : 'still'}`;
  const stillAttempt = model.attempts.at(-1);
  const holes = MOLE_HOLES.map((point, index) => `<g><ellipse cx="${point.x}" cy="${point.y + 18}" rx="38" ry="13" fill="${p.background}" stroke="${p.border}"/>${text(point.x, point.y + 47, String(index + 1).padStart(2, '0'), p.muted, 9, 'text-anchor="middle" class="mono"')}</g>`).join('');
  const mole = (attempt: MoleAttempt) => `<g transform="translate(${attempt.x} ${attempt.y + 18})"${animated ? ' opacity="0"' : ''}>${animated ? visible(attempt.start, attempt.end, model.duration) : ''}<g clip-path="url(#${clipId})"><g transform="translate(0 -8)">${animated ? motion([{ time: attempt.start, x: 0, y: 25 }, { time: attempt.start + 0.13, x: 0, y: -8 }, { time: attempt.end - 0.1, x: 0, y: -8 }, { time: attempt.end, x: 0, y: 25 }], model.duration) : ''}<ellipse cx="0" cy="0" rx="24" ry="29" fill="${p.secondary}"/><circle cx="-19" cy="-17" r="8" fill="${p.secondary}"/><circle cx="19" cy="-17" r="8" fill="${p.secondary}"/><ellipse cx="0" cy="3" rx="17" ry="12" fill="${p.accent}"/><g fill="${p.background}"><circle cx="-8" cy="-10" r="2.4"/><circle cx="8" cy="-10" r="2.4"/><ellipse cy="0" rx="4" ry="3"/></g><path d="M-5 8q5 5 10 0" fill="none" stroke="${p.background}" stroke-width="1.4"/></g></g></g>`;
  const moles = animated ? model.attempts.map(mole).join('') : stillAttempt ? mole(stillAttempt) : '';
  const lips = MOLE_HOLES.map(point => `<path d="M${point.x - 38} ${point.y + 18}Q${point.x} ${point.y + 44} ${point.x + 38} ${point.y + 18}V${point.y + 36}H${point.x - 38}Z" fill="${p.empty}"/><path d="M${point.x - 38} ${point.y + 18}Q${point.x} ${point.y + 44} ${point.x + 38} ${point.y + 18}" fill="none" stroke="${p.secondary}" stroke-opacity="0.45" stroke-width="2"/>`).join('');
  const hammerAngle = [{ time: 0, angle: -28 }, ...model.attempts.flatMap(attempt => [{ time: attempt.strike - 0.09, angle: -38 }, { time: attempt.strike, angle: 12 }, { time: attempt.strike + 0.12, angle: -28 }]), { time: model.duration, angle: -28 }];
  const hammerPosition = stillAttempt ? { x: stillAttempt.x + 16, y: stillAttempt.y - 31 } : { x: 850, y: 168 };
  const hammer = `<g transform="translate(${hammerPosition.x} ${hammerPosition.y})">${animated ? motion(model.hammer, model.duration) : ''}<g transform="rotate(-28)">${animated ? rotate(hammerAngle, model.duration) : ''}<rect x="-3.5" y="-4" width="7" height="43" rx="3" fill="${p.accent}"/><rect x="-22" y="-13" width="44" height="22" rx="7" fill="${p.ink}"/><path d="M-15 -8h30" stroke="${p.background}" stroke-opacity="0.35" stroke-width="2"/></g></g>`;
  const popups = animated ? model.attempts.map(attempt => `<g opacity="0">${visible(attempt.strike, attempt.strike + 0.45, model.duration)}${text(attempt.x, attempt.y - 47, attempt.hit ? `+${attempt.count}` : 'MISS', attempt.hit ? p.accent : p.muted, 12, 'text-anchor="middle" class="mono"')}</g>`).join('') : '';
  const scoreFrames = [{ time: 0, value: '0 contributions' }, ...model.attempts.map(attempt => ({ time: attempt.strike, value: `${attempt.score} contributions` }))];
  const hitFrames = [{ time: 0, value: '0 hits · 0 misses' }, ...model.attempts.map((attempt, index) => ({ time: attempt.strike, value: `${model.attempts.slice(0, index + 1).filter(item => item.hit).length} hits · ${model.attempts.slice(0, index + 1).filter(item => !item.hit).length} misses` }))];
  return `${panel(382, 116, 362, 237, theme)}<defs><clipPath id="${clipId}"><rect x="-35" y="-66" width="70" height="66"/></clipPath></defs>${holes}${moles}${lips}${hammer}${popups}${text(80, 151, 'CATCH THE WEEK', p.secondary, 11, 'letter-spacing="1.5"')}${text(80, 188, 'A timely little bonk.', p.ink, 23, 'font-weight="600"')}${text(80, 215, 'One mole per active week.', p.muted, 12)}${changingText(80, 273, scoreFrames, model.duration, theme, animated, 20)}${changingText(80, 298, hitFrames, model.duration, theme, animated, 12)}${text(790, 256, 'BUSIER WEEKS', p.secondary, 11, 'letter-spacing="1.2"')}${text(790, 278, 'Shorter pop windows.', p.ink, 13)}${text(790, 300, 'Streaks improve reaction time.', p.muted, 11)}${text(80, 344, model.attempts.length ? 'Small weeks first · score banks only successful hits' : 'No active weeks · the burrows are quiet', p.muted, 11)}`;
}

const pacman: SceneDefinition = {
  id: 'pacman', number: '03', title: 'Pac-Man', category: 'Arcade',
  caption: 'Date pellets, hungry turns, and ghosts on your trail.',
  description: 'Pac-Man eats one pellet per active date, from smaller contribution counts to larger ones. Actual consecutive-day streaks increase his pace; three ghosts pursue the same connected maze trail.',
  build(calendar) {
    const model = simulatePacman(calendar);
    return film(calendar, pacman, { duration: model.duration, events: model.events, metrics: { pellets: model.pellets.length, contributions: model.pellets.reduce((sum, pellet) => sum + pellet.count, 0), ghosts: model.pellets.length ? 3 : 0, ordering: 'contribution-count' }, checkpoints: [1.4, model.duration * 0.52, model.duration - 2], draw: (theme, animated) => pacmanDrawing(model, theme, animated) });
  },
};
const tetris: SceneDefinition = {
  id: 'tetris', number: '04', title: 'Tetris', category: 'Arcade',
  caption: 'Active weeks fall into place. Complete a row and breathe.',
  description: 'Each active week supplies a legal tetromino. Smaller weekly totals fall first; busier weeks accelerate gravity. Pieces collide with the existing stack, completed rows disappear, and the blocks above fall into the gap.',
  build(calendar) {
    const model = simulateTetris(calendar);
    const clear = model.events.find(event => event.type === 'row-clear');
    return film(calendar, tetris, { duration: model.duration, events: model.events, metrics: { pieces: model.drops.length, lines: model.lines, restarts: model.restarts, contributions: model.contributions }, checkpoints: [2, clear ? clear.time + 0.05 : model.duration * 0.5, model.duration - 1.5], draw: (theme, animated) => tetrisDrawing(model, theme, animated) });
  },
};
const match3: SceneDefinition = {
  id: 'match3', number: '18', title: 'Match Three', category: 'Arcade',
  caption: 'Swap real dates into runs. Let the cascades follow.',
  description: 'Every gem represents a real active date and is colored by its GitHub intensity. Adjacent swaps create runs of at least three. Matched dates bank their actual contribution counts, surviving gems fall, and remaining dates refill the board for further cascades.',
  build(calendar) {
    const model = simulateMatch3(calendar);
    return film(calendar, match3, { duration: model.duration, events: model.events, metrics: { swaps: model.turns.length, matchedDates: model.matched, contributions: model.score, cascades: model.cascades, reserve: model.unused.length }, checkpoints: [1.25, model.events.find(event => event.type === 'cascade')?.time ?? model.duration * 0.5, model.duration - 1.5], draw: (theme, animated) => matchDrawing(model, theme, animated) });
  },
};
const whack: SceneDefinition = {
  id: 'whack-a-mole', number: '19', title: 'Whack-a-Mole', category: 'Arcade',
  caption: 'Busy weeks pop faster. Streaks sharpen your timing.',
  description: 'One mole represents each active week, ordered by contribution count. Busier weeks have shorter appearance windows, while real daily streaks reduce hammer reaction time. The hammer banks weekly contributions only when it strikes before the mole hides; late swings visibly miss.',
  build(calendar) {
    const model = simulateMoles(calendar);
    const firstMiss = model.attempts.find(attempt => !attempt.hit);
    return film(calendar, whack, { duration: model.duration, events: model.events, metrics: { attempts: model.attempts.length, hits: model.hits, misses: model.misses, contributions: model.score }, checkpoints: [model.attempts[0] ? model.attempts[0].strike + 0.04 : 2, firstMiss ? firstMiss.strike + 0.04 : model.duration * 0.5, model.duration - 2], draw: (theme, animated) => moleDrawing(model, theme, animated) });
  },
};

export const arcadeScenes: SceneDefinition[] = [pacman, tetris, match3, whack];
