import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { isSupportedImage, isValidPadding, MAX_PADDING, reserveOutputPath } from './utils.js';

test('既存の出力名がある場合は連番を付ける', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'trimming-tool-utils-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  const first = path.join(dir, 'photo_20260916_120000.png');
  await fs.writeFile(first, 'existing');

  const output = await reserveOutputPath('/input/photo.png', dir, '20260916_120000');
  assert.equal(output, path.join(dir, 'photo_20260916_120000_2.png'));
  assert.equal((await fs.stat(output)).size, 0);
});

test('対応拡張子は大文字でも判定できる', () => {
  assert.equal(isSupportedImage('/input/PHOTO.PNG'), true);
  assert.equal(isSupportedImage('/input/photo.jpg'), false);
  assert.equal(MAX_PADDING, 10_000);
  assert.equal(isValidPadding(10_000), true);
  assert.equal(isValidPadding(10_001), false);
  assert.equal(isValidPadding(1.5), false);
});
