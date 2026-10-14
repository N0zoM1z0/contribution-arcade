import type { Calendar, Cell } from './calendar.js';

export interface GridPoint { column: number; row: number }
export interface SnakeFrame {
  time: number;
  body: GridPoint[];
  eaten: number;
  food?: Cell;
}
export interface SnakeScene {
  columns: number;
  rows: number;
  initialLength: number;
  finalLength: number;
  frames: SnakeFrame[];
  meals: { time: number; cell: Cell; length: number }[];
  playStart: number;
  playEnd: number;
  duration: number;
}

const INITIAL_LENGTH = 4;
const PLAY_START = 1.8;
const STEP_SECONDS = 0.12;

const key = (point: GridPoint): string => `${point.column},${point.row}`;

/** A cycle leaves room for a growing body, even when every date has food. */
export function makeCycle(columns: number): GridPoint[] {
  const width = Math.max(2, columns);
  const rows = width < INITIAL_LENGTH ? 10 : 8;
  const points: GridPoint[] = [{ column: 0, row: 0 }];
  for (let row = 0; row < rows; row++) {
    if (row % 2 === 0) {
      for (let column = 1; column < width; column++) points.push({ column, row });
    } else {
      for (let column = width - 1; column >= 1; column--) points.push({ column, row });
    }
  }
  for (let row = rows - 1; row >= 1; row--) points.push({ column: 0, row });
  return points;
}

export function simulateSnake(calendar: Calendar): SnakeScene {
  const cycle = makeCycle(calendar.columns);
  const food = new Map(calendar.cells.filter(cell => cell.count > 0).map(cell => [key(cell), cell]));
  const at = (index: number): GridPoint => cycle[(index + cycle.length) % cycle.length];

  // Start with an empty four-cell body and an early first meal. Food is never
  // hidden underneath the initial snake or removed without being visited.
  let start = cycle.findIndex((_, index) => Array.from({ length: INITIAL_LENGTH }, (_, offset) => at(index - offset)).every(point => !food.has(key(point))));
  let bestScore = Infinity;
  if (food.size) {
    for (let index = 0; index < cycle.length; index++) {
      if (Array.from({ length: INITIAL_LENGTH }, (_, offset) => at(index - offset)).some(point => food.has(key(point)))) continue;
      let distance = 1;
      while (!food.has(key(at(index + distance))) && distance < cycle.length) distance++;
      const score = distance * 1000 + at(index).column * 2 + at(index).row / 10;
      if (score < bestScore) { bestScore = score; start = index; }
    }
  }
  if (start < 0) throw new Error('The snake needs an empty starting lane.');

  let body = Array.from({ length: INITIAL_LENGTH }, (_, offset) => ({ ...at(start - offset) }));
  const frames: SnakeFrame[] = [{ time: PLAY_START, body, eaten: 0 }];
  const meals: SnakeScene['meals'] = [];
  for (let step = 1; food.size && step <= cycle.length; step++) {
    const next = { ...at(start + step) };
    const meal = food.get(key(next));
    body = [next, ...body];
    if (meal) food.delete(key(next));
    else body.pop();
    const time = PLAY_START + step * STEP_SECONDS;
    if (meal) meals.push({ time, cell: meal, length: body.length });
    frames.push({ time, body, eaten: meals.length, ...(meal ? { food: meal } : {}) });
  }
  if (food.size) throw new Error('The snake route did not visit every active date.');
  const playEnd = frames.at(-1)!.time;
  return {
    columns: Math.max(2, calendar.columns), rows: cycle.length / Math.max(2, calendar.columns),
    initialLength: INITIAL_LENGTH, finalLength: body.length,
    frames, meals, playStart: PLAY_START, playEnd,
    duration: Math.max(12, playEnd + 3.5),
  };
}
