import type { Calendar } from './calendar.js';
import { BOARD, type Point, type Scene, type Brick } from './breakout.js';

export type Theme = 'dark' | 'light';
const THEMES = {
  dark: {
    background: '#111a17', border: '#2a3730', ink: '#eef3e9', muted: '#8b9c90',
    empty: '#202d26', colors: ['#202d26', '#365c49', '#58866a', '#88b591', '#c3dfb5'],
    accent: '#efc8a4', line: '#2b3930', secondary: '#b5ccb0',
  },
  light: {
    background: '#fbfcf8', border: '#dce3d6', ink: '#26392c', muted: '#788574',
    empty: '#eaf0e4', colors: ['#eaf0e4', '#c4d8b8', '#98bc8d', '#6d986e', '#426c50'],
    accent: '#b66d49', line: '#e0e7d9', secondary: '#53765a',
  },
};

export const escapeXML = (value: string): string => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[character]!);
const n = (value: number): string => Number(value.toFixed(3)).toString();
const fraction = (time: number, duration: number): string => n(Math.min(1, Math.max(0, time / duration)));
const number = (value: number): string => value.toLocaleString('en-US');

function discrete(attribute: string, events: { time: number; value: string }[], duration: number): string {
  // Use six decimals for event times: dense histories can have sub-millisecond hits.
  const times = events.map(event => (event.time / duration).toFixed(6));
  return `<animate attributeName="${attribute}" values="${events.map(event => event.value).join(';')}" keyTimes="${times.join(';')}" calcMode="discrete" dur="${n(duration)}s" repeatCount="indefinite"/>`;
}

function motion(points: Point[], duration: number): string {
  const ordered = [...points].sort((a, b) => a.time - b.time);
  const frames: Point[] = [{ ...ordered[0], time: 0 }];
  for (const point of ordered) {
    if (point.time - frames.at(-1)!.time < 0.00001) frames[frames.length - 1] = point;
    else frames.push(point);
  }
  frames.push({ ...frames.at(-1)!, time: duration });
  return `<animateTransform attributeName="transform" type="translate" values="${frames.map(point => `${n(point.x)} ${n(point.y)}`).join(';')}" keyTimes="${frames.map(point => (point.time / duration).toFixed(6)).join(';')}" dur="${n(duration)}s" repeatCount="indefinite"/>`;
}

function cellRect(brick: Brick, color: string, extra = ''): string {
  return `<rect x="${n(brick.x)}" y="${n(brick.y)}" width="${n(brick.size)}" height="${n(brick.size)}" rx="3" fill="${color}"${extra}/>`;
}

function monthLabels(calendar: Calendar, muted: string): string {
  let previous = '';
  return calendar.cells.filter(day => day.row === 0 || day.date === calendar.from).map(day => {
    const month = day.date.slice(0, 7);
    if (month === previous) return '';
    previous = month;
    const x = BOARD.left + day.column * BOARD.gridWidth / calendar.columns + 2;
    if (x > BOARD.right - 24) return '';
    const label = new Date(`${day.date}T00:00:00Z`).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    return `<text x="${n(x)}" y="97" fill="${muted}" font-size="10">${label}</text>`;
  }).join('');
}

export function renderSVG(calendar: Calendar, scene: Scene, theme: Theme, animated = true): string {
  const palette = THEMES[theme];
  const { width, height, paddleY, paddleWidth, paddleHeight } = BOARD;
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
  const fromYear = calendar.from.slice(0, 4);
  const toYear = calendar.to.slice(0, 4);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="background:${palette.background};border-radius:20px" role="img" aria-labelledby="title desc" data-duration="${n(duration)}" data-cleared="${scene.cleared}" data-active="${activeDays}">
  <title id="title">${escapeXML(calendar.login)} · Contribution Arcade</title>
  <desc id="desc">${number(calendar.total)} GitHub contributions across ${activeDays} active days, ${calendar.from} to ${calendar.to}. An automatically played breakout animation. Stronger contribution levels take more hits. A long streak unlocks multiball. The original calendar returns each loop.</desc>
  <style>text{font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.mono{font-family:'SFMono-Regular',Consolas,'Liberation Mono',monospace}.reduced{display:none}@media(prefers-reduced-motion:reduce){.animated{display:none}.reduced{display:inline}}</style>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="20" fill="${palette.background}" stroke="${palette.border}"/>
  <g fill="${palette.secondary}"><rect x="48" y="32" width="6" height="6" rx="1.3"/><rect x="57" y="32" width="6" height="6" rx="1.3" opacity="0.5"/><rect x="48" y="41" width="6" height="6" rx="1.3" opacity="0.5"/><rect x="57" y="41" width="6" height="6" rx="1.3"/></g>
  <text x="77" y="45" font-size="14" font-weight="600" fill="${palette.ink}" letter-spacing="-0.2">contribution arcade</text>
  <text x="1072" y="44" text-anchor="end" font-size="10" class="mono" letter-spacing="1.5" fill="${palette.muted}">01 / BREAKOUT</text>
  <path d="M48 65H1072" stroke="${palette.line}"/>
  ${monthLabels(calendar, palette.muted)}
  ${scene.bricks.map(brick => cellRect(brick, palette.empty)).join('')}
  ${staticScene}${film}${status}
  <path d="M48 376H1072" stroke="${palette.line}"/>
  <text x="48" y="406" font-size="15" font-weight="600" fill="${palette.ink}">@${escapeXML(calendar.login)}</text>
  <text x="48" y="425" font-size="10" fill="${palette.muted}" class="mono">${fromYear}${fromYear === toYear ? '' : ` — ${toYear}`}</text>
  <text x="343" y="406" font-size="15" font-weight="600" fill="${palette.ink}">${number(calendar.total)}<tspan dx="7" font-size="11" font-weight="400" fill="${palette.muted}">contributions</tspan></text>
  <text x="343" y="425" font-size="10" fill="${palette.muted}">${activeDays} active days · ${calendar.longestStreak} day longest streak</text>
  <g transform="translate(958 401)">${palette.colors.map((color, index) => `<rect x="${index * 16}" width="11" height="11" rx="2.5" fill="${color}"/>`).join('')}</g>
  <text x="1072" y="425" text-anchor="end" font-size="9" letter-spacing="1" fill="${palette.muted}" class="mono">YOUR COMMITS. YOUR GAME.</text>
</svg>`;
}
