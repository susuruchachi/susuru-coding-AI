/**
 * すするCoder v0.06.24
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

// OpenRouter モデルリスト（ラベルとIDのペア）
const OPENROUTER_MODELS = [
    { id: "qwen/qwen3-coder:free",              label: "Qwen3 Coder" },
    { id: "deepseek/deepseek-r1-0528:free",     label: "DeepSeek R1" },
    { id: "deepseek/deepseek-chat-v3.1:free",   label: "DeepSeek V3.1" },
    { id: "meta-llama/llama-4-maverick:free",   label: "Llama 4 Maverick" },
    { id: "meta-llama/llama-4-scout:free",      label: "Llama 4 Scout" },
    { id: "google/gemini-2.5-flash:free",       label: "Gemini 2.5 Flash (OR)" },
    { id: "mistralai/mistral-7b-instruct:free", label: "Mistral 7B" },
    { id: "openrouter/auto",                    label: "OpenRouter Auto" }
];

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
    // OpenRouter
    ...OPENROUTER_MODELS.map(m => ({ value: 'or:' + m.id, label: '🔄 ' + m.label })),
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

async function callGeminiAPI(input, messages, systemPrompt, keys, setStatusMessage, signal, modelId) {
    const contents = (messages || [])
        .filter(m => (m.role === 'user' || m.role === 'assistant') && m.model !== 'error')
        .map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: String(m.content || '') }] }))
        .concat([{ role: 'user', parts: [{ text: input }] }]);

    // モデルリストを構成（指定があれば先頭に置く）
    let modelList = GEMINI_MODEL_LIST;
    if (modelId) modelList = [{ id: modelId, label: modelId }, ...GEMINI_MODEL_LIST.filter(m => m.id !== modelId)];

    const errors = [];
    for (const key of keys) {
        for (const model of modelList) {
            if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
            if (setStatusMessage) setStatusMessage(`✨ Gemini (${model.label}) 呼び出し中...`);
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent?key=${key}`;
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
                    if (setStatusMessage) setStatusMessage(`✨ Gemini (${model.label}) 書き込み中...`);
                    const data = await res.json();
                    return { text: data.candidates[0].content.parts[0].text, model: model.id };
                }
                const err = await res.json().catch(() => ({}));
                const errMsg = err.error?.message || res.statusText;
                errors.push(`${model.id}(key…${key.slice(-4)}): HTTP ${res.status} - ${errMsg}`);
                // 401/403はこのキーで全モデル不正→次のキーへ
                if (res.status === 401 || res.status === 403) break;
            } catch (e) {
                if (e.name === 'AbortError') throw e;
                errors.push(`${model.id}: ${e.message}`);
            }
        }
    }
    throw new Error('Gemini:\n' + errors.join('\n'));
}

async function callOpenAIAPI(input, messages, systemPrompt, keys, setStatusMessage, signal, modelId) {
    const model = modelId || 'gpt-4o-mini';
    const cleanMessages = (messages || [])
        .filter(m => (m.role === 'user' || m.role === 'assistant') && m.model !== 'error')
        .map(m => ({ role: m.role, content: String(m.content || '') }));

    const errors = [];
    for (const key of keys) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        if (setStatusMessage) setStatusMessage(`🤖 GPT (${model}) 呼び出し中...`);
        try {
            const res = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                signal,
                body: JSON.stringify({
                    model,
                    max_tokens: 16384,
                    messages: [{ role: 'system', content: systemPrompt }, ...cleanMessages, { role: 'user', content: input }]
                })
            });
            if (res.ok) {
                if (setStatusMessage) setStatusMessage(`🤖 GPT 書き込み中...`);
                const data = await res.json();
                return { text: data.choices[0].message.content, model };
            }
            const err = await res.json().catch(() => ({}));
            errors.push(`key…${key.slice(-4)}: ${err.error?.message || `HTTP ${res.status}`}`);
        } catch (e) {
            if (e.name === 'AbortError') throw e;
            errors.push(e.message);
        }
    }
    throw new Error('OpenAI:\n' + errors.join('\n'));
}

async function callAnthropicAPI(input, messages, systemPrompt, keys, setStatusMessage, signal, modelId) {
    const model = modelId || 'claude-opus-4-5';
    const cleanMessages = (messages || [])
        .filter(m => (m.role === 'user' || m.role === 'assistant') && m.model !== 'error')
        .map(m => ({ role: m.role, content: String(m.content || '') }));

    const errors = [];
    for (const key of keys) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        if (setStatusMessage) setStatusMessage(`🧠 Claude (${model}) 呼び出し中...`);
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
                    system: systemPrompt,
                    messages: [...cleanMessages, { role: 'user', content: input }]
                })
            });
            if (res.ok) {
                if (setStatusMessage) setStatusMessage(`🧠 Claude 書き込み中...`);
                const data = await res.json();
                return { text: data.content[0].text, model };
            }
            const err = await res.json().catch(() => ({}));
            errors.push(`key…${key.slice(-4)}: ${err.error?.message || `HTTP ${res.status}`}`);
        } catch (e) {
            if (e.name === 'AbortError') throw e;
            errors.push(e.message);
        }
    }
    throw new Error('Anthropic:\n' + errors.join('\n'));
}

async function callOpenRouterAPI(input, messages, systemPrompt, keys, setStatusMessage, signal, modelId) {
    const cleanMessages = (messages || [])
        .filter(m => (m.role === 'user' || m.role === 'assistant') && m.model !== 'error')
        .map(m => ({ role: m.role, content: String(m.content || '') }));

    // モデルリスト（指定があれば先頭）
    let modelList = OPENROUTER_MODELS;
    if (modelId) modelList = [{ id: modelId, label: modelId }, ...OPENROUTER_MODELS.filter(m => m.id !== modelId)];

    const errors = [];
    for (const key of keys) {
        console.log('🔑 OpenRouter key …' + key.slice(-6));
        for (let i = 0; i < modelList.length; i++) {
            const { id, label } = modelList[i];
            if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
            if (setStatusMessage) setStatusMessage(`🔄 ${label} 呼び出し中... [${i+1}/${modelList.length}]`);
            try {
                const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
                        messages: [{ role: 'system', content: systemPrompt }, ...cleanMessages, { role: 'user', content: input }]
                    })
                });
                if (res.ok) {
                    if (setStatusMessage) setStatusMessage(`🔄 ${label} 書き込み中...`);
                    const data = await res.json();
                    const text = data.choices?.[0]?.message?.content;
                    if (text) return { text, model: id };
                    errors.push(`${label}(key…${key.slice(-4)}): レスポンス空`);
                } else {
                    const errBody = await res.text().catch(() => '');
                    let errMsg = res.statusText;
                    try { errMsg = JSON.parse(errBody)?.error?.message || errMsg; } catch(_) {}
                    errors.push(`${label}(key…${key.slice(-4)}): HTTP ${res.status} - ${errMsg}`);
                    if (res.status === 401) break; // このキーは全モデル不正→次のキーへ
                }
            } catch (e) {
                if (e.name === 'AbortError') throw e;
                errors.push(`${label}: ${e.message}`);
            }
        }
    }
    throw new Error('OpenRouter:\n' + errors.join('\n'));
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
async function callAI(input, messages, systemPrompt, apiKeys, setStatusMessage, signal, selectedModel) {
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
            return await callOpenRouterAPI(input, messages, systemPrompt, orKeys, setStatusMessage, signal, modelId);
        }
        if (prefix === 'gm' && gmKeys.length > 0) {
            return await callGeminiAPI(input, messages, systemPrompt, gmKeys, setStatusMessage, signal, modelId);
        }
        if (prefix === 'oa' && oaKeys.length > 0) {
            return await callOpenAIAPI(input, messages, systemPrompt, oaKeys, setStatusMessage, signal, modelId);
        }
        if (prefix === 'an' && anKeys.length > 0) {
            return await callAnthropicAPI(input, messages, systemPrompt, anKeys, setStatusMessage, signal, modelId);
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
        try { return await callOpenRouterAPI(input, messages, systemPrompt, orKeys, setStatusMessage, signal, null); }
        catch (e) { if (e.name === 'AbortError') throw e; errors.push(e.message); }
    }
    if (gmKeys.length > 0) {
        try { return await callGeminiAPI(input, messages, systemPrompt, gmKeys, setStatusMessage, signal, null); }
        catch (e) { if (e.name === 'AbortError') throw e; errors.push(e.message); }
    }
    if (oaKeys.length > 0) {
        try { return await callOpenAIAPI(input, messages, systemPrompt, oaKeys, setStatusMessage, signal, null); }
        catch (e) { if (e.name === 'AbortError') throw e; errors.push(e.message); }
    }
    if (anKeys.length > 0) {
        try { return await callAnthropicAPI(input, messages, systemPrompt, anKeys, setStatusMessage, signal, null); }
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
