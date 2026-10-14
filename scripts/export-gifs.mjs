import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const catalog = JSON.parse(await readFile('generated/arcade.json', 'utf8'));
const option = process.argv.indexOf('--scene');
const selected = option < 0 ? catalog.scenes : catalog.scenes.filter(scene => scene.id === process.argv[option + 1]);
assert.ok(selected.length, 'Provide a scene ID from generated/arcade.json.');
const pending = [...selected];
const fps = 8;
const server = await serve(0);
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
await mkdir('previews', { recursive: true });
try {
  await Promise.all(Array.from({ length: Math.min(2, selected.length) }, async () => {
    const page = await browser.newPage({ viewport: { width: 720, height: 288 } });
    for (let scene; (scene = pending.shift());) {
      await page.goto(`${base}/generated/${scene.id}-dark.svg`);
      await page.evaluate(() => { const root = document.documentElement; root.style.width = '100vw'; root.style.height = '100vh'; root.pauseAnimations(); });
      const encoder = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
        '-filter_complex_threads', '1', '-filter_complex', '[0:v]split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle',
        '-loop', '0', '-y', `previews/${scene.id}.gif`], { stdio: ['pipe', 'ignore', 'pipe'] });
      let log = '';
      encoder.stderr.on('data', data => { log = (log + data).slice(-4000); });
      const completion = new Promise((resolve, reject) => {
        encoder.on('error', reject);
        encoder.on('exit', code => code === 0 ? resolve() : reject(new Error(`${scene.id}: FFmpeg exited ${code}: ${log}`)));
      });
      const count = Math.ceil(scene.duration * fps);
      try {
        for (let frame = 0; frame < count; frame++) {
          await page.evaluate(time => document.documentElement.setCurrentTime(time), frame / fps);
          const png = await page.screenshot({ type: 'png' });
          if (!encoder.stdin.write(png)) await once(encoder.stdin, 'drain');
          if (frame % 160 === 0) console.log(`${scene.id}: ${frame}/${count} frames`);
        }
        encoder.stdin.end(); await completion;
        console.log(`Exported previews/${scene.id}.gif · ${(count / fps).toFixed(2)}s at ${fps} fps`);
      } catch (error) { encoder.kill(); await completion.catch(() => {}); throw error; }
    }
    await page.close();
  }));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
