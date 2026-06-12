/**
 * すするCoder v0.06.24
 * lib/components.js - React コンポーネント
 */

const { useState, useEffect, useRef } = React;

function App() {
    const [firebaseUser, setFirebaseUser] = useState(null);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    
    useEffect(() => {
        // Firebase 初期化（必須）
        window.initFirebase();
        
        // ローカルユーザー復元
        const savedUser = localStorage.getItem('coder_user_v605');
        if (savedUser) {
            try {
                const parsed = JSON.parse(savedUser);
                setUser(parsed);
                // APIキーをwindowにも保持（設定変更時の即時反映用）
                window._currentApiKeys = parsed.apiKeys || {};
            } catch (e) {
                console.error('Load user failed:', e);
            }
        }
        
        setLoading(false);
        
        // Firebase 認証リスナー
        const auth = window.getFirebaseAuth();
        if (auth) {
            const unsubscribe = auth.onAuthStateChanged((fbUser) => {
                console.log('Auth state changed:', fbUser?.email || 'logged out');
                setFirebaseUser(fbUser);
                if (fbUser && !user) {
                    const userData = {
                        id: fbUser.uid,
                        email: fbUser.email,
                        isFirebase: true,
                        apiKeys: { gemini: '', openai: '', anthropic: '', openrouter: '' }
                    };
                    localStorage.setItem('coder_user_v605', JSON.stringify(userData));
                    setUser(userData);
                }
            });
            return () => unsubscribe();
        }
    }, []);
    
    if (loading) {
        return <div className="login-screen"><span className="loading"></span></div>;
    }
    
    if (!user) {
        return <LoginScreen onLogin={setUser} />;
    }
    
    return <CoderApp user={user} onLogout={() => { setUser(null); setFirebaseUser(null); }} firebaseUser={firebaseUser} />;
}

function LoginScreen({ onLogin }) {
    const [apiKeys, setApiKeys] = useState({
        gemini: '',
        openai: '',
        anthropic: '',
        openrouter: ''
    });
    
    const handleGoogleLogin = async () => {
        try {
            const auth = window.getFirebaseAuth();
            if (!auth) {
                alert('❌ Firebase が初期化されていません\n\nlib/firebase.js の firebaseConfig を設定してください');
                return;
            }
            
            console.log('🔐 Google ログイン開始...');
            const provider = new firebase.auth.GoogleAuthProvider();
            // ✅ signInWithPopup を使用（分割ファイル構成では必須）
            const result = await auth.signInWithPopup(provider);
            
            console.log('✅ ログイン成功:', result.user.email);
            const userData = {
                id: result.user.uid,
                email: result.user.email,
                isFirebase: true,
                apiKeys
            };
            localStorage.setItem('coder_user_v605', JSON.stringify(userData));
            onLogin(userData);
        } catch (error) {
            console.error('❌ ログインエラー:', error);
            alert('ログイン失敗: ' + error.message + '\n\n💡 ブラウザのポップアップブロッカーをチェックしてください');
        }
    };
    
    const handleLocalLogin = () => {
        // 保存時に改行で分割してclean
        const cleanedKeys = {};
        for (const k of ['gemini','openai','anthropic','openrouter']) {
            const raw = apiKeys[k] || '';
            const lines = (Array.isArray(raw) ? raw.join('\n') : raw)
                .split('\n').map(l => l.trim()).filter(l => l);
            cleanedKeys[k] = lines.length <= 1 ? (lines[0] || '') : lines;
        }
        const userData = {
            id: 'local_' + Date.now(),
            isFirebase: false,
            apiKeys: cleanedKeys
        };
        localStorage.setItem('coder_user_v605', JSON.stringify(userData));
        onLogin(userData);
    };
    
    return (
        <div className="login-screen">
            <div className="login-title">すするCoder</div>
            <div className="login-subtitle">v0.06.24 - Androidプレビュー修正・バージョン比較</div>
            
            <div className="login-section">
                <button className="btn-google" onClick={handleGoogleLogin}>
                    🔐 Google でログイン
                </button>
                <div style={{ fontSize: '10px', color: '#8b949e', marginTop: '8px', textAlign: 'center' }}>
                    💡 ポップアップブロッカーをオフにしてください
                </div>
            </div>
            
            <div className="api-selection">
                <div style={{ fontSize: '12px', color: '#8b949e', textAlign: 'center' }}>
                    APIキーを登録（複数登録可能）
                </div>
                
                {['gemini', 'openai', 'anthropic', 'openrouter'].map(api => (
                    <div key={api}>
                        <label className="modal-label" style={{ marginTop: '8px' }}>
                            {api.toUpperCase()} APIキー
                        </label>
                        <textarea
                            className="modal-input"
                            style={{minHeight:'36px',resize:'vertical',fontFamily:'monospace',fontSize:'10px'}}
                            placeholder={`${api}のキー（複数は改行区切り）`}
                            value={Array.isArray(apiKeys[api]) ? apiKeys[api].join('\n') : (apiKeys[api]||'')}
                            onChange={(e) => setApiKeys({ ...apiKeys, [api]: e.target.value })}
                        />
                    </div>
                ))}
            </div>
            
            <button 
                className="btn-google"
                onClick={handleLocalLogin}
                style={{ background: '#238636', color: '#fff' }}
            >
                📌 ローカルで続ける
            </button>
        </div>
    );
}

