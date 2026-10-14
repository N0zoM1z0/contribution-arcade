import type { Calendar, Cell } from './calendar.js';

export const BOARD = {
  width: 1120, height: 448,
  left: 48, right: 1072, top: 92,
  gridY: 114, gridWidth: 1024,
  paddleY: 342, paddleWidth: 92, paddleHeight: 8,
  ballRadius: 4.2,
};

export interface Brick {
  cell: Cell;
  x: number;
  y: number;
  size: number;
  hp: number;
  initialHp: number;
  hits: { time: number; hp: number }[];
}

export interface Point { time: number; x: number; y: number }
export interface Impact { time: number; x: number; y: number; destroyed: boolean }
export interface BallTrack { start: number; points: Point[] }
export interface Scene {
  duration: number;
  playStart: number;
  playEnd: number;
  bricks: Brick[];
  balls: BallTrack[];
  paddle: Point[];
  impacts: Impact[];
  cleared: number;
  totalHits: number;
}

const STEP = 1 / 120;
const START = 1.8;
const MAX_PLAY = 42;
const SPEED = 820;
const EPSILON = 0.001;

function randomFor(seed: string): () => number {
  let value = 2166136261;
  for (const character of seed) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return () => {
    value += 0x6D2B79F5;
    let n = Math.imul(value ^ value >>> 15, 1 | value);
    n ^= n + Math.imul(n ^ n >>> 7, 61 | n);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));

/** Swept point against an expanded rectangle: no fast ball tunnelling. */
export function intersectBox(
  x: number, y: number, dx: number, dy: number,
  left: number, top: number, right: number, bottom: number,
): { fraction: number; nx: number; ny: number } | null {
  const xEntry = dx === 0 ? -Infinity : Math.min((left - x) / dx, (right - x) / dx);
  const xExit = dx === 0 ? Infinity : Math.max((left - x) / dx, (right - x) / dx);
  const yEntry = dy === 0 ? -Infinity : Math.min((top - y) / dy, (bottom - y) / dy);
  const yExit = dy === 0 ? Infinity : Math.max((top - y) / dy, (bottom - y) / dy);
  if ((dx === 0 && (x < left || x > right)) || (dy === 0 && (y < top || y > bottom))) return null;
  const entry = Math.max(xEntry, yEntry);
  if (entry < 0 || entry > 1 || entry > Math.min(xExit, yExit)) return null;
  return xEntry > yEntry
    ? { fraction: entry, nx: dx > 0 ? -1 : 1, ny: 0 }
    : { fraction: entry, nx: 0, ny: dy > 0 ? -1 : 1 };
}

export function makeBricks(calendar: Calendar): Brick[] {
  const pitch = BOARD.gridWidth / calendar.columns;
  const size = Math.min(14.5, pitch - 3);
  return calendar.cells.map(cell => {
    const hp = cell.count > 0 ? Math.max(1, Math.ceil(cell.level / 2)) : 0;
    return {
      cell,
      x: BOARD.left + cell.column * pitch + (pitch - size) / 2,
      y: BOARD.gridY + cell.row * 19,
      size,
      hp, initialHp: hp, hits: [],
    };
  });
}

