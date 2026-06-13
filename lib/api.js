/**
 * すするCoder v0.06.27
 * lib/api.js - API 呼び出し関数
 */

/** APIキーから不正文字を除去する */
function cleanKey(k) {
    if (!k) return '';
    return k.split('').filter(c => {
        const code = c.charCodeAt(0);
        return code !== 0x3000 && code !== 0x00a0 && code !== 0xfeff
               && code !== 0x0d && code !== 0x0a && code !== 0x09;
    }).join('').trim();
}

/** キーの配列または文字列を正規化して配列で返す */
function normalizeKeys(val) {
    if (!val) return [];
    const arr = Array.isArray(val) ? val : [val];
    return arr.map(cleanKey).filter(k => k.length > 0);
}

// OpenRouter 静的フォールバックリスト（動的取得失敗時に使用）
const OPENROUTER_MODELS_FALLBACK = [
    { id: "qwen/qwen3-coder:free",              label: "Qwen3 Coder" },
    { id: "deepseek/deepseek-r1-0528:free",     label: "DeepSeek R1" },
    { id: "deepseek/deepseek-chat-v3.1:free",   label: "DeepSeek V3.1" },
    { id: "meta-llama/llama-4-maverick:free",   label: "Llama 4 Maverick" },
    { id: "meta-llama/llama-4-scout:free",      label: "Llama 4 Scout" },
    { id: "google/gemini-2.5-flash:free",       label: "Gemini 2.5 Flash (OR)" },
    { id: "mistralai/mistral-7b-instruct:free", label: "Mistral 7B" },
];

// 後方互換用エイリアス（UI等が参照している場合のため残す）
const OPENROUTER_MODELS = OPENROUTER_MODELS_FALLBACK;

/** コーディング適性スコア（高いほど優先） */
function codingScore(model) {
    const text = (model.id + ' ' + (model.name || '') + ' ' + (model.description || '')).toLowerCase();
    let score = 0;
    // コーディング特化キーワード（高評価）
    if (text.includes('coder'))                           score += 40;
    if (text.includes('code') && !text.includes('coder')) score += 25;
    if (text.includes('deepseek'))                        score += 30;
    if (text.includes('qwen'))                            score += 25;
    if (text.includes('starcoder'))                       score += 35;
    if (text.includes('codestral'))                       score += 35;
    if (text.includes('r1') || text.includes('reasoner')) score += 15; // 推論系
    // 汎用高性能（中評価）
    if (text.includes('llama-4') || text.includes('llama4')) score += 20;
    if (text.includes('mistral'))                         score += 10;
    if (text.includes('gemini'))                          score += 10;
    if (text.includes('llama'))                           score += 8;
    // コンテキスト長（長いほど大きなコードを扱える）
    score += Math.min(Math.floor((model.context_length || 0) / 20000), 10);
    return score;
}

