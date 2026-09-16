import fs from 'node:fs/promises';
import path from 'node:path';
/**
 * 現在日時のタイムスタンプ文字列 (YYYYMMDD_HHmmss) を生成
 */
export function getTimestamp() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const HH = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return `${yyyy}${MM}${dd}_${HH}${mm}${ss}`;
}
export const MAX_PADDING = 10_000;
export function isValidPadding(value) {
    return Number.isInteger(value) && value >= 0 && value <= MAX_PADDING;
}
/**
 * 衝突しない出力先を空ファイルとして予約する。
 * 既存の場合: [元ファイル名]_[YYYYMMDD_HHmmss]_2.[拡張子]
 */
export async function reserveOutputPath(inputFilePath, outDir, timestamp) {
    const parsed = path.parse(inputFilePath);
    const baseName = `${parsed.name}_${timestamp}`;
    for (let suffix = 1;; suffix++) {
        const suffixText = suffix === 1 ? '' : `_${suffix}`;
        const candidate = path.join(outDir, `${baseName}${suffixText}${parsed.ext}`);
        try {
            const handle = await fs.open(candidate, 'wx');
            await handle.close();
            return candidate;
        }
        catch (error) {
            if (error?.code !== 'EEXIST') {
                throw error;
            }
        }
    }
}
/**
 * 指定ディレクトリが存在しない場合は作成
 */
export async function ensureDir(dirPath) {
    await fs.mkdir(dirPath, { recursive: true });
}
/**
 * サポートされている画像拡張子か判定
 */
export const SUPPORTED_EXTENSIONS = new Set([
    '.png',
    '.webp',
    '.gif',
    '.avif',
    '.tiff',
    '.tif',
]);
export function isSupportedImage(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return SUPPORTED_EXTENSIONS.has(ext);
}
