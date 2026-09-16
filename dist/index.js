import path from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { openMacFilePicker } from './dialog.js';
import { processImage } from './trimmer.js';
import { getTimestamp, isSupportedImage, isValidPadding, MAX_PADDING } from './utils.js';
async function main() {
    console.clear();
    p.intro(`${pc.bgCyan(pc.black(' 画像 余白トリミングツール '))} ${pc.dim('v1.0.0')}`);
    // 1. コマンドライン引数からの入力があればチェック、なければFinderダイアログを開く
    const cliArgs = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
    let targetFiles = [];
    if (cliArgs.length > 0) {
        targetFiles = cliArgs;
        p.log.info(`コマンドライン引数から ${pc.cyan(targetFiles.length)} 件のファイルを受け取りました。`);
    }
    else {
        p.log.message(`macOSのファイル選択画面が開きます。\n${pc.dim('※ Command(⌘)+クリック や Shift+矢印キー で複数ファイルを選択できます。')}`);
        const s = p.spinner();
        s.start('Finderファイル選択ダイアログを起動しています...');
        let pickerResult;
        try {
            pickerResult = await openMacFilePicker();
        }
        catch (err) {
            s.stop(pc.red('ファイル選択ダイアログの起動に失敗しました。'));
            p.log.error(err.message || String(err));
            p.outro(pc.yellow('処理を終了します。'));
            process.exit(1);
        }
        s.stop('ファイル選択完了');
        if (pickerResult.canceled || pickerResult.filePaths.length === 0) {
            p.outro(pc.yellow('ファイル選択がキャンセルされました。終了します。'));
            process.exit(0);
        }
        targetFiles = pickerResult.filePaths;
    }
    // 2. 対応フォーマットの検証
    const validFiles = [];
    const unsupportedFiles = [];
    for (const file of targetFiles) {
        if (isSupportedImage(file)) {
            validFiles.push(file);
        }
        else {
            unsupportedFiles.push(file);
        }
    }
    if (unsupportedFiles.length > 0) {
        p.log.warn(`以下のファイルは非対応形式のため除外されます (${unsupportedFiles.length}件):\n${unsupportedFiles
            .map((f) => `  ${pc.dim('-')} ${path.basename(f)}`)
            .join('\n')}`);
    }
    if (validFiles.length === 0) {
        p.outro(pc.red('処理対象の有効な画像ファイルが選択されていません。終了します。'));
        process.exit(1);
    }
    p.log.success(`${pc.green(validFiles.length)} 件の画像ファイルが選択されました:\n${validFiles
        .slice(0, 5)
        .map((f) => `  ${pc.dim('•')} ${path.basename(f)}`)
        .join('\n')}${validFiles.length > 5 ? `\n  ${pc.dim(`...他 ${validFiles.length - 5} 件`)}` : ''}`);
    // 3. パディングの指定
    const paddingChoice = await p.select({
        message: 'トリミング後の周囲の余白（パディング）を選択してください:',
        initialValue: '0',
        options: [
            { value: '0', label: '0px（キワキワまでトリミング / デフォルト）' },
            { value: '5', label: '5px（ほんのり余白を残す）' },
            { value: '10', label: '10px（少し広めの余白を残す）' },
            { value: '20', label: '20px（余裕を持たせる）' },
            { value: 'custom', label: '数値を自由に入力する...' },
        ],
    });
    if (p.isCancel(paddingChoice)) {
        p.outro(pc.yellow('操作がキャンセルされました。終了します。'));
        process.exit(0);
    }
    let padding = 0;
    if (paddingChoice === 'custom') {
        const customPadding = await p.text({
            message: '余白のサイズ (px) を半角数字で入力してください:',
            placeholder: '0',
            defaultValue: '0',
            validate: (value) => {
                const num = Number(value);
                if (!isValidPadding(num)) {
                    return `0以上${MAX_PADDING.toLocaleString()}以下の整数を入力してください。`;
                }
            },
        });
        if (p.isCancel(customPadding)) {
            p.outro(pc.yellow('操作がキャンセルされました。終了します。'));
            process.exit(0);
        }
        padding = Number(customPadding);
    }
    else {
        padding = Number(paddingChoice);
    }
    // 4. トリミング一括実行
    const outDir = path.resolve(process.cwd(), 'outbox');
    const timestamp = getTimestamp();
    p.log.step(`出力先: ${pc.cyan(outDir)}\nタイムスタンプ: ${pc.cyan(timestamp)}\nパディング: ${pc.cyan(`${padding}px`)}`);
    const spinner = p.spinner();
    spinner.start('画像をトリミング中...');
    const results = [];
    for (let i = 0; i < validFiles.length; i++) {
        const filePath = validFiles[i];
        const baseName = path.basename(filePath);
        spinner.message(`[${i + 1}/${validFiles.length}] 処理中: ${baseName}`);
        const result = await processImage(filePath, {
            padding,
            outDir,
            timestamp,
        });
        results.push(result);
    }
    spinner.stop('すべての処理が完了しました！');
    // 5. 結果サマリーの表示
    const successList = results.filter((r) => r.success);
    const skippedList = results.filter((r) => r.skipped);
    const errorList = results.filter((r) => !r.success && !r.skipped);
    console.log('');
    p.log.info(pc.bold('=== 処理結果サマリー ==='));
    if (successList.length > 0) {
        p.log.success(`${pc.green(pc.bold(successList.length))} 件の画像をトリミングして保存しました:`);
        for (const item of successList) {
            const name = path.basename(item.inputPath);
            const outName = item.outputPath ? path.basename(item.outputPath) : '';
            const sizeChange = `${item.originalWidth}x${item.originalHeight} → ${item.trimmedWidth}x${item.trimmedHeight}`;
            console.log(`  ${pc.green('✔')} ${pc.bold(name)}: ${pc.dim(sizeChange)}  ${pc.cyan(`→ ${outName}`)}`);
        }
    }
    if (skippedList.length > 0) {
        console.log('');
        p.log.warn(`${pc.yellow(pc.bold(skippedList.length))} 件の画像をスキップしました:`);
        for (const item of skippedList) {
            const name = path.basename(item.inputPath);
            console.log(`  ${pc.yellow('⚠')} ${name}: ${pc.dim(item.reason || 'スキップされました')}`);
        }
    }
    if (errorList.length > 0) {
        console.log('');
        p.log.error(`${pc.red(pc.bold(errorList.length))} 件の処理でエラーが発生しました:`);
        for (const item of errorList) {
            const name = path.basename(item.inputPath);
            console.log(`  ${pc.red('✖')} ${name}: ${pc.dim(item.error || '不明なエラー')}`);
        }
    }
    console.log('');
    p.outro(`${pc.green('🎉 全てのタスクが完了しました！')}\n保存先: ${pc.cyan(outDir)}`);
}
main().catch((err) => {
    p.log.error(err.message || String(err));
    process.exit(1);
});