/** OpenRouter の無料モデルを動的取得してコーディング適性順に返す */
async function fetchFreeModels(apiKey) {
    try {
        const res = await fetch('https://openrouter.ai/api/v1/models', {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const freeModels = (data.data || [])
            .filter(m => m.id.endsWith(':free'))
            .map(m => ({ ...m, _score: codingScore(m) }))
            .sort((a, b) => b._score - a._score)
            .map(m => ({ id: m.id, label: m.name || m.id }));
        console.log(`📋 無料モデル取得: ${freeModels.length}件`, freeModels.slice(0, 5).map(m => m.id));
        return freeModels.length > 0 ? freeModels : OPENROUTER_MODELS_FALLBACK;
    } catch (e) {
        console.warn('モデル一覧取得失敗、フォールバックリストを使用:', e.message);
        return OPENROUTER_MODELS_FALLBACK;
    }
}

// 起動後にキャッシュ（キー別）
const _freeModelCache = {};  // { [keyLast6]: { models, fetchedAt } }
const FREE_MODEL_CACHE_TTL = 30 * 60 * 1000; // 30分

async function getFreeCodingModels(apiKey) {
    const cacheKey = apiKey.slice(-6);
    const cached = _freeModelCache[cacheKey];
    if (cached && Date.now() - cached.fetchedAt < FREE_MODEL_CACHE_TTL) {
        return cached.models;
    }
    const models = await fetchFreeModels(apiKey);
    _freeModelCache[cacheKey] = { models, fetchedAt: Date.now() };
    return models;
}

// Gemini モデルリスト
const GEMINI_MODEL_LIST = [
    { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' },
    { id: 'gemini-2.5-pro',         label: 'Gemini 2.5 Pro' },
    { id: 'gemini-3.5-flash',       label: 'Gemini 3.5 Flash' },
    { id: 'gemini-2.5-flash',       label: 'Gemini 2.5 Flash' },
    { id: 'gemini-1.5-pro',         label: 'Gemini 1.5 Pro' },
];

// モデル選択肢（UI用）: 各APIの選択肢をまとめたもの
window.MODEL_OPTIONS = [
    { value: 'auto',       label: '🤖 自動選択' },
    // OpenRouter（auto=動的無料リスト、個別指定も可）
    { value: 'or:auto_free', label: '🔄 OpenRouter 無料(自動)' },
    ...OPENROUTER_MODELS_FALLBACK.map(m => ({ value: 'or:' + m.id, label: '🔄 ' + m.label })),
    // Gemini
    ...GEMINI_MODEL_LIST.map(m => ({ value: 'gm:' + m.id, label: '✨ ' + m.label })),
    // OpenAI
    { value: 'oa:gpt-4o',       label: '🤖 GPT-4o' },
    { value: 'oa:gpt-4o-mini',  label: '🤖 GPT-4o mini' },
    // Anthropic
    { value: 'an:claude-opus-4-5',   label: '🧠 Claude Opus 4.5' },
    { value: 'an:claude-sonnet-4-5', label: '🧠 Claude Sonnet 4.5' },
];

// ─── 個別 API ───────────────────────────────────────────

async function callGeminiAPI(input, messages, systemPrompt, keys, setStatusMessage, signal, modelId, onChunk) {
    const contents = (messages || [])
        .filter(m => (m.role === 'user' || m.role === 'assistant') && m.model !== 'error')
        .map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: String(m.content || '') }] }))
        .concat([{ role: 'user', parts: [{ text: input }] }]);

    let modelList = GEMINI_MODEL_LIST;
    if (modelId) modelList = [{ id: modelId, label: modelId }, ...GEMINI_MODEL_LIST.filter(m => m.id !== modelId)];

    const errors = [];
    for (const key of keys) {
        for (const model of modelList) {
            if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
            if (setStatusMessage) setStatusMessage(`✨ Gemini (${model.label}) 接続中...`);
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:streamGenerateContent?alt=sse&key=${key}`;
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal,
                    body: JSON.stringify({
                        systemInstruction: { parts: [{ text: systemPrompt }] },
                        contents,
                        generationConfig: { maxOutputTokens: 65536, temperature: 0.5 }
                    })
                });
                if (res.ok) {
                    if (setStatusMessage) setStatusMessage(`✨ Gemini (${model.label}) 生成中...`);
                    const reader = res.body.getReader();
                    const decoder = new TextDecoder();
                    let fullText = '';
                    let buf = '';
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        if (signal?.aborted) { reader.cancel(); throw new DOMException('Aborted', 'AbortError'); }
                        buf += decoder.decode(value, { stream: true });
                        const lines = buf.split('\n');
                        buf = lines.pop();
                        for (const line of lines) {
                            if (!line.startsWith('data: ')) continue;
                            const json = line.slice(6).trim();
                            if (!json || json === '[DONE]') continue;
                            try {
                                const chunk = JSON.parse(json);
                                const part = chunk?.candidates?.[0]?.content?.parts?.[0]?.text;
                                if (part) { fullText += part; if (onChunk) onChunk(fullText); }
                            } catch (_) {}
                        }
                    }
                    if (fullText) return { text: fullText, model: model.id };
                    errors.push(`${model.id}: レスポンス空`);
                } else {
                    const err = await res.json().catch(() => ({}));
                    const errMsg = err.error?.message || res.statusText;
                    errors.push(`${model.id}(key…${key.slice(-4)}): HTTP ${res.status} - ${errMsg}`);
                    if (res.status === 401 || res.status === 403) break;
                }
            } catch (e) {
                if (e.name === 'AbortError') throw e;
                errors.push(`${model.id}: ${e.message}`);
            }
        }
    }
    throw new Error('Gemini:\n' + errors.join('\n'));
}

async function callOpenAIAPI(input, messages, systemPrompt, keys, setStatusMessage, signal, modelId, onChunk) {
    const model = modelId || 'gpt-4o-mini';
    const cleanMessages = (messages || [])
        .filter(m => (m.role === 'user' || m.role === 'assistant') && m.model !== 'error')
        .map(m => ({ role: m.role, content: String(m.content || '') }));

    const errors = [];
    for (const key of keys) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        if (setStatusMessage) setStatusMessage(`🤖 GPT (${model}) 接続中...`);
        try {
            const res = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                signal,
                body: JSON.stringify({
                    model,
                    max_tokens: 16384,
                    stream: true,
                    messages: [{ role: 'system', content: systemPrompt }, ...cleanMessages, { role: 'user', content: input }]
                })
            });
            if (res.ok) {
                if (setStatusMessage) setStatusMessage(`🤖 GPT (${model}) 生成中...`);
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let fullText = '';
                let buf = '';
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    if (signal?.aborted) { reader.cancel(); throw new DOMException('Aborted', 'AbortError'); }
                    buf += decoder.decode(value, { stream: true });
                    const lines = buf.split('\n');
                    buf = lines.pop();
                    for (const line of lines) {
                        if (!line.startsWith('data: ')) continue;
                        const json = line.slice(6).trim();
                        if (!json || json === '[DONE]') continue;
                        try {
                            const chunk = JSON.parse(json);
                            const delta = chunk?.choices?.[0]?.delta?.content;
                            if (delta) { fullText += delta; if (onChunk) onChunk(fullText); }
                        } catch (_) {}
                    }
                }
                if (fullText) return { text: fullText, model };
                errors.push(`key…${key.slice(-4)}: レスポンス空`);
            } else {
                const err = await res.json().catch(() => ({}));
                errors.push(`key…${key.slice(-4)}: ${err.error?.message || `HTTP ${res.status}`}`);
            }
        } catch (e) {
            if (e.name === 'AbortError') throw e;
            errors.push(e.message);
        }
    }
    throw new Error('OpenAI:\n' + errors.join('\n'));
}

async function callAnthropicAPI(input, messages, systemPrompt, keys, setStatusMessage, signal, modelId, onChunk) {
    const model = modelId || 'claude-opus-4-5';
    const cleanMessages = (messages || [])
        .filter(m => (m.role === 'user' || m.role === 'assistant') && m.model !== 'error')
        .map(m => ({ role: m.role, content: String(m.content || '') }));

    const errors = [];
    for (const key of keys) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        if (setStatusMessage) setStatusMessage(`🧠 Claude (${model}) 接続中...`);
        try {
            const res = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': key,
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true'
                },
                signal,
                body: JSON.stringify({
                    model,
                    max_tokens: 16384,
                    stream: true,
                    system: systemPrompt,
                    messages: [...cleanMessages, { role: 'user', content: input }]
                })
            });
            if (res.ok) {
                if (setStatusMessage) setStatusMessage(`🧠 Claude (${model}) 生成中...`);
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let fullText = '';
                let buf = '';
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    if (signal?.aborted) { reader.cancel(); throw new DOMException('Aborted', 'AbortError'); }
                    buf += decoder.decode(value, { stream: true });
                    const lines = buf.split('\n');
                    buf = lines.pop();
                    for (const line of lines) {
                        if (!line.startsWith('data: ')) continue;
                        const json = line.slice(6).trim();
                        if (!json) continue;
                        try {
                            const chunk = JSON.parse(json);
                            if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
                                fullText += chunk.delta.text;
                                if (onChunk) onChunk(fullText);
                            }
                        } catch (_) {}
                    }
                }
                if (fullText) return { text: fullText, model };
                errors.push(`key…${key.slice(-4)}: レスポンス空`);
            } else {
                const err = await res.json().catch(() => ({}));
                errors.push(`key…${key.slice(-4)}: ${err.error?.message || `HTTP ${res.status}`}`);
            }
        } catch (e) {
            if (e.name === 'AbortError') throw e;
            errors.push(e.message);
        }
    }
    throw new Error('Anthropic:\n' + errors.join('\n'));
}

async function callOpenRouterAPI(input, messages, systemPrompt, keys, setStatusMessage, signal, modelId, onChunk) {
    const cleanMessages = (messages || [])
        .filter(m => (m.role === 'user' || m.role === 'assistant') && m.model !== 'error')
        .map(m => ({ role: m.role, content: String(m.content || '') }));

    let modelList;
    if (modelId) {
        modelList = [{ id: modelId, label: modelId }];
    } else {
        if (setStatusMessage) setStatusMessage('🔄 無料モデルリスト取得中...');
        modelList = await getFreeCodingModels(keys[0]);
    }

    const errors = [];
    for (const key of keys) {
        console.log('🔑 OpenRouter key …' + key.slice(-6));
        for (let i = 0; i < modelList.length; i++) {
            const { id, label } = modelList[i];
            if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
            if (setStatusMessage) setStatusMessage(`🔄 ${label} 接続中... [${i+1}/${modelList.length}]`);
            try {
                // 接続タイムアウト: 20秒で次のモデルへ
                const connectAbort = new AbortController();
                const connectTimer = setTimeout(() => connectAbort.abort(), 20000);
                const combinedSignal = anySignal([signal, connectAbort.signal]);

                const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${key}`,
                        'HTTP-Referer': location.href || 'https://localhost',
                        'X-Title': 'SusuruCoder'
                    },
                    signal: combinedSignal,
                    body: JSON.stringify({
                        model: id,
                        stream: true,
                        messages: [{ role: 'system', content: systemPrompt }, ...cleanMessages, { role: 'user', content: input }]
                    })
                }).finally(() => clearTimeout(connectTimer));

                if (res.ok) {
                    if (setStatusMessage) setStatusMessage(`🔄 ${label} 生成中...`);
                    const reader = res.body.getReader();
                    const decoder = new TextDecoder();
                    let fullText = '';
                    let buf = '';

                    // チャンク間タイムアウト: 最後のchunkから30秒音沙汰なければ打ち切り
                    let chunkTimer = null;
                    let timedOut = false;
                    const resetChunkTimer = () => {
                        if (chunkTimer) clearTimeout(chunkTimer);
                        chunkTimer = setTimeout(() => { timedOut = true; reader.cancel(); }, 30000);
                    };
                    resetChunkTimer();

                    try {
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            if (signal?.aborted) { reader.cancel(); throw new DOMException('Aborted', 'AbortError'); }
                            resetChunkTimer(); // チャンクが来たらタイマーリセット
                            buf += decoder.decode(value, { stream: true });
                            const lines = buf.split('\n');
                            buf = lines.pop();
                            for (const line of lines) {
                                if (!line.startsWith('data: ')) continue;
                                const json = line.slice(6).trim();
                                if (!json || json === '[DONE]') continue;
                                try {
                                    const chunk = JSON.parse(json);
                                    if (chunk?.error) { console.warn('OpenRouter stream error:', chunk.error); continue; }
                                    const delta = chunk?.choices?.[0]?.delta?.content;
                                    if (delta) { fullText += delta; if (onChunk) onChunk(fullText); }
                                } catch (_) {}
                            }
                        }
                    } finally {
                        if (chunkTimer) clearTimeout(chunkTimer);
                    }

                    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

                    if (fullText) {
                        // 途中で固まって打ち切られた場合もテキストがあれば返す
                        if (timedOut) console.warn(`${label}: タイムアウトしたが途中テキストあり → 返却`);
                        return { text: fullText, model: id };
                    }

                    if (timedOut) {
                        errors.push(`${label}: 応答タイムアウト（テキストなし）`);
                        continue; // 次のモデルへ
                    }

                    // ストリームが空だった場合: non-streamで再試行
                    console.warn(`${label}: stream returned empty, fallback to non-stream`);
                    if (setStatusMessage) setStatusMessage(`🔄 ${label} 再試行中...`);
                    const res2 = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${key}`,
                            'HTTP-Referer': location.href || 'https://localhost',
                            'X-Title': 'SusuruCoder'
                        },
                        signal,
                        body: JSON.stringify({
                            model: id,
                            stream: false,
                            messages: [{ role: 'system', content: systemPrompt }, ...cleanMessages, { role: 'user', content: input }]
                        })
                    });
                    if (res2.ok) {
                        const data2 = await res2.json();
                        const text2 = data2.choices?.[0]?.message?.content;
                        if (text2) { if (onChunk) onChunk(text2); return { text: text2, model: id }; }
                    }
                    errors.push(`${label}(key…${key.slice(-4)}): レスポンス空（stream+non-stream両方）`);
                } else {
                    const errBody = await res.text().catch(() => '');
                    let errMsg = res.statusText;
                    try { errMsg = JSON.parse(errBody)?.error?.message || errMsg; } catch(_) {}
                    errors.push(`${label}(key…${key.slice(-4)}): HTTP ${res.status} - ${errMsg}`);
                    if (res.status === 401) break;
                }
            } catch (e) {
                if (e.name === 'AbortError' && signal?.aborted) throw e; // ユーザーによる中断のみ再throw
                errors.push(`${label}: ${e.message}`);
            }
        }
    }
    throw new Error('OpenRouter:\n' + errors.join('\n'));
}

/** 複数AbortSignalをまとめるヘルパー */
function anySignal(signals) {
    const ctrl = new AbortController();
    for (const s of signals) {
        if (!s) continue;
        if (s.aborted) { ctrl.abort(); break; }
        s.addEventListener('abort', () => ctrl.abort(), { once: true });
    }
    return ctrl.signal;
}

// ─── 統合エントリポイント ────────────────────────────────

/**
 * @param {string} input
 * @param {object[]} messages
 * @param {string} systemPrompt
 * @param {object} apiKeys  { openrouter: string|string[], gemini: string|string[], ... }
 * @param {function} setStatusMessage
 * @param {AbortSignal} signal
 * @param {string} selectedModel  例: 'auto' | 'or:qwen/qwen3-coder:free' | 'gm:gemini-2.5-pro' | 'oa:gpt-4o' | 'an:claude-opus-4-5'
 */
async function callAI(input, messages, systemPrompt, apiKeys, setStatusMessage, signal, selectedModel, onChunk) {
    const orKeys  = normalizeKeys(apiKeys?.openrouter);
    const gmKeys  = normalizeKeys(apiKeys?.gemini);
    const oaKeys  = normalizeKeys(apiKeys?.openai);
    const anKeys  = normalizeKeys(apiKeys?.anthropic);

    const errors = [];

    // モデル指定がある場合は対応APIのみ呼ぶ
    if (selectedModel && selectedModel !== 'auto') {
        const [prefix, ...rest] = selectedModel.split(':');
        const modelId = rest.join(':');
        if (prefix === 'or' && orKeys.length > 0) {
            const resolvedModelId = modelId === 'auto_free' ? null : modelId;
            return await callOpenRouterAPI(input, messages, systemPrompt, orKeys, setStatusMessage, signal, resolvedModelId, onChunk);
        }
        if (prefix === 'gm' && gmKeys.length > 0) {
            return await callGeminiAPI(input, messages, systemPrompt, gmKeys, setStatusMessage, signal, modelId, onChunk);
        }
        if (prefix === 'oa' && oaKeys.length > 0) {
            return await callOpenAIAPI(input, messages, systemPrompt, oaKeys, setStatusMessage, signal, modelId, onChunk);
        }
        if (prefix === 'an' && anKeys.length > 0) {
            return await callAnthropicAPI(input, messages, systemPrompt, anKeys, setStatusMessage, signal, modelId, onChunk);
        }
        throw new Error(`指定モデル "${selectedModel}" に対応するAPIキーが未設定です`);
    }

    // 自動選択: キーがあるAPIを順番に試す
    const available = [];
    if (orKeys.length > 0)  available.push('openrouter');
    if (gmKeys.length > 0)  available.push('gemini');
    if (oaKeys.length > 0)  available.push('openai');
    if (anKeys.length > 0)  available.push('anthropic');
    console.log('🔑 利用可能API:', available.length > 0 ? available : 'なし');

    if (orKeys.length > 0) {
        try { return await callOpenRouterAPI(input, messages, systemPrompt, orKeys, setStatusMessage, signal, null, onChunk); }
        catch (e) { if (e.name === 'AbortError') throw e; errors.push(e.message); }
    }
    if (gmKeys.length > 0) {
        try { return await callGeminiAPI(input, messages, systemPrompt, gmKeys, setStatusMessage, signal, null, onChunk); }
        catch (e) { if (e.name === 'AbortError') throw e; errors.push(e.message); }
    }
    if (oaKeys.length > 0) {
        try { return await callOpenAIAPI(input, messages, systemPrompt, oaKeys, setStatusMessage, signal, null, onChunk); }
        catch (e) { if (e.name === 'AbortError') throw e; errors.push(e.message); }
    }
    if (anKeys.length > 0) {
        try { return await callAnthropicAPI(input, messages, systemPrompt, anKeys, setStatusMessage, signal, null, onChunk); }
        catch (e) { if (e.name === 'AbortError') throw e; errors.push(e.message); }
    }

    const keyList = available.join(', ') || 'なし（APIキー未設定）';
    throw new Error(`全API失敗 (試したAPI: ${keyList})\n${errors.join('\n')}`);
}

// window に公開
window.callAI            = callAI;
window.callGeminiAPI     = callGeminiAPI;
window.callOpenAIAPI     = callOpenAIAPI;
window.callAnthropicAPI  = callAnthropicAPI;
window.callOpenRouterAPI = callOpenRouterAPI;
