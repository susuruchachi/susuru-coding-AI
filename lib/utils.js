/**
 * すするCoder v0.06.24
 * lib/utils.js - ユーティリティ関数
 */

/** ファイル拡張子 → 言語名マップ */
const LANGUAGE_MAP = {
    py: 'Python', js: 'JavaScript', ts: 'TypeScript',
    cpp: 'C++', c: 'C', java: 'Java', rs: 'Rust', go: 'Go',
    rb: 'Ruby', php: 'PHP', swift: 'Swift', kt: 'Kotlin',
    cs: 'C#', html: 'HTML', css: 'CSS', json: 'JSON'
};

function detectLanguage(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    return LANGUAGE_MAP[ext] || ext.toUpperCase();
}

/**
 * AIレスポンスから [FILE: name]...[/FILE] ブロックを抽出する
 * ステートマシン方式：正規表現を使わず1文字ずつ走査することで
 * コード内の [FILE] タグや ``` による誤マッチを防ぐ
 */
function extractFiles(response) {
    const files = [];
    const text = response;
    const len = text.length;
    let i = 0;

    while (i < len) {
        // [FILE: で始まるタグを探す
        const startTag = '[FILE:';
        const startPos = text.indexOf(startTag, i);
        if (startPos === -1) break;

        // タグの閉じ ] を探す（同一行内のみ）
        const tagEnd = text.indexOf(']', startPos + startTag.length);
        if (tagEnd === -1) { i = startPos + 1; continue; }

        // ファイル名を取得
        const rawName = text.slice(startPos + startTag.length, tagEnd).trim();

        // ファイル名バリデーション：改行・[ を含むものは不正マッチ
        if (rawName.includes('\n') || rawName.includes('[') || rawName === '') {
            i = startPos + 1;
            continue;
        }

        // コンテンツの開始位置（タグの直後の改行はスキップ）
        let contentStart = tagEnd + 1;
        if (text[contentStart] === '\r') contentStart++;
        if (text[contentStart] === '\n') contentStart++;

        // [/FILE] を探す。ただしコード内の ``` ブロックの中は無視する
        // → ステートマシンで ``` の開閉を追跡しながら [/FILE] を探す
        const endTag = '[/FILE]';
        let j = contentStart;
        let inBacktick = false;
        let backtickCount = 0;
        let foundEnd = -1;

        while (j < len) {
            // バッククォートブロックの開閉を検出
            if (!inBacktick && text.startsWith('```', j)) {
                // ``` の開始
                let k = j + 3;
                while (k < len && text[k] !== '\n') k++; // 言語指定行をスキップ
                inBacktick = true;
                j = k + 1;
                continue;
            }
            if (inBacktick && text.startsWith('```', j)) {
                // ``` の終了（行頭のみ）
                // 行頭チェック
                const prevChar = j > 0 ? text[j - 1] : '\n';
                if (prevChar === '\n' || prevChar === '\r') {
                    inBacktick = false;
                    j += 3;
                    continue;
                }
            }

            // バッククォートの外で [/FILE] を探す
            if (!inBacktick && text.startsWith(endTag, j)) {
                foundEnd = j;
                break;
            }
            j++;
        }

        if (foundEnd === -1) {
            // [/FILE] が見つからなかった → このタグはスキップ
            i = startPos + 1;
            continue;
        }

        // コンテンツを取得（末尾の改行を除去）
        let fileContent = text.slice(contentStart, foundEnd);
        // 先頭・末尾の空白行を除去
        fileContent = fileContent.replace(/^\s*\n/, '').replace(/\n\s*$/, '');

        // ``` で囲まれていたら除去
        fileContent = fileContent.replace(/^```[^\n]*\n/, '').replace(/\n```\s*$/, '');

        files.push({ fileName: rawName, content: fileContent });
        i = foundEnd + endTag.length;
    }

    return files;
}

/**
 * メッセージ数が上限を超えたら古い分をアーカイブに移す
 */
function compressMessages(messages, messageArchive = []) {
    const MAX = 500;
    const KEEP = 300;
    if (messages.length <= MAX) return { messages, archive: messageArchive };
    const archive = [...messageArchive, ...messages.slice(0, messages.length - KEEP)];
    return { messages: messages.slice(messages.length - KEEP), archive };
}

// window に公開
window.detectLanguage   = detectLanguage;
window.extractFiles     = extractFiles;
window.compressMessages = compressMessages;
