import assert from 'node:assert/strict';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const catalog = JSON.parse(await readFile('generated/arcade.json', 'utf8'));
const summaries = new Map(await Promise.all(catalog.scenes.map(async scene => [scene.id,
  JSON.parse(await readFile(`generated/${scene.id === 'breakout' ? 'summary' : `${scene.id}-summary`}.json`, 'utf8'))])));
const snake = summaries.get('snake');
const breakout = summaries.get('breakout');
const input = JSON.parse(await readFile('generated/calendar.json', 'utf8'));
const actualDays = input.calendar.weeks.flatMap((week, column) => week.contributionDays.map(day => ({ date: day.date, column, row: day.weekday, count: day.contributionCount })));
const columns = input.calendar.weeks.length;
const server = await serve(0);
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const errors = [];
await mkdir('previews', { recursive: true });
async function settle(page) { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function seek(page, time, id) {
  await page.evaluate(({ time, id }) => {
    const svg = id ? document.querySelector(`#${id}-board`).contentDocument.documentElement : document.documentElement;
    svg.pauseAnimations(); svg.setCurrentTime(time);
  }, { time, id });
  await settle(page);
}
async function loadBoards(page, theme = 'dark') {
  await page.waitForFunction(({ ids, theme }) => ids.every(id => {
    const board = document.querySelector(`#${id}-board`);
    return board?.contentDocument?.documentElement?.dataset.scene === id && board.data.endsWith(`-${theme}.svg`);
  }), { ids: catalog.scenes.map(scene => scene.id), theme });
}
async function contactSheet(theme) {
  const page = await browser.newPage({ viewport: { width: 1680, height: 1900 } });
  await page.setContent(`<html style="background:${theme === 'dark' ? '#0c120f' : '#f3f5ed'};color:${theme === 'dark' ? '#eaf0e4' : '#27392c'};font-family:sans-serif"><body style="margin:0;display:grid;grid-template-columns:repeat(3,560px)">${catalog.scenes.map(scene => `<div><p style="font-size:12px;margin:10px 20px">${scene.number} · ${scene.title}</p><img style="width:560px;display:block" src="${base}/previews/${scene.id}-${theme}.png" alt="${scene.title}"></div>`).join('')}</body></html>`);
  await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth));
  await page.screenshot({ path: `previews/collection-${theme}.png`, fullPage: true });
  await page.close();
}
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1120 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (!response.ok()) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto(base); await loadBoards(page);
  assert.equal(await page.locator('.scene').count(), 19);
  for (const scene of catalog.scenes) assert.equal(await page.getByRole('heading', { name: scene.title, exact: true }).count(), 1);
  for (const category of ['Arcade', 'Worlds', 'Journeys', 'Patterns']) {
    await page.getByRole('button', { name: new RegExp(`^${category}`) }).click();
    assert.equal(await page.locator('.scene:visible').count(), catalog.scenes.filter(scene => scene.category === category).length);
  }
  await page.getByRole('button', { name: /^All/ }).click();
  assert.equal(await page.locator('.scene:visible').count(), 19);
  const widths = await page.locator('.board').evaluateAll(boards => boards.map(board => board.getBoundingClientRect().width));
  assert.ok(widths.every(width => Math.abs(width - widths[0]) < 1 && width >= 1000), 'every original calendar gets the same readable full-width board');

  await page.locator('#breakout').scrollIntoViewIfNeeded();
  const ballPosition = () => page.locator('#breakout-board').evaluate(board => {
    const matrix = board.contentDocument.querySelector('.ball')?.getCTM(); return matrix ? [matrix.e, matrix.f] : null;
  });
  await seek(page, 4, 'breakout'); const position = await ballPosition();
  await seek(page, 8, 'breakout');
  if (breakout.activeDays) assert.notDeepEqual(await ballPosition(), position);
  if (breakout.balls === 3) for (const [time, count] of [[4, 1], [15, 2], [26, 3]]) {
    await seek(page, time, 'breakout');
    const visible = await page.locator('#breakout-board').evaluate(board => [...board.contentDocument.querySelectorAll('.ball > g')].filter(ball => Number(getComputedStyle(ball).opacity) > 0).length);
    assert.equal(visible, count);
  }

  await page.locator('#snake').scrollIntoViewIfNeeded();
  const snakeState = () => page.locator('#snake-board').evaluate(board => {
    const doc = board.contentDocument;
    return { segments: [...doc.querySelectorAll('[data-snake-length]')].filter(group => Number(getComputedStyle(group).opacity) > 0).map(group => Number(group.dataset.snakeLength)),
      food: [...doc.querySelectorAll('.snake-food')].filter(group => Number(getComputedStyle(group).opacity) > 0).length };
  });
  await seek(page, 0, 'snake');
  assert.deepEqual((await snakeState()).segments, [snake.initialLength]);
  assert.equal((await snakeState()).food, snake.activeDays);
  assert.ok(snake.meals.every((meal, index) => !index || meal.count >= snake.meals[index - 1].count));
  assert.ok(snake.finalLength <= snake.maxLength);
  for (const index of [...new Set([0, snake.growthEvery - 1, Math.floor(snake.meals.length / 2)])].filter(index => index < snake.meals.length)) {
    const meal = snake.meals[index], previousLength = snake.meals[index - 1]?.length || snake.initialLength;
    await seek(page, meal.time - .002, 'snake'); assert.deepEqual((await snakeState()).segments, [previousLength]);
    await seek(page, meal.time + .002, 'snake'); assert.deepEqual((await snakeState()).segments, [meal.length]);
    const collision = await page.locator('#snake-board').evaluate((board, date) => {
      const doc = board.contentDocument, head = doc.querySelector('.snake-head').getCTM();
      const food = doc.querySelector(`.snake-food[data-date="${date}"]`), rect = food.querySelector('rect'), box = rect.getBBox();
      const point = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2).matrixTransform(rect.getCTM());
      return { distance: Math.hypot(head.e - point.x, head.f - point.y), opacity: Number(getComputedStyle(food).opacity) };
    }, meal.date);
    assert.ok(collision.distance < 1, 'A disappearing date must touch the snake head.'); assert.equal(collision.opacity, 0);
  }
  await seek(page, snake.playEnd + .2, 'snake');
  assert.deepEqual((await snakeState()).segments, [snake.finalLength]); assert.equal((await snakeState()).food, 0);

  await page.getByRole('button', { name: 'Pause Breakout', exact: true }).click();
  await page.getByRole('button', { name: 'Replay Growing Snake', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Play Breakout', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.getByRole('button', { name: 'Pause Growing Snake', exact: true }).getAttribute('aria-pressed'), 'false');
  for (const theme of ['dark', 'light']) {
    if (theme === 'light') await page.getByRole('button', { name: 'Paper', exact: true }).click();
    await loadBoards(page, theme);
    assert.equal(await page.getByRole('button', { name: 'Play Breakout', exact: true }).getAttribute('aria-pressed'), 'true');
    for (const scene of catalog.scenes) {
      assert.ok((await page.getByRole('link', { name: `Download ${scene.title} SVG`, exact: true }).getAttribute('href')).endsWith(`${scene.id}-${theme}.svg`));
      await seek(page, scene.id === 'snake' ? snake.duration * .45 : scene.duration * .62, scene.id);
    }
    await page.screenshot({ path: `previews/preview-${theme}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.body.scrollWidth <= innerWidth));
  await page.screenshot({ path: 'previews/preview-mobile.png', fullPage: true });
  console.log('Gallery: all nineteen headings, categories, full-width calendars, independent controls, both themes, and mobile passed.');

  const board = await browser.newPage({ viewport: { width: 1120, height: 448 } });
  const reduced = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 1120, height: 448 } });
  for (const scene of catalog.scenes) {
    const summary = summaries.get(scene.id), checkpoints = summary.checkpoints || [2, scene.duration * .45, scene.duration - 4];
    await board.goto(`${base}/generated/${scene.id}-dark.svg`);
    assert.equal(await board.locator('parsererror').count(), 0);
    const calendarTiles = await board.locator('[data-calendar-grid] rect[data-cell-date]').evaluateAll(tiles => tiles.map(tile => {
      const box = tile.getBBox(), point = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2).matrixTransform(tile.getCTM());
      return { date: tile.dataset.cellDate, column: Number(tile.dataset.column), row: Number(tile.dataset.row), count: Number(tile.dataset.count), x: point.x, y: point.y };
    }));
    assert.equal(calendarTiles.length, actualDays.length, `${scene.id}: original number of calendar dates`);
    calendarTiles.forEach((tile, index) => {
      const day = actualDays[index];
      assert.deepEqual({ date: tile.date, column: tile.column, row: tile.row, count: tile.count }, day);
      assert.ok(Math.abs(tile.x - (48 + (day.column + .5) * 1024 / columns)) < .002);
      assert.ok(Math.abs(tile.y - (121.25 + day.row * 19)) < .002);
    });
    const frames = [];
    for (const time of checkpoints) { await seek(board, time); frames.push(await board.screenshot()); }
    if (breakout.activeDays) assert.ok(frames.some(frame => !frame.equals(frames[0])), `${scene.title}: expected a visible state transition.`);
    for (const theme of ['dark', 'light']) {
      await board.goto(`${base}/generated/${scene.id}-${theme}.svg`);
      const poster = scene.id === 'snake' ? snake.playEnd + .2
        : scene.category === 'Worlds' || scene.id === 'weather' ? checkpoints.at(-1)
        : scene.id === 'ants' ? scene.duration * .55
        : scene.id === 'tetris' ? scene.duration * .72 : checkpoints[1];
      await seek(board, poster);
      await board.screenshot({ path: `previews/${scene.id}-${theme}.png` });
      await board.goto(`${base}/generated/${scene.id}-${theme}-static.svg`);
      assert.equal(await board.locator('animate, animateTransform, script, foreignObject, parsererror').count(), 0);
    }
    await reduced.goto(`${base}/generated/${scene.id}-dark.svg`);
    assert.deepEqual(await reduced.evaluate(() => ({ animated: getComputedStyle(document.querySelector('.animated')).display, reduced: getComputedStyle(document.querySelector('.reduced')).display })), { animated: 'none', reduced: 'inline' });
    console.log(`Rendered ${scene.id}: original calendar geometry, state transitions, static themes, and reduced motion passed.`);
  }
  await reduced.close();
  await contactSheet('dark'); await contactSheet('light');

  // External SVG images have their own animation clock. Exercise real image
  // embedding with wall-clock time as well as seekable standalone documents.
  if (!process.argv.includes('--skip-images')) {
    const pending = [...catalog.scenes];
    await Promise.all(Array.from({ length: 4 }, async () => {
      const imagePage = await browser.newPage({ viewport: { width: 960, height: 430 } });
      for (let scene; (scene = pending.shift());) {
        await imagePage.setContent(`<img width="900" src="${base}/generated/${scene.id}-dark.svg" alt="${scene.title}">`);
        await imagePage.waitForFunction(() => document.querySelector('img').complete && document.querySelector('img').naturalWidth === 1120);
        const summary = summaries.get(scene.id);
        const first = summary.events?.find(event => event.time > 0 && (event.value || 0) > 0)?.time || 2;
        await imagePage.waitForTimeout(Math.min(18000, Math.max(2200, first * 1000)));
        const before = await imagePage.locator('img').screenshot();
        let changed = false;
        for (let attempt = 0; attempt < 5 && !changed; attempt++) {
          await imagePage.waitForTimeout(450);
          changed = !(await imagePage.locator('img').screenshot()).equals(before);
        }
        if (breakout.activeDays) assert.ok(changed, `${scene.title}: image embedding must show animation.`);
        console.log(`README image animation passed: ${scene.id}`);
      }
      await imagePage.close();
    }));
  }
  if (process.argv.includes('--frames')) {
    const option = process.argv.indexOf('--scene'), id = option >= 0 ? process.argv[option + 1] : 'breakout';
    const scene = catalog.scenes.find(scene => scene.id === id); assert.ok(scene, `Unknown scene: ${id}`);
    await rm('previews/frames', { recursive: true, force: true }); await mkdir('previews/frames', { recursive: true });
    await board.goto(`${base}/generated/${id}-dark.svg`);
    const count = Math.ceil(scene.duration * 12);
    for (let frame = 0; frame < count; frame++) {
      await seek(board, frame / 12);
      await board.screenshot({ path: `previews/frames/${String(frame).padStart(4, '0')}.png` });
      if (frame % 120 === 0) console.log(`Captured ${id} ${frame}/${count} frames`);
    }
  }
  assert.deepEqual(errors, []);
  console.log('Browser checks passed for the complete arcade collection.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
