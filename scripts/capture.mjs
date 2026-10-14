import assert from 'node:assert/strict';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const catalog = JSON.parse(await readFile('generated/arcade.json', 'utf8'));
const breakout = JSON.parse(await readFile('generated/summary.json', 'utf8'));
const snake = JSON.parse(await readFile('generated/snake-summary.json', 'utf8'));
const server = await serve(0);
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const errors = [];
await mkdir('previews', { recursive: true });

async function loadBoards(page, theme = 'dark') {
  await page.waitForFunction(({ ids, theme }) => ids.every(id => {
    const board = document.querySelector(`#${id}-board`);
    return board?.contentDocument?.documentElement?.dataset.scene === id && board.data.endsWith(`-${theme}.svg`);
  }), { ids: catalog.scenes.map(scene => scene.id), theme });
}
async function seek(page, time, id = 'breakout') {
  await page.evaluate(({ time, id }) => {
    const root = document.querySelector(`#${id}-board`)?.contentDocument?.documentElement || document.documentElement;
    root.pauseAnimations(); root.setCurrentTime(time);
  }, { time, id });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function paused(page, id) {
  return page.locator(`#${id}-board`).evaluate(board => board.contentDocument.documentElement.animationsPaused());
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1120 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (!response.ok()) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto(base);
  await loadBoards(page);
  assert.equal(await page.locator('.scene').count(), catalog.scenes.length);
  assert.ok((await page.title()).includes(catalog.username));
  assert.equal(await page.getByRole('heading', { name: 'Breakout', exact: true }).count(), 1);
  assert.equal(await page.getByRole('heading', { name: 'Growing Snake', exact: true }).count(), 1);

  const ballPosition = () => page.locator('#breakout-board').evaluate(board => {
    const matrix = board.contentDocument.querySelector('.ball')?.getCTM();
    return matrix ? [matrix.e, matrix.f] : null;
  });
  await seek(page, 4);
  const firstPosition = await ballPosition();
  await seek(page, 8);
  if (breakout.activeDays) assert.notDeepEqual(await ballPosition(), firstPosition);
  if (breakout.balls === 3 && breakout.duration > 28) {
    for (const [time, expected] of [[4, 1], [15, 2], [26, 3]]) {
      await seek(page, time);
      const visible = await page.locator('#breakout-board').evaluate(board => [...board.contentDocument.querySelectorAll('.ball > g')]
        .filter(ball => Number(getComputedStyle(ball).opacity) > 0).length);
      assert.equal(visible, expected, `Expected ${expected} visible balls at ${time}s`);
    }
  }

  async function snakeState() {
    return page.locator('#snake-board').evaluate(board => {
      const doc = board.contentDocument;
      return {
        bodyLength: parseFloat(getComputedStyle(doc.querySelector('.snake-body')).strokeDasharray),
        segments: [...doc.querySelectorAll('[data-snake-length]')]
          .filter(counter => Number(getComputedStyle(counter).opacity) > 0)
          .map(counter => Number(counter.dataset.snakeLength)),
        food: [...doc.querySelectorAll('.snake-food')].filter(food => Number(getComputedStyle(food).opacity) > 0).length,
      };
    });
  }
  await seek(page, 0, 'snake');
  const initial = await snakeState();
  assert.deepEqual(initial.segments, [snake.initialLength]);
  assert.equal(initial.food, snake.activeDays);
  if (snake.meals.length) {
    const meal = snake.meals[Math.floor(snake.meals.length / 2)];
    await seek(page, meal.time - 0.002, 'snake');
    const previousMeal = snake.meals[snake.meals.indexOf(meal) - 1];
    assert.deepEqual((await snakeState()).segments, [previousMeal?.length || snake.initialLength]);
    // Normalized SMIL keyTimes have six decimal places; cross the boundary by
    // a millisecond rather than depending on sub-millisecond rounding.
    await seek(page, meal.time + 0.001, 'snake');
    assert.deepEqual((await snakeState()).segments, [meal.length]);
    const collision = await page.locator('#snake-board').evaluate((board, date) => {
      const doc = board.contentDocument;
      const head = doc.querySelector('.snake-head').getCTM();
      const food = doc.querySelector(`.snake-food[data-date="${date}"]`);
      const rect = food.querySelector('rect');
      const box = rect.getBBox();
      const center = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2).matrixTransform(rect.getCTM());
      return { distance: Math.hypot(head.e - center.x, head.f - center.y), opacity: Number(getComputedStyle(food).opacity) };
    }, meal.date);
    assert.ok(collision.distance < 1, 'The head must reach the date that disappears.');
    assert.equal(collision.opacity, 0);
  }
  await seek(page, snake.playEnd + 0.3, 'snake');
  const final = await snakeState();
  assert.deepEqual(final.segments, [snake.finalLength]);
  assert.equal(final.food, 0);
  if (snake.activeDays) assert.ok(final.bodyLength > initial.bodyLength);

  // Each scene keeps its own playback state, including across theme changes.
  await page.getByRole('button', { name: 'Replay Growing Snake', exact: true }).click();
  await page.getByRole('button', { name: 'Pause Breakout', exact: true }).click();
  assert.equal(await paused(page, 'breakout'), true);
  assert.equal(await paused(page, 'snake'), false);
  await seek(page, 4);
  await seek(page, snake.duration * 0.45, 'snake');
  await page.screenshot({ path: 'previews/preview-dark.png', fullPage: true });

  await page.getByRole('button', { name: 'Paper', exact: true }).click();
  await loadBoards(page, 'light');
  assert.equal(await paused(page, 'breakout'), true);
  assert.equal(await paused(page, 'snake'), false);
  for (const scene of catalog.scenes) {
    assert.ok((await page.getByRole('link', { name: `Download ${scene.title} SVG`, exact: true }).getAttribute('href')).endsWith(`${scene.id}-light.svg`));
  }
  await seek(page, 4);
  await seek(page, snake.duration * 0.45, 'snake');
  await page.screenshot({ path: 'previews/preview-light.png', fullPage: true });
  const snakeTime = await page.locator('#snake-board').evaluate(board => board.contentDocument.documentElement.getCurrentTime());
  await page.getByRole('button', { name: 'Replay Breakout', exact: true }).click();
  assert.equal(await paused(page, 'breakout'), false);
  assert.ok(await page.locator('#breakout-board').evaluate(board => board.contentDocument.documentElement.getCurrentTime() < 1));
  assert.ok(Math.abs(await page.locator('#snake-board').evaluate(board => board.contentDocument.documentElement.getCurrentTime()) - snakeTime) < 0.05);

  await page.setViewportSize({ width: 390, height: 844 });
  await seek(page, 4);
  await seek(page, snake.duration * 0.45, 'snake');
  assert.ok(await page.evaluate(() => document.body.scrollWidth <= innerWidth));
  await page.screenshot({ path: 'previews/preview-mobile.png', fullPage: true });

  // README-style image embedding must animate, not just decode successfully.
  await page.setViewportSize({ width: 1120, height: 500 });
  for (const scene of catalog.scenes) {
    await page.setContent(`<img src="${base}/generated/${scene.id}-dark.svg" alt="${scene.title}" width="900">`);
    await page.waitForFunction(() => document.querySelector('img').complete && document.querySelector('img').naturalWidth > 0);
    assert.equal(await page.locator('img').evaluate(image => image.naturalWidth), 1120);
    if (breakout.activeDays) {
      await page.waitForTimeout(2100);
      const first = await page.locator('img').screenshot();
      await page.waitForTimeout(250);
      assert.notDeepEqual(await page.locator('img').screenshot(), first, `${scene.title} must animate inside an image.`);
    }
  }

  const reduced = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 1120, height: 448 } });
  const board = await browser.newPage({ viewport: { width: 1120, height: 448 } });
  for (const scene of catalog.scenes) {
    await reduced.goto(`${base}/generated/${scene.id}-dark.svg`);
    const modes = await reduced.evaluate(() => ({
      animated: getComputedStyle(document.querySelector('.animated')).display,
      reduced: getComputedStyle(document.querySelector('.reduced')).display,
    }));
    assert.equal(modes.animated, 'none');
    assert.equal(modes.reduced, 'inline');
    for (const theme of ['dark', 'light']) {
      await board.goto(`${base}/generated/${scene.id}-${theme}.svg`);
      await seek(board, scene.id === 'snake' ? snake.playEnd + 0.3 : 4);
      await board.screenshot({ path: `previews/${scene.id}-${theme}.png` });
    }
  }

  if (process.argv.includes('--frames')) {
    const option = process.argv.indexOf('--scene');
    const id = option >= 0 ? process.argv[option + 1] : 'breakout';
    const scene = catalog.scenes.find(scene => scene.id === id);
    assert.ok(scene, `Unknown scene: ${id}`);
    await rm('previews/frames', { recursive: true, force: true });
    await mkdir('previews/frames', { recursive: true });
    await board.goto(`${base}/generated/${id}-dark.svg`);
    const count = Math.ceil(scene.duration * 12);
    for (let frame = 0; frame < count; frame++) {
      await seek(board, frame / 12);
      await board.screenshot({ path: `previews/frames/${String(frame).padStart(4, '0')}.png` });
      if (frame % 120 === 0) console.log(`Captured ${id} ${frame}/${count} frames`);
    }
  }
  assert.deepEqual(errors, []);
  console.log('Browser checks passed: both gallery scenes, visible snake growth and meals, gradual multiball, independent playback, themes, mobile layout, animated README images, and reduced motion.');
  console.log('Preview screenshots saved to previews/.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