function CoderApp({ user, onLogout, firebaseUser }) {
    const [projects, setProjects] = useState([]);
    const [currentProject, setCurrentProject] = useState(null);
    const [currentFile, setCurrentFile] = useState(null);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('chat');
    const [showSettings, setShowSettings] = useState(false);
    const [showVersions, setShowVersions] = useState(false);
    const [selectedVersion, setSelectedVersion] = useState(null);
    const [statusMessage, setStatusMessage] = useState('');
    const [reviewResult, setReviewResult] = useState(null);
    const [isReviewing, setIsReviewing] = useState(false);
    const [isPC, setIsPC] = useState(() => window.innerWidth >= 1024);
    // リサイズ追跡
    React.useEffect(() => {
        const onResize = () => setIsPC(window.innerWidth >= 1024);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);
    const [isFixing, setIsFixing] = useState(false);
    const [reviewTarget, setReviewTarget] = useState('file');  // 'file' | 'project'
    const [selectedModel, setSelectedModel] = useState('auto');
    const abortControllerRef = useRef(null);
    const messagesEndRef = useRef(null);
    const messagesContainerRef = useRef(null);
    
    useEffect(() => {
        const saved = localStorage.getItem('coder_projects_v605');
        if (saved) {
            try {
                const loaded = JSON.parse(saved);
                const projArray = Array.isArray(loaded) ? loaded : [loaded];
                setProjects(projArray);
                if (projArray.length > 0) {
                    setCurrentProject(projArray[0]);
                }
            } catch (e) {
                console.error('Load projects failed:', e);
            }
        }
        
        if (user.isFirebase) {
            const db = window.getFirebaseDb();
            if (db) {
                const userProjectsRef = db.ref(`users/${user.id}/projects`);
                userProjectsRef.on('value', (snapshot) => {
                    if (!snapshot.exists()) return;
                    const data = snapshot.val();
                    // 新構造（{id: {meta, files, messages}}）と旧構造（配列）の両対応
                    let projArray;
                    const values = Array.isArray(data) ? data : Object.values(data);
                    projArray = values.map(p => {
                        // 新構造の場合は meta/files/messages をマージ
                        if (p && p.meta) {
                            return {
                                ...p.meta,
                                files:          p.files    || [],
                                messages:       p.messages || [],
                                messageArchive: p.messageArchive || []
                            };
                        }
                        return p; // 旧構造そのまま
                    }).filter(Boolean);

                    setProjects(projArray);
                    setCurrentProject(prev => {
                        if (prev) return prev; // 既にプロジェクト選択済みなら上書きしない
                        return projArray.length > 0 ? projArray[0] : null;
                    });
                });
                
                return () => {
                    userProjectsRef.off();
                };
            }
        }
    }, [user]);
    
    // ─── Firebase 差分同期用の前回状態を保持 ──────────────────
    const prevProjectRef = useRef(null);

    useEffect(() => {
        if (currentProject && projects.length > 0) {
            const updated = projects.map(p =>
                p.id === currentProject.id ? currentProject : p
            );
            setProjects(updated);
            localStorage.setItem('coder_projects_v605', JSON.stringify(updated));

            if (user.isFirebase) {
                const db = window.getFirebaseDb();
                if (db) {
                    const base = `users/${user.id}/projects/${currentProject.id}`;
                    const prev = prevProjectRef.current;

                    // 初回 or id変更 → メタ情報のみ書き込み（軽量）
                    if (!prev || prev.id !== currentProject.id) {
                        const meta = {
                            id:        currentProject.id,
                            name:      currentProject.name,
                            readme:    currentProject.readme || '',
                            changelog: currentProject.changelog || [],
                            createdAt: currentProject.createdAt
                        };
                        const retryWrite = (ref, data, label) => ref.set(data).catch(e => { console.warn(`Firebase ${label} sync retry...`); setTimeout(() => ref.set(data).catch(e2 => console.error(`Firebase ${label} sync failed:`, e2)), 3000); });
                        retryWrite(db.ref(base + '/meta'), meta, 'meta');
                        retryWrite(db.ref(base + '/files'), currentProject.files || [], 'files');
                        retryWrite(db.ref(base + '/messages'), currentProject.messages || [], 'messages');
                    } else {
                        // 差分のみ書き込み
                        if (JSON.stringify(prev.messages) !== JSON.stringify(currentProject.messages)) {
                            db.ref(base + '/messages').set(currentProject.messages || []).catch(e => console.error('Firebase messages sync:', e));
                        }
                        if (JSON.stringify(prev.files) !== JSON.stringify(currentProject.files)) {
                            db.ref(base + '/files').set(currentProject.files || []).catch(e => console.error('Firebase files sync:', e));
                        }
                        const metaChanged = prev.name !== currentProject.name
                            || prev.readme !== currentProject.readme
                            || JSON.stringify(prev.changelog) !== JSON.stringify(currentProject.changelog);
                        if (metaChanged) {
                            const meta = {
                                id:        currentProject.id,
                                name:      currentProject.name,
                                readme:    currentProject.readme || '',
                                changelog: currentProject.changelog || [],
                                createdAt: currentProject.createdAt
                            };
                            db.ref(base + '/meta').set(meta).catch(e => console.error('Firebase meta sync:', e));
                        }
                    }
                    prevProjectRef.current = currentProject;
                }
            }
        }
    }, [currentProject]);
    
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [currentProject?.messages]);
    
    const createProject = () => {
        const name = prompt('プロジェクト名:');
        if (name) {
            const proj = {
                id: 'proj_' + Date.now(),
                name,
                readme: '',
                messages: [],
                messageArchive: [],
                files: [],
                changelog: [],
                createdAt: new Date().toISOString()
            };
            setProjects([...projects, proj]);
            setCurrentProject(proj);
        }
    };

    // ✅ v0.06.04から復活: プロジェクト削除
    const deleteProject = (projId) => {
        if (!confirm('このプロジェクトを削除しますか？')) return;
        const updated = projects.filter(p => p.id !== projId);
        setProjects(updated);
        localStorage.setItem('coder_projects_v605', JSON.stringify(updated));
        if (currentProject?.id === projId) {
            setCurrentProject(updated.length > 0 ? updated[0] : null);
        }
        if (user.isFirebase) {
            const db = window.getFirebaseDb();
            if (db) {
                db.ref(`users/${user.id}/projects/${projId}`).remove()
                    .catch(e => console.warn('Firebase delete:', e));
            }
        }
    };
    
    const switchProject = (proj) => {
        setCurrentProject(proj);
        setCurrentFile(proj.files && proj.files.length > 0 ? proj.files[0] : null);
    };
    
    const uploadFile = async (e) => {
        const fileList = Array.from(e.target.files || []);
        if (fileList.length === 0 || !currentProject) return;
        
        setStatusMessage(`📂 ${fileList.length}件 読み込み中...`);
        const newFiles = [];
        const errors = [];
        const BINARY_SKIP = ['.png','.jpg','.jpeg','.gif','.webp','.pdf','.exe','.bin','.wasm'];

        for (const file of fileList) {
            // ZIPは自動展開
            if (file.name.toLowerCase().endsWith('.zip')) {
                try {
                    const zipData = await file.arrayBuffer();
                    const zip = await JSZip.loadAsync(zipData);
                    for (const [path, entry] of Object.entries(zip.files)) {
                        if (entry.dir) continue;
                        const fn = path.replace(/^[^/]+\//, ''); // トップフォルダ除去
                        if (!fn) continue;
                        if (BINARY_SKIP.some(ext => fn.toLowerCase().endsWith(ext))) continue;
                        try {
                            const text = await entry.async('string');
                            newFiles.push({
                                id: 'file_' + Date.now() + '_' + Math.random().toString(36).slice(2),
                                name: fn,
                                content: text,
                                language: window.detectLanguage(fn),
                                version: 1,
                                versions: [{ v: 1, content: text, date: new Date().toISOString() }],
                                createdAt: new Date().toISOString()
                            });
                        } catch (_) { errors.push(fn); }
                    }
                } catch (err) {
                    errors.push(file.name + '(ZIP展開失敗)');
                }
                continue;
            }
            // 通常ファイル
            if (BINARY_SKIP.some(ext => file.name.toLowerCase().endsWith(ext))) {
                errors.push(file.name + '(バイナリスキップ)');
                continue;
            }
            try {
                const text = await file.text();
                newFiles.push({
                    id: 'file_' + Date.now() + '_' + Math.random().toString(36).slice(2),
                    name: file.name,
                    content: text,
                    language: window.detectLanguage(file.name),
                    version: 1,
                    versions: [{ v: 1, content: text, date: new Date().toISOString() }],
                    createdAt: new Date().toISOString()
                });
            } catch (err) {
                errors.push(file.name);
            }
        }

        if (newFiles.length > 0) {
            const updated = { ...currentProject, files: [...(currentProject.files || []), ...newFiles] };
            setCurrentProject(updated);
            setCurrentFile(newFiles[0]);
            const msg = errors.length > 0
                ? `⚠️ ${newFiles.length}件成功 / ${errors.length}件スキップ`
                : `✅ ${newFiles.length}件 読み込みました`;
            setStatusMessage(msg);
            setTimeout(() => setStatusMessage(''), 3000);
        } else {
            setStatusMessage('❌ 読み込み失敗: ' + errors.join(', '));
            setTimeout(() => setStatusMessage(''), 3000);
        }
        e.target.value = '';
    };
    
    const deleteFile = (fileId) => {
        if (confirm('ファイルを削除しますか？')) {
            const updated = {
                ...currentProject,
                files: currentProject.files.filter(f => f.id !== fileId)
            };
            setCurrentProject(updated);
            if (currentFile?.id === fileId) {
                setCurrentFile(updated.files && updated.files.length > 0 ? updated.files[0] : null);
            }
        }
    };
    
    const sendMessage = async (message = null) => {
        const msg = message || inputValue.trim();
        if (!msg || isLoading || !currentProject) return;

        const sendingProjectId = currentProject.id;
        
        // ZIPファイルがプロジェクトにある場合は警告メッセージを挿入
        const BINARY_EXTS_CHECK = ['.zip', '.tar', '.gz', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.exe', '.bin'];
        const binaryInProj = (currentProject.files || []).filter(f => BINARY_EXTS_CHECK.some(ext => f.name.toLowerCase().endsWith(ext)));
        const zipWarning = binaryInProj.length > 0
            ? `

⚠️ 注意: ${binaryInProj.map(f=>f.name).join(', ')} はバイナリファイルのためAIには内容が送られません。ZIPは展開してから各ファイルをアップロードしてください。`
            : '';

        const userMsg = { role: 'user', content: msg + (zipWarning && !message ? zipWarning : ''), timestamp: Date.now() };
        const updatedProj = {
            ...currentProject,
            messages: [...(currentProject.messages || []), userMsg]
        };
        setCurrentProject(updatedProj);
        if (!message) setInputValue('');
        setIsLoading(true);
        setStatusMessage('🔌 AIに接続中...');
        abortControllerRef.current = null;
        
        try {
            const allFiles = updatedProj.files || [];

            // ZIPやバイナリファイルを除外（そのまま送るとAIが文字化けデータを受け取る）
            const BINARY_EXTS = ['.zip', '.tar', '.gz', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.exe', '.bin', '.wasm'];
            const binaryFiles = allFiles.filter(f => BINARY_EXTS.some(ext => f.name.toLowerCase().endsWith(ext)));
            const files = allFiles.filter(f => !BINARY_EXTS.some(ext => f.name.toLowerCase().endsWith(ext)));
            if (binaryFiles.length > 0) {
                console.warn('⚠️ バイナリファイルはAIコンテキストから除外:', binaryFiles.map(f => f.name).join(', '));
            }

            // フォルダ構成ツリーを生成（Geminiへのコンテキスト改善）
            const buildTree = (fileList) => {
                const tree = {};
                fileList.forEach(f => {
                    const parts = f.name.split('/');
                    let node = tree;
                    parts.forEach((p, i) => {
                        if (i === parts.length - 1) {
                            node[p] = `[FILE v${f.version}]`;
                        } else {
                            node[p] = node[p] || {};
                            node = node[p];
                        }
                    });
                });
                const render = (node, indent = '') => Object.entries(node).map(([k, v]) =>
                    typeof v === 'string' ? `${indent}${k}  ${v}` : `${indent}${k}/\n${render(v, indent + '  ')}`
                ).join('\n');
                return render(tree);
            };

            const folderTree = files.length > 0
                ? `【フォルダ構成】\n${buildTree(files)}`
                : '';

            const fileContext = files.map(f =>
                `=== ${f.name} (v${f.version}) ===\n${f.content}`
            ).join('\n\n');

            const systemPrompt = `あなたは優秀なプログラマーです。
${folderTree}

【現在のファイル内容 ※最重要・必ずこちらを正として参照すること】
以下はユーザーがアップロードした最新の実際のコードです。チャット履歴に古いバージョンや別のコードが含まれていても、必ず以下のファイル内容を正として参照・編集してください。チャット内に登場するコードは無視してください。

${fileContext || 'なし'}

【重要】コードを生成・編集する場合は以下の形式で囲んでください：
[FILE: filename.ext]
ここにコードを書く
[/FILE]`;
            
            // APIキーを確実に取得: window._currentApiKeys + localStorage + user.apiKeys をマージ
            const _lsUser = (() => { try { return JSON.parse(localStorage.getItem('coder_user_v605') || '{}'); } catch(_) { return {}; } })();
            const _wk = window._currentApiKeys || {};
            const _lk = _lsUser.apiKeys || {};
            const _uk = user.apiKeys || {};
            // 複数キー対応: 配列または文字列を結合してユニーク配列にする
            const mergeKeys = (k) => {
                const vals = [_wk[k], _lk[k], _uk[k]].flat().filter(v => v && typeof v === 'string' && v.trim());
                return [...new Set(vals)];
            };
            const apiKeys = {
                openrouter: mergeKeys('openrouter'),
                gemini:     mergeKeys('gemini'),
                openai:     mergeKeys('openai'),
                anthropic:  mergeKeys('anthropic')
            };
            console.log('📤 APIキー確認:', Object.entries(apiKeys).map(([k,v]) => `${k}:${Array.isArray(v)?v.length+'keys':v?'✅':'❌'}`).join(' '));
            // 中断コントローラーをセット
            const abortCtrl = new AbortController();
            abortControllerRef.current = abortCtrl;
            const result = await window.callAI(msg, updatedProj.messages || [], systemPrompt, apiKeys, setStatusMessage, abortCtrl.signal, selectedModel);
            const { text: response, model: usedModel } = result;
            
            // 途切れ検出: [FILE:が開いたまま or ```が奇数個なら truncated=true
            const isTruncated = (() => {
                // [/FILE]が対応していない[FILE:があるか
                const openTags = (response.match(/\[FILE:/g) || []).length;
                const closeTags = (response.match(/\[\/FILE\]/g) || []).length;
                if (openTags > closeTags) return true;
                // ```が奇数個
                const backticks = (response.match(/```/g) || []).length;
                if (backticks % 2 !== 0) return true;
                return false;
            })();
            const assistantMsg = { 
                role: 'assistant', 
                content: response, 
                timestamp: Date.now(),
                model: usedModel,
                truncated: isTruncated
            };
            
            const extractedFiles = window.extractFiles(response);
            let updatedFiles = [...(updatedProj.files || [])];
            const changelogItems = [];
            
            extractedFiles.forEach(({ fileName, content: newContent }) => {
                const existFile = updatedFiles.find(f => f.name === fileName);
                
                if (existFile) {
                    existFile.version++;
                    existFile.versions = (existFile.versions || []).concat([{ v: existFile.version, content: newContent, date: new Date().toISOString() }]);
                    existFile.content = newContent;
                    changelogItems.push(`✏️ ${fileName} → v${existFile.version}`);
                } else {
                    updatedFiles.push({
                        id: 'file_' + Date.now(),
                        name: fileName,
                        content: newContent,
                        language: window.detectLanguage(fileName),
                        version: 1,
                        versions: [{ v: 1, content: newContent, date: new Date().toISOString() }],
                        createdAt: new Date().toISOString()
                    });
                    changelogItems.push(`✨ ${fileName} (新規)`);
                }
            });
            
            const { messages: newMessages, archive: newArchive } = window.compressMessages(
                [...updatedProj.messages, assistantMsg],
                updatedProj.messageArchive || []
            );
            
            const finalProj = {
                ...updatedProj,
                files: updatedFiles,
                messages: newMessages,
                messageArchive: newArchive,
                changelog: [
                    ...(changelogItems.length > 0 ? [{ date: new Date().toISOString(), items: changelogItems }] : []),
                    ...(updatedProj.changelog || [])
                ].slice(0, 50)
            };
            
            setCurrentProject(prev => {
                if (prev.id !== sendingProjectId) {
                    console.warn('Project switched during API call, discarding response');
                    return prev;
                }
                return finalProj;
            });
            // currentFileが更新されたファイルなら最新内容に差し替え
            if (currentFile) {
                const refreshed = updatedFiles.find(f => f.id === currentFile.id);
                if (refreshed) setCurrentFile(refreshed);
            } else if (updatedFiles.length > 0) {
                setCurrentFile(updatedFiles[0]);
            }
        } catch (error) {
            const isAbort = error.name === 'AbortError' || error.message === 'Aborted';
            const errorMsg = {
                role: 'assistant',
                content: isAbort ? '⏹ 生成を中断しました' : `❌ ${error.message}`,
                timestamp: Date.now(),
                model: 'error'
            };
            setCurrentProject({
                ...updatedProj,
                messages: [...updatedProj.messages, errorMsg]
            });
        } finally {
            setIsLoading(false);
            setStatusMessage('');
            abortControllerRef.current = null;
        }
    };

    // ✅ v0.06.04から復活: FILE形式強制送信
    const sendWithFileRequest = () => {
        const msg = inputValue.trim();
        if (!msg || isLoading || !currentProject) return;
        const withInstruction = msg + '\n\n必ず [FILE: ファイル名] ～ [/FILE] の形式でファイルを出力してください。';
        sendMessage(withInstruction);
        setInputValue('');
    };

    // ✅ v0.06.04から復活: コード精査
    const reviewFile = async (file) => {
        if (!file || isReviewing) return;
        setIsReviewing(true);
        setReviewResult('🔍 精査中...');
        
        const reviewPrompt = `以下のコードを精査してください。

ファイル名: ${file.name}
言語: ${file.language}

\`\`\`
${file.content}
\`\`\`

以下の観点でレビューしてください：
1. 🔴 エラー・バグ（動作に支障がある問題）
2. 🟡 警告（潜在的な問題・非推奨の書き方）
3. 🟢 改善提案（より良い書き方・最適化）
4. ✅ 総評

問題がない場合は「問題なし」と明記してください。
コードの修正版は出力しないでください（指摘のみ）。`;
        
        try {
            // APIキーを確実に取得（sendMessageと同じロジック）
            const _lsUser2 = (() => { try { return JSON.parse(localStorage.getItem('coder_user_v605') || '{}'); } catch(_) { return {}; } })();
            const _wk2 = window._currentApiKeys || {};
            const _lk2 = _lsUser2.apiKeys || {};
            const _uk2 = user.apiKeys || {};
            const mergeKeys2 = (k) => {
                const vals = [_wk2[k], _lk2[k], _uk2[k]].flat().filter(v => v && typeof v === 'string' && v.trim());
                return [...new Set(vals)];
            };
            const apiKeys = {
                openrouter: mergeKeys2('openrouter'),
                gemini:     mergeKeys2('gemini'),
                openai:     mergeKeys2('openai'),
                anthropic:  mergeKeys2('anthropic')
            };
            const systemPrompt = 'あなたは優秀なコードレビュアーです。指定された観点でコードを精査し、日本語で簡潔に報告してください。';
            const result = await window.callAI(reviewPrompt, [], systemPrompt, apiKeys, setStatusMessage);
            setReviewResult(result.text || '結果なし');
        } catch(e) {
            setReviewResult('❌ 精査失敗: ' + e.message);
        } finally {
            setIsReviewing(false);
        }
    };

    // プロジェクト全体精査
    const reviewProject = async () => {
        const files = currentProject?.files || [];
        if (files.length === 0 || isReviewing) return;
        setIsReviewing(true);
        setReviewTarget('project');
        setReviewResult('🔍 プロジェクト全体を精査中...');
        const filesSummary = files.map(f => `=== ${f.name} (v${f.version}) ===\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n');
        const prompt = `以下のプロジェクト全体を精査してください。\n\n${filesSummary}\n\n以下の観点でレビューしてください：\n1. 🔴 エラー・バグ（ファイル名と行番号を含む）\n2. 🟡 警告・潜在的問題\n3. 🟢 改善提案\n4. ✅ 総評\n\nコードの修正版は出力しないでください（指摘のみ）。`;
        try {
            const _ls = (() => { try { return JSON.parse(localStorage.getItem('coder_user_v605') || '{}'); } catch(_) { return {}; } })();
            const _wk = window._currentApiKeys || {};
            const mk = (k) => { const v = [_wk[k], _ls.apiKeys?.[k], user.apiKeys?.[k]].flat().filter(x => x && typeof x === 'string' && x.trim()); return [...new Set(v)]; };
            const apiKeys = { openrouter: mk('openrouter'), gemini: mk('gemini'), openai: mk('openai'), anthropic: mk('anthropic') };
            const result = await window.callAI(prompt, [], 'あなたは優秀なコードレビュアーです。指定された観点でプロジェクト全体を精査し、日本語で報告してください。', apiKeys, setStatusMessage, null, selectedModel);
            setReviewResult(result.text || '結果なし');
        } catch(e) {
            setReviewResult('❌ 精査失敗: ' + e.message);
        } finally {
            setIsReviewing(false);
            setStatusMessage('');
        }
    };

    // バグ・エラー自動修正
    const fixBugs = async () => {
        const files = currentProject?.files || [];
        if (files.length === 0 || isFixing) return;
        setIsFixing(true);
        setStatusMessage('🔧 バグ・エラーを検出して修正中...');
        const filesSummary = files.map(f => `=== ${f.name} ===\n[FILE: ${f.name}]\n${f.content}\n[/FILE]`).join('\n\n');
        const prompt = `以下のプロジェクトのコードを精査し、バグ・エラー・危険な箇所を修正してください。\n\n${filesSummary}\n\n【重要】\n- 問題のあるファイルのみ、必ず以下の形式で修正済みコード全体を出力してください:\n[FILE: ファイル名]\n修正済みコード全体\n[/FILE]\n- 問題がないファイルは出力しないでください。\n- 各修正箇所に // Fix: コメントを入れてください。\n- 問題が一切なければ「修正不要」とだけ答えてください。`;
        try {
            const _ls = (() => { try { return JSON.parse(localStorage.getItem('coder_user_v605') || '{}'); } catch(_) { return {}; } })();
            const _wk = window._currentApiKeys || {};
            const mk = (k) => { const v = [_wk[k], _ls.apiKeys?.[k], user.apiKeys?.[k]].flat().filter(x => x && typeof x === 'string' && x.trim()); return [...new Set(v)]; };
            const apiKeys = { openrouter: mk('openrouter'), gemini: mk('gemini'), openai: mk('openai'), anthropic: mk('anthropic') };
            const result = await window.callAI(prompt, [], 'あなたは優秀なプログラマーです。バグを発見し修正してください。必ず[FILE:ファイル名]...[/FILE]形式で出力してください。', apiKeys, setStatusMessage, null, selectedModel);
            const response = result.text || '';
            // extractFilesでファイルを取り出してプロジェクトに反映
            const extracted = window.extractFiles(response);
            if (extracted.length > 0) {
                let updatedFiles = [...(currentProject.files || [])];
                const changelogItems = [];
                extracted.forEach(({ fileName, content: newContent }) => {
                    const existFile = updatedFiles.find(f => f.name === fileName);
                    if (existFile) {
                        existFile.version++;
                        existFile.versions = (existFile.versions || []).concat([{ v: existFile.version, content: newContent, date: new Date().toISOString() }]);
                        existFile.content = newContent;
                        changelogItems.push(`🔧 ${fileName} → v${existFile.version} (バグ修正)`);
                    }
                });
                const finalProj = {
                    ...currentProject,
                    files: updatedFiles,
                    changelog: [
                        ...(changelogItems.length > 0 ? [{ date: new Date().toISOString(), items: changelogItems }] : []),
                        ...(currentProject.changelog || [])
                    ].slice(0, 50)
                };
                setCurrentProject(finalProj);
                if (currentFile) {
                    const refreshed = updatedFiles.find(f => f.id === currentFile.id);
                    if (refreshed) setCurrentFile(refreshed);
                }
                setStatusMessage(`✅ ${extracted.length}ファイルを修正しました`);
                setTimeout(() => setStatusMessage(''), 3000);
                setReviewResult(`🔧 修正完了: ${changelogItems.join(', ')}\n\n---\n${response}`);
                setReviewTarget('project');
            } else {
                setStatusMessage('✅ 修正不要（バグなし）');
                setTimeout(() => setStatusMessage(''), 3000);
                setReviewResult('✅ 修正不要\n\n' + response);
                setReviewTarget('project');
            }
        } catch(e) {
            setStatusMessage('❌ 修正失敗: ' + e.message);
            setTimeout(() => setStatusMessage(''), 4000);
        } finally {
            setIsFixing(false);
        }
    };

    const downloadZip = async () => {
        if (!currentProject?.files || currentProject.files.length === 0) {
            alert('ファイルがありません');
            return;
        }
        
        const zip = new JSZip();
        currentProject.files.forEach(f => {
            zip.file(f.name, f.content);
        });
        
        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = currentProject.name + '.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // ✅ v0.06.04から復活: 単一ファイルDL
    const downloadSingleFile = (file) => {
        const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };
    
    const updateFile = (content) => {
        if (!currentFile || !currentProject) return;
        const updated = currentProject.files.map(f =>
            f.id === currentFile.id ? { ...f, content } : f
        );
        setCurrentProject({ ...currentProject, files: updated });
        setCurrentFile({ ...currentFile, content });
    };
    
    if (!currentProject) {
        return (
            <div className="app-container">
                <div className="sidebar">
                    <div className="sidebar-header">
                        📁 プロジェクト {firebaseUser && <span className="user-badge">{firebaseUser.email?.split('@')[0]}</span>}
                    </div>
                    <div className="file-list">
                        {projects.map(p => (
                            <div key={p.id} className="file-item" onClick={() => switchProject(p)}>
                                <span className="file-name">{p.name}</span>
                            </div>
                        ))}
                    </div>
                    <div className="sidebar-footer">
                        <button className="btn" onClick={createProject}>＋ 新規</button>
                    </div>
                </div>
            </div>
        );
    }
    
    const files = currentProject.files || [];
    
    return (
        <>
            <div className="app-container">
                <div className="sidebar">
                    <div className="sidebar-header">
                        <span>📁 {currentProject.name}</span>
                        <div style={{display:'flex',gap:'6px',alignItems:'center'}}>
                            {/* ✅ v0.06.04から復活: クラウド同期インジケーター */}
                            {firebaseUser && <span style={{fontSize:'9px',color:'#3fb950'}}>☁</span>}
                            <span className="settings-icon" onClick={() => setShowSettings(true)}>⚙️</span>
                        </div>
                    </div>
                    
                    <div className="file-list">
                        {projects.map(p => (
                            <div 
                                key={p.id}
                                className={`file-item ${currentProject.id === p.id ? 'active' : ''}`}
                                onClick={() => switchProject(p)}
                            >
                                <span className="file-name">{p.name}</span>
                                {/* ✅ v0.06.04から復活: プロジェクト削除ボタン */}
                                <div className="file-delete" onClick={(e) => {
                                    e.stopPropagation();
                                    deleteProject(p.id);
                                }} title="削除">✕</div>
                            </div>
                        ))}
                    </div>
                    
                    <div className="sidebar-footer">
                        <button className="btn" onClick={createProject}>＋ 新規</button>
                    </div>
                    
                    <div className="sidebar-header">📄 ファイル ({files.length})</div>
                    <div className="file-list">
                        {files.map(f => (
                            <div 
                                key={f.id}
                                className={`file-item ${currentFile?.id === f.id ? 'active' : ''}`}
                                onClick={() => setCurrentFile(f)}
                            >
                                <span className="file-name">{f.name}</span>
                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                    <span className="version-badge" onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedVersion(f);
                                        setShowVersions(true);
                                    }} title="バージョン履歴">v{f.version}</span>
                                    <div className="file-delete" onClick={(e) => {
                                        e.stopPropagation();
                                        deleteFile(f.id);
                                    }}>✕</div>
                                </div>
                            </div>
                        ))}
                    </div>
                    
                    <div className="sidebar-footer">
                        <input type="file" className="file-input" id="fileUpload" onChange={uploadFile} multiple accept="*/*" />
                        <button className="btn btn-secondary" onClick={() => document.getElementById('fileUpload').click()} title="ファイルをアップロード">⬆️</button>
                        <button className="btn" onClick={downloadZip} title="ZIPでダウンロード">⬇️ ZIP</button>
                    </div>
                </div>
                
                <div className="main-content">
                    <div className="tab-buttons" style={{flexWrap:'wrap',gap:'4px',alignItems:'center'}}>
                        <button 
                            className={`tab-btn ${activeTab === 'chat' ? 'active' : ''}`}
                            onClick={() => setActiveTab('chat')}
                        >
                            💬 チャット
                        </button>
                        {currentFile && (
                            <button 
                                className={`tab-btn ${activeTab === 'editor' ? 'active' : ''}`}
                                onClick={() => setActiveTab('editor')}
                            >
                                📝 {currentFile.name}
                            </button>
                        )}
                        <button 
                            className={`tab-btn ${activeTab === 'readme' ? 'active' : ''}`}
                            onClick={() => setActiveTab('readme')}
                        >
                            📖 README
                        </button>
                        <select
                            value={selectedModel}
                            onChange={(e) => setSelectedModel(e.target.value)}
                            style={{fontSize:'11px',background:'#1c2128',color:'#c9d1d9',border:'1px solid #30363d',borderRadius:'4px',padding:'3px 6px',maxWidth:'160px',marginLeft:'auto'}}
                            title="使用するAIモデルを選択"
                        >
                            {(window.MODEL_OPTIONS||[]).map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>
                    
                    <div className={`chat-area ${activeTab !== 'chat' ? 'hidden' : ''}`}>
                        {statusMessage && (
                            <div className="status-bar" style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                                <span><span className="status-dot"></span>{statusMessage}</span>
                                {isLoading && (
                                    <button
                                        onClick={() => { abortControllerRef.current?.abort(); }}
                                        style={{marginLeft:'8px',padding:'2px 8px',fontSize:'10px',background:'#da3633',color:'#fff',border:'none',borderRadius:'3px',cursor:'pointer',flexShrink:0}}
                                        title="生成を中断"
                                    >⏹ 中断</button>
                                )}
                            </div>
                        )}
                        <div className="messages" ref={messagesContainerRef}>
                            {(currentProject.messages || []).length === 0 && (
                                <div style={{ textAlign: 'center', color: '#8b949e', fontSize: '13px', marginTop: '20px' }}>
                                    🚀 プロジェクトを始めましょう！
                                </div>
                            )}
                            {(currentProject.messages || []).map((msg, i) => (
                                <div key={i}>
                                    <div className={`message ${msg.role}`}>
                                        <MessageContent content={msg.content} role={msg.role} />
                                    </div>
                                    <div style={{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
                                        {msg.model && msg.model !== 'error' && <div className="message-model">📡 {msg.model}</div>}
                                        {msg.timestamp && <div className="message-model" style={{color:'#555d6b'}}>🕐 {new Date(msg.timestamp).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</div>}
                                        <button
                                            className="msg-btn"
                                            style={{padding:'1px 6px',fontSize:'10px',marginLeft:'auto'}}
                                            onClick={() => navigator.clipboard.writeText(msg.content).then(() => {}).catch(() => {})}
                                            title="メッセージをコピー"
                                        >📋 コピー</button>
                                    </div>
                                    {/* ✅ v0.06.04から復活: 再試行ボタン */}
                                    {msg.role === 'user' && (
                                        <div className="message-actions" style={{ justifyContent: 'flex-end' }}>
                                            <button className="msg-btn" onClick={() => sendMessage(msg.content)} disabled={isLoading}>
                                                🔄 再試行
                                            </button>
                                        </div>
                                    )}
                                    {/* 途切れ検出: 続きを生成ボタン */}
                                    {msg.role === 'assistant' && msg.truncated && (
                                        <div className="message-actions" style={{ justifyContent: 'flex-end' }}>
                                            <button className="msg-btn" style={{color:'#f0883e',borderColor:'#f0883e'}}
                                                onClick={() => sendMessage('続きを書いてください。前のレスポンスが途中で切れました。途切れた箇所から続きを書いてください。')}
                                                disabled={isLoading}
                                                title="レスポンスが途中で切れた可能性があります"
                                            >
                                                ✂️ 続きを生成
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {isLoading && (
                                <div className="message">
                                    <div className="message-content assistant">
                                        <span className="loading"></span>
                                        <span className="loading"></span>
                                        <span className="loading"></span>
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                        
                        {/* ✅ v0.06.04から復活: クイックボタン */}
                        <div className="quick-btns">
                            {['ファイルで作って', 'バグを直して', 'コメントを追加して', 'リファクタして', 'テストを書いて'].map(q => (
                                <button key={q} className="quick-btn" onClick={() => {
                                    setInputValue(v => v ? v + ' ' + q : q);
                                }} disabled={isLoading}>{q}</button>
                            ))}
                        </div>

                        <div className="input-area">
                            <textarea
                                className="input-field"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && e.ctrlKey) {
                                        sendMessage();
                                    }
                                }}
                                placeholder="コードを作ってください... (Ctrl+Enterで送信)"
                                rows="2"
                                disabled={isLoading}
                            ></textarea>
                            <div style={{display:'flex',flexDirection:'column',gap:'4px'}}>
                                <button 
                                    className="send-btn"
                                    onClick={() => sendMessage()}
                                    disabled={isLoading}
                                >
                                    送信
                                </button>
                                {/* ✅ v0.06.04から復活: 📎FILE強制送信ボタン */}
                                <button
                                    className="file-btn"
                                    onClick={sendWithFileRequest}
                                    disabled={isLoading}
                                    title="[FILE:...]形式で出力するよう自動指示して送信"
                                >
                                    📎
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    {currentFile && (isPC || activeTab === 'editor') && (
                        <div className={`editor-panel${activeTab === 'editor' || isPC ? ' active' : ''}`}>
                            <div className="editor-header">
                                <span>{currentFile.name}</span>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    {/* ✅ v0.06.04から復活: 精査ボタン */}
                                    <button 
                                        className="btn btn-secondary" 
                                        style={{ padding: '2px 8px', fontSize: '11px', height: 'auto', minWidth: 'auto' }}
                                        onClick={() => reviewFile(currentFile)}
                                        disabled={isReviewing || isFixing}
                                        title="このファイルをAIで精査"
                                    >
                                        {isReviewing && reviewTarget==='file' ? '🔍...' : '🔍 精査'}
                                    </button>
                                    {/* 全体精査ボタン */}
                                    <button 
                                        className="btn btn-secondary" 
                                        style={{ padding: '2px 8px', fontSize: '11px', height: 'auto', minWidth: 'auto', color:'#79c0ff' }}
                                        onClick={reviewProject}
                                        disabled={isReviewing || isFixing}
                                        title="プロジェクト全ファイルを精査"
                                    >
                                        {isReviewing && reviewTarget==='project' ? '🔍...' : '🔍 全体'}
                                    </button>
                                    {/* バグ自動修正ボタン */}
                                    <button 
                                        className="btn btn-secondary" 
                                        style={{ padding: '2px 8px', fontSize: '11px', height: 'auto', minWidth: 'auto', color:'#f0883e' }}
                                        onClick={fixBugs}
                                        disabled={isReviewing || isFixing}
                                        title="バグ・エラー・危険箇所を検出して自動修正"
                                    >
                                        {isFixing ? '🔧...' : '🔧 バグ修正'}
                                    </button>
                                    {/* ✅ v0.06.04から復活: 単一ファイル保存ボタン */}
                                    <button 
                                        className="btn btn-secondary" 
                                        style={{ padding: '2px 6px', fontSize: '10px', height: 'auto', minWidth: 'auto' }} 
                                        onClick={() => downloadSingleFile(currentFile)}
                                    >
                                        💾 保存
                                    </button>
                                    <span className="version-badge">v{currentFile.version}</span>
                                    <span>{currentFile.language}</span>
                                </div>
                            </div>
                            <div className="editor-content">
                                <textarea
                                    className="editor-textarea"
                                    value={currentFile.content}
                                    onChange={(e) => updateFile(e.target.value)}
                                ></textarea>
                            </div>
                            {/* ✅ v0.06.04から復活: 精査結果パネル */}
                            {reviewResult && (
                                <>
                                    <div className="review-header">
                                        <span>🔍 精査結果: {currentFile.name}</span>
                                        <button onClick={() => setReviewResult(null)} style={{background:'none',border:'none',color:'#8b949e',cursor:'pointer',fontSize:'14px'}}>✕</button>
                                    </div>
                                    <div className="review-result">{reviewResult}</div>
                                </>
                            )}
                        </div>
                    )}
                    
                    {activeTab === 'readme' && (
                        <div className="editor-panel active">
                            <div className="editor-header">📖 README</div>
                            <div className="editor-content">
                                <textarea
                                    className="editor-textarea"
                                    value={currentProject.readme || ''}
                                    onChange={(e) => setCurrentProject({ ...currentProject, readme: e.target.value })}
                                    placeholder="プロジェクトの説明を書いてください..."
                                ></textarea>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {showSettings && (
                <SettingsModal 
                    project={currentProject}
                    onClose={() => setShowSettings(false)}
                    onLogout={onLogout}
                    user={user}
                    firebaseUser={firebaseUser}
                    onUpdateApiKeys={(newKeys) => {
                        const updatedUser = { ...user, apiKeys: newKeys };
                        localStorage.setItem('coder_user_v605', JSON.stringify(updatedUser));
                        // userをCoderApp外のApp stateに反映させるためonLogout/onLogin相当が必要だが
                        // ここではlocalStorageに保存し次回送信時に再読み込みされるよう対処
                        // ＋ページリロードなしで即反映するためwindow経由で保持
                        window._currentApiKeys = newKeys;
                    }}
                />
            )}
            
            {showVersions && selectedVersion && (
                <VersionModal
                    file={selectedVersion}
                    onClose={() => { setShowVersions(false); setSelectedVersion(null); }}
                    onRevert={(version) => {
                        const updated = currentProject.files.map(f =>
                            f.id === selectedVersion.id ? { ...f, content: version.content, version: version.v } : f
                        );
                        setCurrentProject({ ...currentProject, files: updated });
                        setCurrentFile(updated.find(f => f.id === selectedVersion.id));
                        setShowVersions(false);
                    }}
                    onCompareDiff={(oldVer, newVer) => {
                        // 差分をチャットに送ってAIに調査・修正依頼
                        const prompt = `${selectedVersion.name} のバージョン間で動作が変わりました。差分を調査して、バグや問題があれば修正してください。

【v${oldVer.v}（旧バージョン）】
[FILE: ${selectedVersion.name}]
${oldVer.content}
[/FILE]

【v${newVer.v}（現在バージョン）】
[FILE: ${selectedVersion.name}]
${newVer.content}
[/FILE]

v${oldVer.v}で動いていた機能がv${newVer.v}で動かなくなった可能性があります。差分を解析して問題箇所を特定し、修正済みコードを[FILE: ${selectedVersion.name}]...[/FILE]形式で出力してください。`;
                        setShowVersions(false);
                        setSelectedVersion(null);
                        setActiveTab('chat');
                        setTimeout(() => sendMessage(prompt), 100);
                    }}
                />
            )}
        </>
    );
}

function SettingsModal({ project, onClose, onLogout, user, firebaseUser, onUpdateApiKeys }) {
    const [tab, setTab] = useState('api');
    const [apiKeys, setApiKeys] = useState(() => ({
        gemini:     user.apiKeys?.gemini     || '',
        openai:     user.apiKeys?.openai     || '',
        anthropic:  user.apiKeys?.anthropic  || '',
        openrouter: user.apiKeys?.openrouter || ''
    }));
    // バージョンアップ後も既存のAPIキーをそのまま読む（localStorageキー名は変わらない）
    const [saved, setSaved] = useState(false);

    const saveApiKeys = () => {
        // 保存時に改行で分割・trim・空行除去して配列化
        const cleanedKeys = {};
        for (const k of ['openrouter','gemini','openai','anthropic']) {
            const raw = apiKeys[k] || '';
            const lines = (Array.isArray(raw) ? raw.join('\n') : raw)
                .split('\n').map(l => l.trim()).filter(l => l);
            cleanedKeys[k] = lines.length <= 1 ? (lines[0] || '') : lines;
        }
        onUpdateApiKeys(cleanedKeys);
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
    };

    return (
        <div className="modal">
            <div className="modal-content">
                <div className="modal-title">設定</div>

                <div style={{display:'flex',gap:'6px',marginBottom:'12px'}}>
                    {['api','info','history'].map(t => (
                        <button key={t} className={`tab-btn ${tab===t?'active':''}`} style={{flex:1,padding:'6px'}} onClick={()=>setTab(t)}>
                            {t==='api'?'🔑 API':t==='info'?'👤 情報':'📋 履歴'}
                        </button>
                    ))}
                </div>

                {/* APIキー編集タブ */}
                {tab === 'api' && (
                    <div>
                        <div style={{fontSize:'11px',color:'#8b949e',marginBottom:'10px'}}>
                            使うAPIのキーを入力してください（複数登録可・上から優先）
                        </div>
                        <div style={{fontSize:'10px',color:'#8b949e',marginBottom:'6px'}}>
                            💡 複数キーは改行で区切って入力（上から順に試します）
                        </div>
                        {['openrouter','gemini','openai','anthropic'].map(api => (
                            <div className="modal-section" key={api}>
                                <label className="modal-label">{api.toUpperCase()} APIキー</label>
                                <textarea
                                    className="modal-input"
                                    style={{minHeight:'44px',resize:'vertical',fontFamily:'monospace',fontSize:'10px'}}
                                    placeholder={`${api}のキー（複数は改行で区切り）`}
                                    value={Array.isArray(apiKeys[api]) ? apiKeys[api].join('\n') : (apiKeys[api]||'')}
                                    onChange={(e) => setApiKeys({...apiKeys, [api]: e.target.value})}
                                />
                            </div>
                        ))}
                        <button
                            className="modal-btn modal-btn-primary"
                            style={{width:'100%',padding:'8px',marginTop:'4px'}}
                            onClick={saveApiKeys}
                        >
                            {saved ? '✅ 保存中...' : '💾 保存して再起動'}
                        </button>
                    </div>
                )}

                {tab === 'info' && (
                    <div className="modal-section">
                        <label className="modal-label">ユーザー情報</label>
                        <div style={{ fontSize: '12px', color: '#8b949e', padding: '8px', background: '#0d1117', borderRadius: '4px' }}>
                            {firebaseUser ? (
                                <>
                                    <div>✅ Firebase: {firebaseUser.email}</div>
                                    <div style={{ marginTop: '4px', fontSize: '10px' }}>データはクラウド同期中</div>
                                </>
                            ) : (
                                <div>📌 ローカルモード</div>
                            )}
                        </div>
                    </div>
                )}

                {tab === 'history' && (
                    <div style={{maxHeight:'300px',overflowY:'auto'}}>
                        {(!project?.changelog || project.changelog.length === 0) ? (
                            <div style={{color:'#8b949e',fontSize:'12px'}}>履歴なし</div>
                        ) : project.changelog.map((c, i) => (
                            <div key={i} style={{marginBottom:'10px',borderBottom:'1px solid #30363d',paddingBottom:'8px'}}>
                                <div style={{fontSize:'10px',color:'#8b949e'}}>{new Date(c.date).toLocaleString('ja-JP')}</div>
                                {c.items.map((item, j) => (
                                    <div key={j} style={{fontSize:'11px',color:'#c9d1d9',marginTop:'2px'}}>{item}</div>
                                ))}
                            </div>
                        ))}
                    </div>
                )}
                
                <div className="modal-buttons">
                    <button className="modal-btn modal-btn-secondary" onClick={onClose}>
                        閉じる
                    </button>
                    <button className="modal-btn modal-btn-secondary" onClick={() => {
                        if (confirm('ログアウトしますか？')) {
                            localStorage.removeItem('coder_user_v605');
                            const auth = window.getFirebaseAuth();
                            if (auth) {
                                auth.signOut().catch(e => console.error('Logout failed:', e));
                            }
                            onLogout();
                        }
                    }}>
                        ログアウト
                    </button>
                </div>
            </div>
        </div>
    );
}

function VersionModal({ file, onClose, onRevert, onCompareDiff }) {
    const [compareV, setCompareV] = useState(null);  // 比較元バージョン
    const versions = (file.versions || []).slice().reverse();

    // 簡易差分: 行単位で追加/削除を表示
    const computeDiff = (oldContent, newContent) => {
        const oldLines = (oldContent || '').split('\n');
        const newLines = (newContent || '').split('\n');
        const result = [];
        const maxLen = Math.max(oldLines.length, newLines.length);
        for (let i = 0; i < maxLen; i++) {
            const o = oldLines[i];
            const n = newLines[i];
            if (o === n) result.push({ type: 'same', line: n, no: i+1 });
            else {
                if (o !== undefined) result.push({ type: 'del', line: o, no: i+1 });
                if (n !== undefined) result.push({ type: 'add', line: n, no: i+1 });
            }
        }
        return result;
    };

    const currentVer = (file.versions || []).find(v => v.v === file.version) || (file.versions||[]).slice(-1)[0];
    const diff = compareV ? computeDiff(compareV.content, currentVer?.content || '') : null;
    const diffStats = diff ? { add: diff.filter(d=>d.type==='add').length, del: diff.filter(d=>d.type==='del').length } : null;

    return (
        <div className="modal">
            <div className="modal-content" style={{maxWidth:'600px',width:'95vw'}}>
                <div className="modal-title">{file.name} - バージョン履歴</div>

                {/* 差分表示エリア */}
                {compareV && diff && (
                    <div style={{marginBottom:'12px'}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'4px'}}>
                            <span style={{fontSize:'11px',color:'#8b949e'}}>
                                v{compareV.v} → v{currentVer?.v}（現在）の差分
                                　<span style={{color:'#3fb950'}}>+{diffStats.add}</span>
                                　<span style={{color:'#f85149'}}>-{diffStats.del}</span>
                            </span>
                            <div style={{display:'flex',gap:'4px'}}>
                                <button
                                    style={{padding:'2px 8px',fontSize:'10px',background:'#f0883e',color:'#fff',border:'none',borderRadius:'2px',cursor:'pointer'}}
                                    onClick={() => onCompareDiff(compareV, currentVer)}
                                    title="差分をAIに調査させて修正提案を出す"
                                >🤖 AIに差分調査・修正依頼</button>
                                <button
                                    style={{padding:'2px 6px',fontSize:'10px',background:'#30363d',color:'#c9d1d9',border:'none',borderRadius:'2px',cursor:'pointer'}}
                                    onClick={() => setCompareV(null)}
                                >✕ 閉じる</button>
                            </div>
                        </div>
                        <div style={{maxHeight:'240px',overflow:'auto',background:'#0d1117',borderRadius:'4px',fontSize:'10px',fontFamily:'monospace',lineHeight:'1.4'}}>
                            {diff.filter(d => d.type !== 'same').length === 0
                                ? <div style={{padding:'8px',color:'#8b949e'}}>差分なし（同一内容）</div>
                                : diff.map((d, i) => d.type === 'same' ? null : (
                                    <div key={i} style={{
                                        padding:'1px 8px',
                                        background: d.type==='add' ? '#0d2b1a' : '#2d1117',
                                        color: d.type==='add' ? '#3fb950' : '#f85149',
                                        borderLeft: `3px solid ${d.type==='add' ? '#3fb950' : '#f85149'}`
                                    }}>
                                        <span style={{color:'#555d6b',marginRight:'8px',userSelect:'none'}}>{d.no}</span>
                                        {d.type==='add' ? '+' : '-'} {d.line}
                                    </div>
                                ))
                            }
                        </div>
                    </div>
                )}

                <div className="version-list">
                    {versions.map((v, i) => (
                        <div key={i} className={`version-item ${v.v === file.version ? 'current' : ''}`}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>v{v.v} {v.v === file.version && '(現在)'}</span>
                                <span style={{ fontSize: '10px', color: '#8b949e' }}>
                                    {new Date(v.date).toLocaleDateString('ja-JP')}
                                </span>
                            </div>
                            <div style={{display:'flex',gap:'4px',marginTop:'4px',flexWrap:'wrap'}}>
                                {v.v !== file.version && (
                                    <button
                                        style={{ padding: '2px 6px', fontSize: '10px', background: '#1f6feb', color: '#fff', border: 'none', borderRadius: '2px', cursor: 'pointer' }}
                                        onClick={() => onRevert(v)}
                                    >⏪ この版に戻す</button>
                                )}
                                {v.v !== file.version && (
                                    <button
                                        style={{ padding: '2px 6px', fontSize: '10px', background: compareV?.v === v.v ? '#388bfd' : '#30363d', color: '#c9d1d9', border: 'none', borderRadius: '2px', cursor: 'pointer' }}
                                        onClick={() => setCompareV(compareV?.v === v.v ? null : v)}
                                        title="この版と現在の版の差分を表示"
                                    >{compareV?.v === v.v ? '✕ 比較中' : '🔀 現在版と比較'}</button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="modal-buttons" style={{ marginTop: '16px' }}>
                    <button className="modal-btn modal-btn-secondary" onClick={onClose}>閉じる</button>
                </div>
            </div>
        </div>
    );
}

// ─── コード折りたたみ付きメッセージ表示コンポーネント ─────────────────
function MessageContent({ content, role }) {
    const [collapsed, setCollapsed] = useState({});

    // エラーメッセージ（❌で始まる長いテキスト）は丸ごと折りたたみ
    const isError = content.startsWith('❌') && content.length > 80;
    if (isError) {
        const isOpen = collapsed['error'] === true;  // デフォルト閉じ
        const firstLine = content.split('\n')[0];
        return (
            <div className="message-content assistant" style={{padding:0}}>
                <div
                    onClick={() => setCollapsed(prev => ({ ...prev, error: !prev['error'] }))}
                    style={{
                        display:'flex', alignItems:'center', justifyContent:'space-between',
                        padding:'4px 10px', cursor:'pointer', background:'#2d1117',
                        fontSize:'11px', color:'#f85149', userSelect:'none', borderRadius:'4px'
                    }}
                >
                    <span>{firstLine}</span>
                    <span style={{fontSize:'10px', flexShrink:0, marginLeft:'8px'}}>{isOpen ? '▲ 閉じる' : '▼ 詳細を見る'}</span>
                </div>
                {isOpen && (
                    <pre style={{
                        margin:0, padding:'8px 12px',
                        background:'#0d1117', color:'#f85149',
                        fontSize:'11px', lineHeight:'1.5',
                        overflow:'auto', whiteSpace:'pre-wrap', wordBreak:'break-all',
                        maxHeight:'300px'
                    }}>{content}</pre>
                )}
            </div>
        );
    }

    // コードブロック・[FILE:...]ブロックを解析して分割表示
    const parts = [];
    // まずFILEブロックとコードブロックを検出
    const blockRegex = /(\[FILE:\s*[^\]]+\][\s\S]*?\[\/FILE\]|```[\s\S]*?```)/g;
    let lastIndex = 0;
    let blockIdx = 0;
    let match;
    while ((match = blockRegex.exec(content)) !== null) {
        if (match.index > lastIndex) {
            parts.push({ type: 'text', value: content.slice(lastIndex, match.index) });
        }
        const raw = match[0];
        const isFile = raw.startsWith('[FILE:');
        // ヘッダーを抽出
        let header = '';
        if (isFile) {
            const hm = raw.match(/\[FILE:\s*([^\]]+)\]/);
            header = hm ? '📄 ' + hm[1].trim() : '📄 FILE';
        } else {
            const hm = raw.match(/^```(\S*)/);
            header = '💻 ' + (hm && hm[1] ? hm[1] : 'code');
        }
        parts.push({ type: 'block', id: blockIdx, header, value: raw });
        blockIdx++;
        lastIndex = match.index + raw.length;
    }
    if (lastIndex < content.length) {
        parts.push({ type: 'text', value: content.slice(lastIndex) });
    }

    // ブロックがない場合はそのまま表示
    if (parts.every(p => p.type === 'text')) {
        return <div className={`message-content${role === 'user' ? ' user' : ' assistant'}`}>{content}</div>;
    }

    const toggleCollapse = (id) => setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));

    return (
        <div className={`message-content${role === 'user' ? ' user' : ' assistant'}`} style={{padding:0}}>
            {parts.map((part, i) => {
                if (part.type === 'text') {
                    return part.value ? (
                        <div key={i} style={{padding:'8px 12px',whiteSpace:'pre-wrap',wordBreak:'break-word'}}>{part.value}</div>
                    ) : null;
                }
                const isOpen = collapsed[part.id] === true;  // デフォルト閉じ
                return (
                    <div key={i} style={{borderTop: i > 0 ? '1px solid #30363d' : 'none'}}>
                        <div
                            onClick={() => toggleCollapse(part.id)}
                            style={{
                                display:'flex', alignItems:'center', justifyContent:'space-between',
                                padding:'4px 10px', cursor:'pointer', background:'#1a1f28',
                                fontSize:'11px', color:'#8b949e', userSelect:'none'
                            }}
                        >
                            <span>{part.header}</span>
                            <span style={{fontSize:'10px'}}>{isOpen ? '▲ 閉じる' : '▼ 展開'}</span>
                        </div>
                        {isOpen && (
                            <pre style={{
                                margin:0, padding:'8px 12px',
                                background:'#0d1117', color:'#c9d1d9',
                                fontSize:'12px', lineHeight:'1.5',
                                overflow:'auto', whiteSpace:'pre-wrap', wordBreak:'break-all',
                                maxHeight:'400px'
                            }}>{part.value}</pre>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// アプリ起動
ReactDOM.render(<App />, document.getElementById('root'));
