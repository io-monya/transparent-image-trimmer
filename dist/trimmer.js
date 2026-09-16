import sharp from 'sharp';
import fs from 'node:fs/promises';
import { ensureDir, isValidPadding, MAX_PADDING, reserveOutputPath } from './utils.js';
/**
 * 1枚の画像をトリミング処理する
 */
export async function processImage(inputPath, options) {
    let outputPath;
    try {
        if (!isValidPadding(options.padding)) {
            throw new Error(`パディングは0以上${MAX_PADDING.toLocaleString()}以下の整数で指定してください`);
        }
        const image = sharp(inputPath);
        const metadata = await image.metadata();
        const origWidth = metadata.width || 0;
        const origHeight = metadata.height || 0;
        if ((metadata.pages ?? 1) > 1) {
            return {
                success: false,
                skipped: true,
                inputPath,
                originalWidth: origWidth,
                originalHeight: origHeight,
                reason: 'アニメーションまたは複数ページの画像は、内容を保持できないためスキップされました',
            };
        }
        if (!metadata.hasAlpha) {
            return {
                success: false,
                skipped: true,
                inputPath,
                originalWidth: origWidth,
                originalHeight: origHeight,
                reason: '透過チャンネルがない画像のためスキップされました',
            };
        }
        // アルファチャンネルの有無と完全透明チェック
        const stats = await image.stats();
        const alphaStats = stats.channels.at(-1);
        if (alphaStats?.max === 0) {
            return {
                success: false,
                skipped: true,
                inputPath,
                originalWidth: origWidth,
                originalHeight: origHeight,
                reason: '完全透明な画像のためスキップされました (描画ピクセルが存在しません)',
            };
        }
        // トリム処理のパイプライン構築
        // sharpのtrim()は透過PNGなどのアルファ透明部分を自動トリミング
        let pipeline = sharp(inputPath).trim();
        // パディングが指定されている場合、透明背景で周囲を拡張
        if (options.padding > 0) {
            pipeline = pipeline.extend({
                top: options.padding,
                bottom: options.padding,
                left: options.padding,
                right: options.padding,
                background: { r: 0, g: 0, b: 0, alpha: 0 },
            });
        }
        // 出力ディレクトリ確保
        await ensureDir(options.outDir);
        outputPath = await reserveOutputPath(inputPath, options.outDir, options.timestamp);
        // 保存
        const outputInfo = await pipeline.toFile(outputPath);
        return {
            success: true,
            skipped: false,
            inputPath,
            outputPath,
            originalWidth: origWidth,
            originalHeight: origHeight,
            trimmedWidth: outputInfo.width,
            trimmedHeight: outputInfo.height,
        };
    }
    catch (error) {
        if (outputPath) {
            await fs.unlink(outputPath).catch(() => undefined);
        }
        return {
            success: false,
            skipped: false,
            inputPath,
            error: error.message || String(error),
        };
    }
}
