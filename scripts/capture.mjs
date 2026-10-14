import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const server = await serve(0);
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const errors = [];
const summary = JSON.parse(await readFile('generated/summary.json', 'utf8'));
await mkdir('previews', { recursive: true });

async function loadBoard(page) {
  await page.waitForFunction(() => document.querySelector('#board')?.contentDocument?.documentElement?.getCurrentTime);
}
async function seek(page, time) {
  await page.evaluate(time => {
    const root = document.querySelector('#board')?.contentDocument?.documentElement || document.documentElement;
    root.pauseAnimations(); root.setCurrentTime(time);
  }, time);
  // Allow a compositor frame after seeking SMIL before taking a screenshot.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1120 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (!response.ok()) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto(base);
  await loadBoard(page);
  assert.ok((await page.title()).includes(summary.username));
  await seek(page, 4);
  await page.screenshot({ path: 'previews/preview-dark.png', fullPage: true });

  // Verify actual motion, not merely the presence of animation markup.
  const ballPosition = () => page.evaluate(() => {
    const transform = document.querySelector('#board').contentDocument.querySelector('.ball')?.getCTM();
    return transform ? [transform.e, transform.f] : null;
  });
  const firstPosition = await ballPosition();
  await seek(page, 8);
  if (summary.activeDays) assert.notDeepEqual(await ballPosition(), firstPosition);

  await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
  assert.equal(await page.evaluate(() => document.querySelector('#board').contentDocument.documentElement.animationsPaused()), true);
  await page.getByRole('button', { name: 'Paper', exact: true }).click();
  await loadBoard(page);
  await page.waitForFunction(() => document.querySelector('#board').contentDocument?.querySelector('svg')?.style.background === 'rgb(251, 252, 248)');
  assert.equal(await page.evaluate(() => document.querySelector('#board').contentDocument.documentElement.animationsPaused()), true);
  await seek(page, 4);
  await page.screenshot({ path: 'previews/preview-light.png', fullPage: true });
  await page.getByRole('button', { name: 'Replay animation', exact: true }).click();
  assert.equal(await page.evaluate(() => document.querySelector('#board').contentDocument.documentElement.animationsPaused()), false);
  assert.ok(await page.evaluate(() => document.querySelector('#board').contentDocument.documentElement.getCurrentTime() < 1));

  await page.setViewportSize({ width: 390, height: 844 });
  await seek(page, 4);
  assert.ok(await page.evaluate(() => document.body.scrollWidth <= innerWidth));
  await page.screenshot({ path: 'previews/preview-mobile.png', fullPage: true });

  // Verify the exported SVG also works in README-style <img> embedding.
  await page.setContent(`<img src="${base}/generated/breakout-dark.svg" alt="Contribution Arcade" width="900">`);
  await page.waitForFunction(() => document.querySelector('img').complete && document.querySelector('img').naturalWidth > 0);
  assert.equal(await page.locator('img').evaluate(image => image.naturalWidth), 1120);

  const reduced = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 1120, height: 448 } });
  await reduced.goto(`${base}/generated/breakout-dark.svg`);
  const modes = await reduced.evaluate(() => ({
    animated: getComputedStyle(document.querySelector('.animated')).display,
    reduced: getComputedStyle(document.querySelector('.reduced')).display,
  }));
  assert.equal(modes.animated, 'none');
  assert.equal(modes.reduced, 'inline');
  await reduced.screenshot({ path: 'previews/breakout-dark.png' });

  const board = await browser.newPage({ viewport: { width: 1120, height: 448 }, deviceScaleFactor: 1 });
  await board.goto(`${base}/generated/breakout-light.svg`);
  await seek(board, 4);
  await board.screenshot({ path: 'previews/breakout-light.png' });

  if (process.argv.includes('--frames')) {
    await mkdir('previews/frames', { recursive: true });
    await board.goto(`${base}/generated/breakout-dark.svg`);
    const fps = 12;
    const seconds = summary.duration;
    const count = Math.ceil(seconds * fps);
    // Capture every moment of one loop at its actual speed for the GIF export.
    for (let frame = 0; frame < count; frame++) {
      await seek(board, frame / fps);
      await board.screenshot({ path: `previews/frames/${String(frame).padStart(4, '0')}.png` });
      if (frame % 120 === 0) console.log(`Captured ${frame}/${count} animation frames`);
    }
  }
  assert.deepEqual(errors, []);
  console.log('Browser checks passed: real-data rendering, motion, themes, pause, replay, mobile layout, README image embedding, and reduced motion.');
  console.log('Preview screenshots saved to previews/.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
