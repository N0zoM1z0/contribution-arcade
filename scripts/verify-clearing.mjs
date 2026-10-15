import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { THEMES } from '../lib/card.js';
import { normalizeCalendar } from '../lib/calendar.js';
import { simulate } from '../lib/breakout.js';
import { simulateTetris } from '../lib/scenes/arcade.js';

const consumers = {
  pacman: 'pellet', snake: 'meal', invaders: 'invader-hit', archaeology: 'ore-excavate',
  dungeon: 'room-loot', ants: 'harvest', 'whack-a-mole': 'hammer-hit',
};
async function seek(page, time) {
  await page.evaluate(time => { document.documentElement.pauseAnimations(); document.documentElement.setCurrentTime(time); }, time);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function pixels(inspector, frame, points) {
  return inspector.evaluate(async ({ png, points }) => {
    const image = new Image(); image.src = `data:image/png;base64,${png}`; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
    return points.map(({ x, y }) => [...context.getImageData(Math.round(x), Math.round(y), 1, 1).data].slice(0, 3));
  }, { png: frame.toString('base64'), points });
}

/** Check painted output: hiding the actor while leaving its date tile must fail. */
export async function verifyClearing(browser, base, catalog, summaries, input) {
  const calendar = normalizeCalendar(input), breakout = simulate(calendar);
  const board = await browser.newPage({ viewport: { width: 1120, height: 448 } });
  const inspector = await browser.newPage();
  const reduced = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 1120, height: 448 } });
  try {
    for (const id of ['breakout', ...Object.keys(consumers), 'tetris', 'match3']) {
      const summary = summaries.get(id), scene = catalog.scenes.find(scene => scene.id === id);
      let date, afterTime = scene.duration - .5;
      if (id === 'breakout') date = breakout.bricks.find(brick => brick.hits.some(hit => hit.hp === 0))?.cell.date;
      else if (id === 'snake') date = summary.meals[0]?.date;
      else if (id === 'tetris') {
        const drop = simulateTetris(calendar).drops.find(drop => drop.clearedRows.some(row => calendar.cells.some(cell => cell.row === row && drop.after[row][cell.column] === null)));
        date = drop && calendar.cells.find(cell => drop.clearedRows.includes(cell.row) && drop.after[cell.row][cell.column] === null)?.date;
        if (drop) afterTime = drop.clearAt + .001;
      } else if (id === 'match3') date = summary.events.find(event => event.type === 'gem-match' && event.data.row === 0)?.date;
      else date = summary.events.find(event => event.type === consumers[id])?.date;
      if (!date) continue; // Empty calendars or puzzle boards with no legal match/line.
      const day = calendar.cells.find(cell => cell.date === date);
      const x = 48 + (day.column + .5) * 1024 / calendar.columns, y = 121.25 + day.row * 19;
      const points = [[0, 0], [-4, -4], [4, -4], [-4, 4], [4, 4]].map(([dx, dy]) => ({ x: x + dx, y: y + dy }));
      for (const theme of ['dark', 'light']) {
        await board.goto(`${base}/generated/${id}-${theme}.svg`);
        await seek(board, 0);
        const before = await board.screenshot();
        const background = THEMES[theme].background.match(/[\da-f]{2}/gi).map(hex => Number.parseInt(hex, 16));
        const painted = await pixels(inspector, before, points);
        assert.ok(painted.some(pixel => pixel.some((channel, index) => Math.abs(channel - background[index]) > 2)), `${id}/${theme}: original date tile is initially visible`);
        await seek(board, afterTime);
        const after = await board.screenshot();
        const cleared = await pixels(inspector, after, points);
        assert.ok(cleared.every(pixel => pixel.every((channel, index) => Math.abs(channel - background[index]) <= 2)), `${id}/${theme}: ${date} must leave actual background pixels, got ${JSON.stringify(cleared)}`);
        if (id !== 'tetris') {
          await seek(board, scene.duration - .005);
          assert.deepEqual(await pixels(inspector, await board.screenshot(), points), cleared, `${id}/${theme}: cleared paint must not reappear before the next loop`);
        }
        // A loop starts with the original date graph again.
        await seek(board, scene.duration + .001);
        const reset = await pixels(inspector, await board.screenshot(), points);
        assert.deepEqual(reset, painted, `${id}/${theme}: replay restores the date tile`);
        if (id === 'whack-a-mole') {
          await board.goto(`${base}/generated/${id}-${theme}.svg`); await seek(board, 0);
          await board.screenshot({ path: `previews/clearing-before-${theme}.png` });
          await seek(board, scene.duration - .5);
          await board.screenshot({ path: `previews/clearing-after-${theme}.png` });
          const miss = summary.events.find(event => event.type === 'hammer-miss');
          if (miss) {
            const missed = calendar.cells.find(cell => cell.date === miss.date);
            const point = { x: 48 + (missed.column + .5) * 1024 / calendar.columns, y: 121.25 + missed.row * 19 };
            const [pixel] = await pixels(inspector, after, [point]);
            assert.ok(pixel.some((channel, index) => Math.abs(channel - background[index]) > 2), 'A missed mole keeps its date tile.');
          }
          // GitHub embeds the SVG as an image, with its own real-time clock.
          await inspector.setViewportSize({ width: 1120, height: 448 });
          await inspector.setContent(`<body style="margin:0"><img style="display:block" width="1120" height="448" src="${base}/generated/${id}-${theme}.svg" alt="Whack-a-Mole"></body>`);
          await inspector.waitForFunction(() => document.querySelector('img').complete && document.querySelector('img').naturalWidth);
          const imageBefore = await pixels(inspector, await inspector.screenshot(), points);
          assert.ok(imageBefore.some(pixel => pixel.some((channel, index) => Math.abs(channel - background[index]) > 2)));
          const hit = summary.events.find(event => event.type === 'hammer-hit' && event.date === date);
          await inspector.waitForTimeout((hit.time + .35) * 1000);
          const imageAfter = await pixels(inspector, await inspector.screenshot(), points);
          assert.ok(imageAfter.every(pixel => pixel.every((channel, index) => Math.abs(channel - background[index]) <= 2)), `${id}/${theme}: README image embedding must also clear the whole date tile`);
        }
      }
      await reduced.goto(`${base}/generated/${id}-dark.svg`); await seek(reduced, 0);
      const reducedBefore = await reduced.screenshot();
      await seek(reduced, scene.duration - .5);
      assert.ok((await reduced.screenshot()).equals(reducedBefore), `${id}: reduced motion must hold its complete still frame, including cleared tiles`);
      console.log(`Clearing pixels passed: ${id}, both themes, replay, and reduced motion.`);
    }
    // Damage is distinct from destruction, even when the ball has already hit.
    const strong = breakout.bricks.find(brick => brick.hits.some(hit => hit.hp > 0));
    if (strong) {
      await board.goto(`${base}/generated/breakout-dark.svg`);
      await seek(board, strong.hits.find(hit => hit.hp > 0).time + .001);
      assert.equal(await board.locator(`[data-cell-date="${strong.cell.date}"]`).evaluate(tile => Number(getComputedStyle(tile).opacity)), 1);
    }
    if (summaries.get('whack-a-mole').events.some(event => event.type === 'hammer-hit')) {
      await inspector.setViewportSize({ width: 1120, height: 976 });
      await inspector.setContent(`<html style="background:#0c120f;color:#b5ccb0;font:12px system-ui"><body style="margin:0">${[
        ['before', 'BEFORE / ORIGINAL CALENDAR'], ['after', 'AFTER / SUCCESSFUL HITS LEAVE GAPS'],
      ].map(([state, label]) => `<p style="margin:0;padding:14px 20px;box-sizing:border-box;height:40px;letter-spacing:1px">${label}</p><img style="display:block;width:1120px;height:448px" src="${base}/previews/clearing-${state}-dark.png" alt="${label}">`).join('')}</body></html>`);
      await inspector.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth));
      await inspector.screenshot({ path: 'previews/clearing-comparison.png' });
    }
  } finally { await board.close(); await inspector.close(); await reduced.close(); }
}

if (process.argv[1]?.endsWith('/verify-clearing.mjs')) {
  const { chromium } = await import('playwright');
  const { serve } = await import('./serve.mjs');
  const catalog = JSON.parse(await readFile('generated/arcade.json', 'utf8'));
  const summaries = new Map(await Promise.all(catalog.scenes.map(async scene => [scene.id,
    JSON.parse(await readFile(`generated/${scene.id === 'breakout' ? 'summary' : `${scene.id}-summary`}.json`, 'utf8'))])));
  const server = await serve(0), browser = await chromium.launch();
  try { await verifyClearing(browser, `http://127.0.0.1:${server.address().port}`, catalog, summaries, JSON.parse(await readFile('generated/calendar.json', 'utf8'))); }
  finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
