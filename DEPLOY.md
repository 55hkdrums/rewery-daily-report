# 🍺 醸造日報アプリ - デプロイガイド

このガイドに沿って操作すると、スマホからいつでもどこでもアクセスできるようになります。
**必要な時間: 約15分**

---

## Step 1: Turso（データベース）のセットアップ

### 1-1. アカウント作成
1. ブラウザで **https://turso.tech** を開く
2. 「Get Started」をクリック
3. Googleアカウントまたはメールアドレスで登録（無料）

### 1-2. データベース作成
1. ログイン後、ダッシュボードで「**Create Database**」をクリック
2. データベース名: `brewery-report`
3. リージョン: `Tokyo (nrt)` を選択（最も近い場所）
4. 「Create Database」をクリック

### 1-3. 接続情報を取得
1. 作成したデータベースをクリック
2. 以下の2つの値をメモしてください:
   - **Database URL**: `libsql://brewery-report-xxxx.turso.io` のような文字列
   - **Auth Token**: 「Generate Token」ボタンで生成（Read & Writeを選択）

---

## Step 2: GitHub（コード管理）のセットアップ

### 2-1. GitHubアカウント（未登録の場合）
1. **https://github.com** でアカウントを作成（無料）

### 2-2. リポジトリ作成 & コード アップロード
1. GitHubにログイン
2. 右上の「**+**」→「**New repository**」をクリック
3. Repository name: `brewery-daily-report`
4. 「Public」を選択
5. 「Create repository」をクリック

### 2-3. コードをプッシュ
パソコンのコマンドプロンプト（cmd）で以下を実行:

```bash
cd "C:\Users\55hkd\OneDrive\Desktop\Anti Graviti\brewery-daily-report"
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/あなたのユーザー名/brewery-daily-report.git
git push -u origin main
```

> ⚠️ `あなたのユーザー名` は実際のGitHubユーザー名に置き換えてください

---

## Step 3: Render（ホスティング）のセットアップ

### 3-1. アカウント作成
1. **https://render.com** を開く
2. 「Get Started for Free」からGitHubアカウントで登録

### 3-2. Webサービス作成
1. ダッシュボードで「**New +**」→「**Web Service**」をクリック
2. 「Build and deploy from a Git repository」を選択
3. 先ほど作成したGitHubリポジトリ `brewery-daily-report` を選択
4. 以下を設定:
   - **Name**: `brewery-daily-report`（好きな名前でOK）
   - **Region**: `Singapore` (Asia)
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type**: `Free` を選択

### 3-3. 環境変数の設定
「**Environment Variables**」セクションで以下を追加:

| Key | Value |
|-----|-------|
| `TURSO_DATABASE_URL` | Step 1-3でメモしたDatabase URL |
| `TURSO_AUTH_TOKEN` | Step 1-3でメモしたAuth Token |

### 3-4. デプロイ
1. 「**Create Web Service**」をクリック
2. ビルドが開始されます（約2〜3分）
3. 完了すると、以下のようなURLが発行されます:

```
https://brewery-daily-report.onrender.com
```

---

## 🎉 完了！

上記のURLをスマホのブラウザで開けば、**Wi-Fi・データ通信問わず、どこからでも**アプリにアクセスできます。

### スマホのホーム画面に追加（推奨）
- **iPhone**: Safari でURLを開く → 共有ボタン → 「ホーム画面に追加」
- **Android**: Chrome でURLを開く → メニュー → 「ホーム画面に追加」

これでネイティブアプリのように使えます！

---

## 注意事項

| 項目 | 内容 |
|------|------|
| **無料プランの制限** | 15分間アクセスがないとスリープします。次のアクセス時に約30秒で復帰します |
| **データ** | Tursoクラウドに保存されるため、サーバー再起動でもデータは保持されます |
| **コスト** | Turso無料枠: 9GB / Render無料枠: 750時間/月。通常利用では十分です |
