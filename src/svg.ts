import type { Calendar } from './calendar.js';
import { BOARD, type Scene, type Brick } from './breakout.js';
import { THEMES, n, discrete, motion, renderCard, type Theme } from './card.js';
export { escapeXML, type Theme } from './card.js';
const fraction = (time: number, duration: number): string => n(Math.min(1, Math.max(0, time / duration)));

function cellRect(brick: Brick, color: string, extra = ''): string {
  return `<rect x="${n(brick.x)}" y="${n(brick.y)}" width="${n(brick.size)}" height="${n(brick.size)}" rx="3" fill="${color}"${extra}/>`;
}

export function renderSVG(calendar: Calendar, scene: Scene, theme: Theme, animated = true): string {
  const palette = THEMES[theme];
  const { width, paddleY, paddleWidth, paddleHeight } = BOARD;
  const duration = scene.duration;
  const initialCells = scene.bricks.filter(brick => brick.initialHp > 0)
    .map(brick => cellRect(brick, palette.colors[brick.cell.level])).join('');
  const parkPaddle = `<rect x="${(width - paddleWidth) / 2}" y="${paddleY}" width="${paddleWidth}" height="${paddleHeight}" rx="4" fill="${palette.accent}"/>`;

  const animatedCells = scene.bricks.filter(brick => brick.initialHp > 0).map(brick => {
    if (!brick.hits.length) return cellRect(brick, palette.colors[brick.cell.level]);
    const events = [
      { time: 0, value: '1' },
      ...brick.hits.map(hit => ({ time: hit.time, value: hit.hp === 0 ? '0' : '0.52' })),
      { time: duration - 0.5, value: '0' },
      { time: duration - 0.04, value: '1' },
      { time: duration, value: '1' },
    ];
    return `<g data-date="${brick.cell.date}">${cellRect(brick, palette.colors[brick.cell.level])}${discrete('opacity', events, duration)}</g>`;
  }).join('');

  const ballMarkup = scene.balls.map((ball, index) => {
    const color = index === 0 ? palette.accent : palette.secondary;
    const visibility = [
      { time: 0, value: '0' },
      { time: ball.start, value: '1' },
      { time: scene.playEnd + 0.15, value: '0' },
      { time: duration, value: '0' },
    ];
    return `<g class="ball" transform="translate(${width / 2} ${paddleY - 12})">${motion(ball.points, duration)}
      <g opacity="0">${discrete('opacity', visibility, duration)}
        <circle r="8" fill="${color}" opacity="0.12"/>
        <circle r="${BOARD.ballRadius}" fill="${color}"/>
        <circle cx="-1" cy="-1" r="1.2" fill="${palette.background}" opacity="0.18"/>
      </g></g>`;
  }).join('');

  const sparks = scene.impacts.filter(impact => impact.destroyed).filter((_, index) => index % 3 === 0).map(impact => {
    const show = fraction(impact.time, duration);
    const hide = fraction(impact.time + 0.18, duration);
    return `<g transform="translate(${n(impact.x)} ${n(impact.y)})" opacity="0" stroke="${palette.accent}" stroke-width="1.2" stroke-linecap="round">
      <path d="M-7-7l-3-3M7-7l3-3M-7 7l-3 3M7 7l3 3"/>
      <animate attributeName="opacity" values="0;0;0.8;0;0" keyTimes="0;${show};${show};${hide};1" dur="${n(duration)}s" repeatCount="indefinite"/>
    </g>`;
  }).join('');

  const activeDays = calendar.activeDays;
  const progressEvents = [
    { time: 0, value: '0' },
    ...scene.impacts.filter(impact => impact.destroyed).map((impact, index) => ({
      time: impact.time, value: n(BOARD.gridWidth * (index + 1) / Math.max(1, activeDays)),
    })),
    { time: duration - 0.04, value: '0' }, { time: duration, value: '0' },
  ];

  const staticScene = `<g class="${animated ? 'reduced' : 'static'}">${initialCells}${parkPaddle}</g>`;
  const film = animated ? `<g class="animated">${animatedCells}
    <g transform="translate(${width / 2} ${paddleY})">${motion(scene.paddle, duration)}<rect x="${-paddleWidth / 2}" width="${paddleWidth}" height="${paddleHeight}" rx="4" fill="${palette.accent}"/></g>
    ${ballMarkup}${sparks}
    <rect x="${BOARD.left}" y="376" width="0" height="2" rx="1" fill="${palette.secondary}" opacity="0.7">${discrete('width', progressEvents, duration)}</rect>
  </g>` : '';
  const endMessage = calendar.activeDays === 0 ? 'A fresh canvas. Your next chapter starts here.' : 'Built one day at a time.';
  const status = animated && calendar.activeDays ? `<g class="animated" opacity="0">
    ${discrete('opacity', [{ time: 0, value: '0' }, { time: scene.playEnd + 0.3, value: '1' }, { time: duration - 0.5, value: '0' }, { time: duration, value: '0' }], duration)}
    <text x="560" y="292" text-anchor="middle" font-size="14" fill="${palette.muted}">${endMessage}</text>
  </g>` : '';
  const phaseLabels = ['WARM UP', 'PICKING UP', 'IN THE FLOW'];
  const phaseMarkup = animated ? scene.balls.map((ball, index) => {
    const start = index === 0 ? 0 : ball.start;
    const end = scene.balls[index + 1]?.start || duration;
    const events = [{ time: 0, value: index === 0 ? '1' : '0' }];
    if (index > 0) events.push({ time: start, value: '1' });
    if (end < duration) events.push({ time: end, value: '0' });
    events.push({ time: duration, value: index === 0 ? '1' : '0' });
    return `<g class="animated">${discrete('opacity', events, duration)}
      <text x="854" y="406" text-anchor="end" font-size="11" class="mono" fill="${palette.secondary}">${index + 1} ${index === 0 ? 'BALL' : 'BALLS'}</text>
      <text x="854" y="425" text-anchor="end" font-size="9" class="mono" letter-spacing="0.8" fill="${palette.muted}">${phaseLabels[index]}</text>
    </g>`;
  }).join('') : '';

  return renderCard(calendar, theme, {
    label: '01 / BREAKOUT', scene: 'breakout', duration,
    description: 'An automatically played breakout animation. Stronger contribution levels take more hits. A long streak unlocks multiball. The original calendar returns each loop.',
    attributes: { cleared: scene.cleared, active: activeDays },
    content: `${scene.bricks.map(brick => cellRect(brick, palette.empty)).join('')}${staticScene}${film}${status}`,
    footer: phaseMarkup,
  });
}
