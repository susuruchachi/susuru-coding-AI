# 🔐 Google ログイン トラブルシューティング

## 🚨 問題: ログインボタンが反応しない・ログインできない

### ✅ 修正内容（v0.06.05 修正版）

**変更点:**
```javascript
// ❌ 修正前（signInWithRedirect）
await auth.signInWithRedirect(new firebase.auth.GoogleAuthProvider());

// ✅ 修正後（signInWithPopup）
await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
```

**理由:**
- `signInWithRedirect` → ページをリダイレクトする（分割ファイル構成では不安定）
- `signInWithPopup` → ポップアップでログイン（分割ファイル構成で推奨）

---

## 🔧 チェックリスト

### 1️⃣ ブラウザ設定

- [ ] **ポップアップブロッカーをオフにした**
  ```
  Chrome の場合:
  1. URLバー右の「ポップアップをブロック」アイコン
  2. 「このサイトでのポップアップをすべて許可」をクリック
  ```

- [ ] **Cookieが有効**
  ```
  設定 → プライバシーとセキュリティ → Cookie を「すべて許可」
  ```

- [ ] **シークレットモード/プライベートモードではない**

### 2️⃣ Firebase設定

- [ ] **lib/firebase.js に firebaseConfig が設定されている**
  ```javascript
  const FIREBASE_CONFIG = {
      apiKey: "AIzaSyBEWlL...",       // ✅ 実際の値
      authDomain: "your-project...",  // ✅ 実際の値
      ...
  };
  ```

- [ ] **Firebase Google認証が有効**
  ```
  1. Firebase コンソール → Authentication
  2. 「Google」が「有効」になっている
  3. サポートメールが設定されている
  ```

- [ ] **認可ドメインが設定されている**
  ```
  1. Firebase コンソール → Authentication → Settings
  2. 「認可済みドメイン」に以下を追加：
     ✅ localhost
     ✅ 127.0.0.1
     ✅ あなたのドメイン（本番環境の場合）
  ```

### 3️⃣ ファイル構成

- [ ] **全ファイルが正しい階層にある**
  ```
  coding_ai_v0.06.05/
  ├── index.html         ✅
  ├── css/
  │   └── styles.css     ✅
  └── lib/
      ├── utils.js       ✅
      ├── firebase.js    ✅ （設定済み）
      ├── api.js         ✅
      └── components.js  ✅ （signInWithPopup 使用）
  ```

- [ ] **components.js が最新版**
  ```javascript
  // 確認: components.js 内に以下の行がある
  const result = await auth.signInWithPopup(provider);
  ```

### 4️⃣ ネットワーク確認

- [ ] **ブラウザのコンソールエラーを確認**
  ```
  F12 → Console タブ
  赤いエラーがないか確認
  ```

- [ ] **Network タブで API 呼び出し確認**
  ```
  F12 → Network タブ
  「identitytoolkit」で検索
  200 OK が返ってきているか確認
  ```

---

## 🎯 ログイン手順

### ステップ1: 準備
1. ブラウザのポップアップブロッカーをオフ
2. Cookieを有効にする
3. Firebase の認可ドメインを設定

### ステップ2: ログイン
1. `index.html` をブラウザで開く
2. 「🔐 Google でログイン」をクリック
3. Google ログイン画面が**ポップアップで出現**
4. Googleアカウントでログイン

### ステップ3: 成功
- ✅ ポップアップが閉じる
- ✅ メインアプリが表示される
- ✅ Googleアカウントがヘッダーに表示される

---

## ❌ よくあるエラー

### エラー1: ポップアップが出ない
```
原因: ポップアップブロッカーが有効
解決: ブラウザ設定でポップアップ許可
```

### エラー2: "Firebase が初期化されていません"
```
原因: lib/firebase.js の firebaseConfig が未設定
解決: FIREBASE_SETUP.md に従って設定
```

### エラー3: "ログイン失敗: The requested project was not found"
```
原因: Firebase projectId が存在しない
解決: Firebase コンソールでプロジェクト確認
```

### エラー4: "ログイン失敗: The authorized domain..."
```
原因: 現在のドメイン/ホストが未登録
解決: Firebase → Authentication → Settings で追加
```

### エラー5: ログイン後、すぐにログアウト状態に戻る
```
原因: Firebase ルールが不正
解決: FIREBASE_SETUP.md の ルール設定を確認
```

---

## 🧪 テスト方法

### テスト1: ローカルモードが動くか確認
1. 「📌 ローカルで続ける」をクリック
2. プロジェクト作成 → チャット送信
3. 正常に動作すれば、UI/API は OK

### テスト2: Firebase が初期化されているか確認
```javascript
// ブラウザコンソール（F12）で実行
window.getFirebaseAuth()  // null以外なら初期化OK
window.getFirebaseDb()    // null以外なら初期化OK
```

### テスト3: Google ログイン ポップアップが出るか確認
```javascript
// ブラウザコンソール（F12）で実行
const auth = window.getFirebaseAuth();
const provider = new firebase.auth.GoogleAuthProvider();
auth.signInWithPopup(provider);  // ポップアップが出るはず
```

---

## 📱 モバイル対応

### iOS Safari
1. ホーム画面に追加（推奨）
2. ポップアップブロッカーをオフ
3. Safari 設定 → Cookie 有効

### Android Chrome
1. ポップアップブロッカーをオフ
2. Cookie を有効
3. 標準ブラウザの使用推奨

---

## 💡 上級者向け

### 手動でデバッグする場合
```javascript
// components.js の handleGoogleLogin 関数内で追加
console.log('1. Firebase ready?', window.getFirebaseAuth() ? '✅' : '❌');
console.log('2. Auth provider created');
console.log('3. signInWithPopup called');

// Firebase コンソールでユーザーが作成されたか確認
// Authentication → ユーザーを確認
```

### Firebase セキュリティルール確認
```json
// Realtime Database → Rules で確認
"users": {
  "$uid": {
    ".read": "$uid === auth.uid",
    ".write": "$uid === auth.uid"
  }
}
```

---

## 📞 解決しない場合

### 1. コンソールエラーを確認
```
F12 キー → Console タブ
赤いテキストをコピーして確認
```

### 2. Firebase コンソール確認
```
https://console.firebase.google.com
← Authentication → ユーザーが作成されたか
← Realtime Database → Rules が正しいか
← Settings → API キーが正しいか
```

### 3. サイトのコンソール出力確認
```javascript
// 正常時の出力例
✅ Firebase initialized
Auth state changed: user@example.com
ログイン成功: user@example.com
```

---

## ✨ 成功時の確認

ログイン成功すると以下のようになります：

```
ログイン前:
[🔐 Google でログイン] [📌 ローカルで続ける]

ログイン後:
[📁 プロジェクト] 👤 user@example.com
[⚙️] ← ここをクリック → Firebase: user@example.com (クラウド同期中)
```

---

**Version:** v0.06.05 修正版  
**修正内容:** signInWithRedirect → signInWithPopup  
**Last Updated:** 2026-06-10
