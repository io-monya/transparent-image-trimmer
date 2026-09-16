import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { processImage } from './trimmer.js';

async function temporaryDirectory(t: test.TestContext): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'trimming-tool-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

test('透過画像をトリミングし、指定した余白を付ける', async (t) => {
  const dir = await temporaryDirectory(t);
  const input = path.join(dir, 'input.png');
  const outDir = path.join(dir, 'outbox');

  await sharp({
    create: { width: 20, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: { create: { width: 5, height: 6, channels: 4, background: 'red' } }, left: 7, top: 8 }])
    .png()
    .toFile(input);

  const result = await processImage(input, { padding: 2, outDir, timestamp: '20260916_120000' });

  assert.equal(result.success, true);
  assert.equal(result.trimmedWidth, 9);
  assert.equal(result.trimmedHeight, 10);
});

test('同名の入力画像を続けて処理しても出力を上書きしない', async (t) => {
  const dir = await temporaryDirectory(t);
  const firstDir = path.join(dir, 'first');
  const secondDir = path.join(dir, 'second');
  const outDir = path.join(dir, 'outbox');
  await Promise.all([fs.mkdir(firstDir), fs.mkdir(secondDir)]);

  const first = path.join(firstDir, 'photo.png');
  const second = path.join(secondDir, 'photo.png');
  await Promise.all([
    sharp({ create: { width: 10, height: 10, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toFile(first),
    sharp({ create: { width: 12, height: 12, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 1 } } }).png().toFile(second),
  ]);

  const firstResult = await processImage(first, { padding: 0, outDir, timestamp: '20260916_120000' });
  const secondResult = await processImage(second, { padding: 0, outDir, timestamp: '20260916_120000' });

  assert.equal(firstResult.success, true);
  assert.equal(secondResult.success, true);
  assert.notEqual(firstResult.outputPath, secondResult.outputPath);
  assert.deepEqual((await fs.readdir(outDir)).sort(), [
    'photo_20260916_120000.png',
    'photo_20260916_120000_2.png',
  ]);
});

test('透過チャンネルのない画像はスキップする', async (t) => {
  const dir = await temporaryDirectory(t);
  const input = path.join(dir, 'opaque.png');
  await sharp({ create: { width: 10, height: 10, channels: 3, background: 'white' } }).png().toFile(input);

  const result = await processImage(input, {
    padding: 0,
    outDir: path.join(dir, 'outbox'),
    timestamp: '20260916_120000',
  });

  assert.equal(result.skipped, true);
  assert.match(result.reason ?? '', /透過チャンネルがない/);
});

test('アニメーション画像は静止画化せずにスキップする', async (t) => {
  const dir = await temporaryDirectory(t);
  const input = path.join(dir, 'animated.gif');
  const frames = await Promise.all(
    ['red', 'blue'].map((background) =>
      sharp({ create: { width: 10, height: 10, channels: 4, background } }).png().toBuffer()
    )
  );
  await sharp(frames, { join: { animated: true } }).gif({ delay: [100, 100], loop: 0 }).toFile(input);

  const result = await processImage(input, {
    padding: 0,
    outDir: path.join(dir, 'outbox'),
    timestamp: '20260916_120000',
  });

  assert.equal(result.skipped, true);
  assert.match(result.reason ?? '', /アニメーションまたは複数ページ/);
});

test('完全透明な画像はスキップする', async (t) => {
  const dir = await temporaryDirectory(t);
  const input = path.join(dir, 'empty.png');
  await sharp({
    create: { width: 10, height: 10, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).png().toFile(input);

  const result = await processImage(input, {
    padding: 0,
    outDir: path.join(dir, 'outbox'),
    timestamp: '20260916_120000',
  });

  assert.equal(result.skipped, true);
  assert.match(result.reason ?? '', /完全透明/);
});

test('上限を超えるパディングを拒否する', async (t) => {
  const dir = await temporaryDirectory(t);
  const result = await processImage(path.join(dir, 'unused.png'), {
    padding: 10_001,
    outDir: path.join(dir, 'outbox'),
    timestamp: '20260916_120000',
  });

  assert.equal(result.success, false);
  assert.match(result.error ?? '', /10,000以下/);
});
