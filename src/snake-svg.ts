import type { Calendar } from './calendar.js';
import type { GridPoint, SnakeScene } from './snake.js';
import { BOARD } from './layout.js';
import { THEMES, discrete, motion, n, renderCard, type Theme } from './card.js';

export function renderSnakeSVG(calendar: Calendar, scene: SnakeScene, theme: Theme, animated = true): string {
  const palette = THEMES[theme];
  const { duration } = scene;
  const pitch = BOARD.gridWidth / scene.columns;
  const size = Math.min(14.5, pitch - 3);
  const pixel = (point: GridPoint) => ({
    x: BOARD.left + (point.column + 0.5) * pitch,
    y: BOARD.gridY + point.row * 19 + size / 2,
  });
  const square = (point: GridPoint, color: string) => {
    const { x, y } = pixel(point);
    return `<rect x="${n(x - size / 2)}" y="${n(y - size / 2)}" width="${n(size)}" height="${n(size)}" rx="3" fill="${color}"/>`;
  };
  const mealTimes = new Map(scene.meals.map(meal => [meal.cell.date, meal.time]));
  const foods = (moving: boolean) => calendar.cells.filter(cell => cell.count > 0).map(cell => {
    const rect = square({ column: cell.column, row: cell.row }, palette.colors[cell.level]);
    if (!moving) return rect;
    return `<g class="snake-food" data-date="${cell.date}" data-eaten-at="${n(mealTimes.get(cell.date)!)}">${rect}${discrete('opacity', [
      { time: 0, value: '1' }, { time: mealTimes.get(cell.date)!, value: '0' },
      { time: duration - 0.04, value: '1' }, { time: duration, value: '1' },
    ], duration)}</g>`;
  }).join('');

  // One continuous trail makes even a 375-segment snake compact in SVG.
  // The visible window moves along that trail; its tail stays put on a meal.
  const trail = [...scene.frames[0].body].reverse().map(pixel)
    .concat(scene.frames.slice(1).map(frame => pixel(frame.body[0])));
  const distances = [0];
  for (let index = 1; index < trail.length; index++) {
    distances.push(distances[index - 1] + Math.hypot(trail[index].x - trail[index - 1].x, trail[index].y - trail[index - 1].y));
  }
  const path = trail.map((point, index) => `${index ? 'L' : 'M'}${n(point.x)} ${n(point.y)}`).join('');
  const tails = scene.frames.map((frame, index) => distances[scene.initialLength - 1 + index - frame.body.length + 1]);
  const lengths = scene.frames.map((_, index) => distances[scene.initialLength - 1 + index] - tails[index]);
  const gap = distances.at(-1)! + 1;
  const series = (attribute: string, values: string[]) => `<animate attributeName="${attribute}" values="${[values[0], ...values, values.at(-1)!].join(';')}" keyTimes="${[0, ...scene.frames.map(frame => frame.time / duration), 1].map(time => time.toFixed(6)).join(';')}" dur="${n(duration)}s" repeatCount="indefinite"/>`;
  const initial = pixel(scene.frames[0].body[0]);
  const angleAt = (index: number) => {
    const from = scene.frames[index].body[0];
    const to = scene.frames[index + 1]?.body[0];
    const previous = scene.frames[index].body[1];
    return to ? Math.atan2(to.row - from.row, to.column - from.column) * 180 / Math.PI
      : Math.atan2(from.row - previous.row, from.column - previous.column) * 180 / Math.PI;
  };
  const face = `<rect x="-7.1" y="-7.1" width="14.2" height="14.2" rx="4.6" fill="${palette.accent}"/>
    <circle cx="3" cy="-2.7" r="1.2" fill="${palette.background}"/><circle cx="3" cy="2.7" r="1.2" fill="${palette.background}"/>`;
  const staticSnake = `<path d="${path}" fill="none" stroke="${palette.secondary}" stroke-width="10.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${n(lengths[0])} ${n(gap)}"/>
    <g transform="translate(${n(initial.x)} ${n(initial.y)}) rotate(${angleAt(0)})">${face}</g>`;
  const angles = scene.frames.map((_, index) => angleAt(index));
  const turn = `<animateTransform attributeName="transform" type="rotate" values="${[angles[0], ...angles, angles.at(-1)!].join(';')}" keyTimes="${[0, ...scene.frames.map(frame => frame.time / duration), 1].map(time => time.toFixed(6)).join(';')}" calcMode="discrete" dur="${n(duration)}s" repeatCount="indefinite"/>`;
  const movingSnake = `<g class="snake-actor">${discrete('opacity', [
    { time: 0, value: '1' }, { time: duration - 0.6, value: '0' }, { time: duration, value: '0' },
  ], duration)}
    <path class="snake-body" d="${path}" fill="none" stroke="${palette.secondary}" stroke-width="10.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${n(lengths[0])} ${n(gap)}">
      ${series('stroke-dasharray', lengths.map(length => `${n(length)} ${n(gap)}`))}
      ${series('stroke-dashoffset', tails.map(tail => n(-tail)))}
    </path>
    <g class="snake-head" transform="translate(${n(initial.x)} ${n(initial.y)})">${motion(scene.frames.map(frame => ({ time: frame.time, ...pixel(frame.body[0]) })), duration)}
      <g transform="rotate(${angles[0]})">${turn}${face}</g>
    </g>
  </g>`;

  const states = [{ time: 0, length: scene.initialLength, eaten: 0 }, ...scene.meals.map((meal, index) => ({ time: meal.time, length: meal.length, eaten: index + 1 }))];
  const footer = states.map((state, index) => `<g class="${animated ? 'animated' : 'static'}" data-snake-length="${state.length}">
    ${animated ? discrete('opacity', [
      { time: 0, value: index === 0 ? '1' : '0' },
      ...(index ? [{ time: state.time, value: '1' }] : []),
      { time: states[index + 1]?.time || duration - 0.04, value: '0' },
      { time: duration - 0.04, value: index === 0 ? '1' : '0' }, { time: duration, value: index === 0 ? '1' : '0' },
    ], duration) : ''}
    <text x="854" y="406" text-anchor="end" font-size="11" class="mono" fill="${palette.secondary}">${state.length} SEGMENTS</text>
    <text x="854" y="425" text-anchor="end" font-size="9" class="mono" letter-spacing="0.6" fill="${palette.muted}">${state.eaten} / ${calendar.activeDays} DAYS EATEN</text>
  </g>`).filter((_, index) => animated || index === 0).join('');
  const content = `${calendar.cells.map(cell => square(cell, palette.empty)).join('')}
    <g class="${animated ? 'reduced' : 'static'}">${foods(false)}${staticSnake}</g>
    ${animated ? `<g class="animated">${foods(true)}${movingSnake}
      <rect x="48" y="376" width="0" height="2" rx="1" fill="${palette.secondary}" opacity="0.7">${discrete('width', [
        { time: 0, value: '0' }, ...scene.meals.map((meal, index) => ({ time: meal.time, value: n(BOARD.gridWidth * (index + 1) / Math.max(1, calendar.activeDays)) })),
        { time: duration - 0.04, value: '0' }, { time: duration, value: '0' },
      ], duration)}</rect></g>` : ''}`;
  return renderCard(calendar, theme, {
    label: '02 / GROWING SNAKE', scene: 'snake', duration,
    description: `A growing snake starts with ${scene.initialLength} segments and adds one segment for every active date it eats, finishing with ${scene.finalLength}. All ${calendar.activeDays} active dates are eaten without self-collision.`,
    attributes: { 'initial-length': scene.initialLength, 'final-length': scene.finalLength, active: calendar.activeDays },
    content, footer,
  });
}
