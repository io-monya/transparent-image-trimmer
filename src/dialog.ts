import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface FilePickerResult {
  canceled: boolean;
  filePaths: string[];
}

/**
 * macOS の標準ファイル選択ダイアログ (NSOpenPanel) を呼び出して複数ファイルを選択させる
 */
export async function openMacFilePicker(): Promise<FilePickerResult> {
  const script = `
    set fileList to {}
    try
      set selectedItems to choose file with prompt "トリミングする画像ファイルを選択してください (CommandキーやShiftキーで複数選択可)" with multiple selections allowed of type {"public.image", "png", "webp", "gif", "tiff"}
      repeat with anItem in selectedItems
        set end of fileList to POSIX path of anItem
      end repeat
      set AppleScript's text item delimiters to linefeed
      return fileList as text
    on error number -128
      -- ユーザーがキャンセルした場合
      return "CANCELED"
    end try
  `;

  try {
    const { stdout } = await execFileAsync('osascript', ['-e', script]);
    const trimmed = stdout.trim();

    if (trimmed === 'CANCELED' || trimmed === '') {
      return { canceled: true, filePaths: [] };
    }

    const paths = trimmed
      .split('\n')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    return { canceled: false, filePaths: paths };
  } catch (error: any) {
    // ユーザーキャンセルやその他エラー
    if (error.message && error.message.includes('-128')) {
      return { canceled: true, filePaths: [] };
    }
    throw error;
  }
}