/** A deterministic auto-player; all motion is computed before SVG playback. */
export function simulate(calendar: Calendar, seed = calendar.login): Scene {
  const random = randomFor(seed);
  const bricks = makeBricks(calendar);
  const impacts: Impact[] = [];
  const paddle: Point[] = [];
  const tracks: BallTrack[] = [];
  type Ball = { x: number; y: number; vx: number; vy: number; track: BallTrack };
  const balls: Ball[] = [];
  let playTime = 0;
  let paddleX = BOARD.width / 2;
  let remaining = bricks.filter(brick => brick.hp > 0).length;
  let totalHits = 0;

  function aim(x: number, y: number): { vx: number; vy: number } {
    // Choose an exposed brick in each column, then prefer nearby reachable targets.
    const exposed = new Map<number, Brick>();
    for (const brick of bricks) {
      if (brick.hp > 0 && (!exposed.has(brick.cell.column) || exposed.get(brick.cell.column)!.y < brick.y)) {
        exposed.set(brick.cell.column, brick);
      }
    }
    const candidates = [...exposed.values()].sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x));
    const target = candidates[Math.floor(random() * Math.min(10, candidates.length))];
    const targetX = target ? target.x + target.size / 2 : BOARD.width * random();
    const targetY = target ? target.y + target.size : BOARD.gridY;
    const angle = clamp(Math.atan2(targetX - x, y - targetY), -1.1, 1.1);
    return { vx: Math.sin(angle) * SPEED, vy: -Math.cos(angle) * SPEED };
  }

  function launch(offset: number): void {
    const x = clamp(paddleX + offset, BOARD.left + 8, BOARD.right - 8);
    const y = BOARD.paddleY - BOARD.ballRadius - 1;
    const track: BallTrack = { start: START + playTime, points: [{ time: START + playTime, x, y }] };
    tracks.push(track);
    balls.push({ x, y, ...aim(x, y), track });
  }

  if (remaining) launch(0);
  // Dense histories unlock two extra balls, keeping the film short and lively.
  const multiball = calendar.activeDays > 100 && calendar.longestStreak >= 7;
  let split = false;
  while (remaining > 0 && playTime < MAX_PLAY) {
    if (multiball && !split && playTime >= 6) {
      launch(-20);
      launch(20);
      split = true;
    }
    const nextToLand = [...balls].filter(ball => ball.vy > 0)
      .sort((a, b) => (BOARD.paddleY - a.y) / a.vy - (BOARD.paddleY - b.y) / b.vy)[0] || balls[0];
    paddleX = clamp(nextToLand.x, BOARD.left + BOARD.paddleWidth / 2, BOARD.right - BOARD.paddleWidth / 2);
    if (Math.round(playTime / STEP) % 4 === 0) paddle.push({ time: START + playTime, x: paddleX, y: BOARD.paddleY });
    for (const ball of balls) {
      let rest = STEP;
      for (let bounce = 0; bounce < 6 && rest > EPSILON / SPEED; bounce++) {
        const dx = ball.vx * rest;
        const dy = ball.vy * rest;
        let nearest = 1;
        let normalX = 0;
        let normalY = 0;
        let hit: Brick | undefined;
        let isPaddle = false;
        function candidate(fraction: number, nx: number, ny: number, brick?: Brick, paddleHit = false): void {
          if (fraction >= 0 && fraction < nearest) {
            nearest = fraction;
            normalX = nx; normalY = ny; hit = brick; isPaddle = paddleHit;
          }
        }
        const radius = BOARD.ballRadius;
        if (dx < 0) candidate((BOARD.left + radius - ball.x) / dx, 1, 0);
        if (dx > 0) candidate((BOARD.right - radius - ball.x) / dx, -1, 0);
        if (dy < 0) candidate((BOARD.top + radius - ball.y) / dy, 0, 1);
        if (dy > 0) candidate((BOARD.paddleY - radius - ball.y) / dy, 0, -1, undefined, true);
        for (const brick of bricks) {
          if (!brick.hp) continue;
          const collision = intersectBox(ball.x, ball.y, dx, dy,
            brick.x - radius, brick.y - radius, brick.x + brick.size + radius, brick.y + brick.size + radius);
          if (collision) candidate(collision.fraction, collision.nx, collision.ny, brick);
        }
        ball.x += dx * nearest;
        ball.y += dy * nearest;
        if (nearest === 1) break;
        const time = START + playTime + STEP - rest + rest * nearest;
        // Retain collision vertices, so interpolated SVG motion respects the bounce.
        ball.track.points.push({ time, x: ball.x, y: ball.y });
        if (hit) {
          hit.hp--;
          totalHits++;
          hit.hits.push({ time, hp: hit.hp });
          impacts.push({ time, x: hit.x + hit.size / 2, y: hit.y + hit.size / 2, destroyed: hit.hp === 0 });
          if (!hit.hp) remaining--;
        }
        if (isPaddle) {
          paddleX = clamp(ball.x, BOARD.left + BOARD.paddleWidth / 2, BOARD.right - BOARD.paddleWidth / 2);
          paddle.push({ time, x: paddleX, y: BOARD.paddleY });
          Object.assign(ball, aim(ball.x, ball.y));
        } else {
          if (normalX) ball.vx = -ball.vx;
          if (normalY) ball.vy = -ball.vy;
        }
        ball.x += normalX * EPSILON;
        ball.y += normalY * EPSILON;
        rest *= 1 - nearest;
      }
      if (Math.round(playTime / STEP) % 4 === 0) {
        ball.track.points.push({ time: START + playTime + STEP, x: ball.x, y: ball.y });
      }
    }
    playTime += STEP;
  }
  const playEnd = START + playTime;
  for (const ball of balls) {
    ball.track.points.push({ time: playEnd, x: ball.x, y: ball.y });
  }
  if (!paddle.length) paddle.push({ time: START, x: paddleX, y: BOARD.paddleY });
  return {
    duration: Math.max(12, playEnd + 3.2), playStart: START, playEnd,
    bricks, balls: tracks, paddle: paddle.sort((a, b) => a.time - b.time), impacts: impacts.sort((a, b) => a.time - b.time),
    cleared: calendar.activeDays - remaining,
    totalHits,
  };
}
