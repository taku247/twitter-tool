# Twitter Analytics Tool

AI-powered Twitter analytics dashboard using TwitterAPI.io and OpenAI ChatGPT.

https://twitterapi.io/tweet-filter-rules

## Features

-   🔍 **Advanced Tweet Search** with filters (language, date, RT exclusion)
-   📎 **Manual Tweet Addition** via URL input
-   🤖 **AI Analysis** powered by ChatGPT
-   🕒 **JST Timezone Support** for Japanese users
-   🔗 **Click-to-View** tweets directly from the dashboard

## Tech Stack

-   **Backend**: Node.js, Express.js
-   **Frontend**: Vanilla HTML/CSS/JavaScript
-   **APIs**: TwitterAPI.io, OpenAI GPT-4
-   **Deployment**: Vercel

## Environment Variables

Create a `.env` file with:

```
TWITTER_API_KEY=your_twitterapi_io_key
OPENAI_API_KEY=your_openai_api_key
```

## Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Production start
npm start
```

## API Endpoints

### Twitter

-   `POST /api/twitter/search` - Advanced tweet search
-   `POST /api/twitter/tweet` - Single tweet by ID
-   `POST /api/twitter/list` - List tweets

### AI Analysis

-   `POST /api/openai/test` - ChatGPT analysis
-   `POST /api/twitter/summarize` - Tweet summarization

### Utilities

-   `GET /api/health` - Health check

## Deployment

This application is deployed on Vercel with automatic deployment configured.

### Production URL

🌐 **https://twitter-tool-eight.vercel.app**

### Deployment Workflow

#### Automatic Deployment

-   **main branch** → Production environment (twitter-tool-eight.vercel.app)
-   **Other branches** → Preview environments (temporary URLs)

#### Development Process

1. **Create feature branch**

    ```bash
    git checkout -b feature/your-feature
    # Make changes
    git push origin feature/your-feature
    ```

    → Creates preview deployment with unique URL

2. **Create Pull Request**

    - Vercel automatically comments with preview URL
    - Test changes in preview environment

3. **Merge to main**
    ```bash
    git checkout main
    git merge feature/your-feature
    git push origin main
    ```
    → Automatically deploys to production

#### Viewing Deployments

-   **Vercel Dashboard**: https://vercel.com/dashboard → twitter-tool → Deployments tab
-   **GitHub PR Comments**: Preview URLs posted automatically
-   **GitHub Commit Status**: Check results with deployment links

### Configuration

-   `vercel.json` - Vercel deployment configuration
-   Environment variables setup in Vercel dashboard
-   Node.js runtime support

## ngrok を使用した Webhook 開発

### 事前準備

1. **ngrok のインストール**

    ```bash
    # Homebrewを使用（推奨）
    brew install ngrok

    # または https://ngrok.com/download からダウンロード
    ```

2. **ngrok 認証トークンの設定**
    ```bash
    ngrok config add-authtoken YOUR_AUTHTOKEN
    ```

### 開発環境のセットアップ

1. **開発サーバーの起動**

    ```bash
    npm run dev
    ```

    サーバーは `http://localhost:3002` で起動します

2. **ngrok トンネルの開始**（別ターミナルで実行）
    ```bash
    ngrok http 3002
    ```
3. **ngrok URL の取得**
   出力から転送 URL を確認してください：
    ```
    Forwarding  https://abc123.ngrok-free.app -> http://localhost:3002
    ```

### Webhook 機能のテスト

#### Webhook エンドポイントのテスト

```bash
curl -X POST https://YOUR_NGROK_URL.ngrok-free.app/webhook/test \
  -H "Content-Type: application/json" \
  -d '{"test": "hello from ngrok"}'
```

期待されるレスポンス：

```json
{ "success": true, "message": "Test webhook received" }
```

#### ngrok トラフィックの監視

-   ngrok Web インター face を開く：`http://127.0.0.1:4040`
-   リアルタイムでリクエストとレスポンスを確認

### リアルタイム監視ダッシュボード

Twitter リアルタイム監視ダッシュボードへのアクセス：

-   **ローカル**: http://localhost:3002/realtime-monitor.html
-   **ngrok**: https://YOUR_NGROK_URL.ngrok-free.app/realtime-monitor.html

### 利用可能な Webhook エンドポイント

1. **テスト用 Webhook**

    ```
    POST /webhook/test
    ```

    Webhook 接続のテスト用

2. **Twitter Webhook**
    ```
    POST /webhook/twitter
    ```
    TwitterAPI.io からの Twitter データ受信用

### TwitterAPI.io Webhook 設定

TwitterAPI.io の Webhook 設定には以下の URL を使用してください：

```
https://YOUR_NGROK_URL.ngrok-free.app/webhook/twitter
```

### リアルタイム監視の仕組み

リアルタイムツイート監視は**2 段階の仕組み**で動作します：

#### Step 1: Webhook ルール設定（ツイート取得）

1. **ポーリング間隔を選択**

    - 3 秒（最速・高コスト）
    - 10 秒（推奨）
    - 30 秒（バランス）
    - 60 秒（低コスト）
    - 120 秒（最低コスト）

2. **Webhook ルール設定**: `🌐 Webhookルール設定`
    - TwitterAPI.io にフィルタールールを作成・有効化（自動）
    - 指定したポーリング間隔でツイートをチェック
    - TwitterAPI.io → サーバーへの Webhook 送信開始

#### Step 2: WebSocket 接続（リアルタイム表示）

3. **WebSocket 監視開始**: `📡 WebSocket監視開始`
    - ブラウザとサーバー間で WebSocket 接続確立
    - Webhook で受信したツイートを即座にブラウザに転送
    - 「📨 リアルタイムツイート」エリアに表示

#### 動作フロー

```
Twitter → TwitterAPI.io → Webhook → サーバー → WebSocket → ブラウザ表示
         (ポーリング間隔)  (即座)    (即座)     (即座)
```

**重要**: 両方の設定が必要です

-   **Webhook のみ**: ツイート取得はできるがサーバーログのみ表示
-   **WebSocket のみ**: ブラウザ接続はできるがツイートが取得されない

#### デバッグ機能

-   `🛠️ RESTルール追加テスト`: REST API 機能のテスト
-   `📋 ルール一覧確認`: 既存フィルタールールの確認
-   `🔗 接続状態確認`: 接続状態の確認
-   `🗑️ ログクリア`: デバッグログのクリア

### よくある問題

#### ngrok 接続問題

「endpoint is offline」と表示される場合：

1. ポート 3002 でサーバーが起動していることを確認
2. ngrok トンネルがアクティブか確認
3. 正しい ngrok URL を使用（`.ngrok-free.app`で終わる）

#### Webhook でデータが受信されない場合

1. TwitterAPI.io webhook URL 設定を確認
2. Webhook ルールが有効化されているか確認（`is_effect: 1`）
3. ngrok Web インターフェースで受信リクエストを監視

### 開発ワークフロー

1. **開発環境の起動**

    ```bash
    # ターミナル1: サーバー起動
    npm run dev

    # ターミナル2: ngrok起動
    ngrok http 3002
    ```

2. **Webhook の設定**

    - ngrok URL をコピー
    - TwitterAPI.io webhook ルールを設定
    - curl コマンドでテスト

3. **リアルタイムアクティビティの監視**
    - リアルタイムダッシュボードを開く
    - 対象 Twitter アカウントの監視を開始
    - Webhook データ受信を確認

## 📋 変更履歴・重要な更新

### v2.0.0 - Vercel 対応リアルタイム監視システム

**2024 年更新**: WebSocket から軽量ポーリング方式への移行により、Vercel 本番環境でのリアルタイム監視を実現。

#### 主要変更点

1. **環境別アーキテクチャ**

    - **ローカル**: WebSocket（即座応答）
    - **Vercel**: 軽量ポーリング（3 秒間隔）

2. **自動環境検出**

    - ホスト名による自動判定
    - シームレスな機能切り替え

3. **最適化されたポーリング**

    - 3 秒間隔で実用的なリアルタイム体験
    - 無料プランで月 28 時間使用可能

4. **ユーザー確認フロー**

    - Twitter アカウントのツイートプレビュー
    - 確認後に Webhook ルール設定

5. **監視状態の詳細表示**
    - アクティブな Webhook ルール一覧
    - 各ルールの TwitterID とポーリング間隔
    - リアルタイム接続状態

#### 技術的改善

-   **サーバーレス対応**: Vercel 環境での完全動作
-   **エラーハンドリング**: 接続失敗時の自動フォールバック
-   **軽量通信**: HTTP ポーリングによる安定したデータ転送
-   **レスポンシブ UI**: サイドパネル式設定画面

#### 互換性

-   **既存機能**: 100%維持
-   **API**: 下位互換性確保
-   **設定**: 自動マイグレーション

## 本番環境での運用

### Webhook URL 設定

**⚠️ 重要**: ngrok は開発・テスト環境専用です。本番環境では専用の Webhook URL を用意してください。

#### 本番環境での要件

1. **固定ドメイン**: ngrok の一時的な URL ではなく、固定のドメインが必要

    ```
    例: https://your-domain.com/webhook/twitter
    ```

2. **HTTPS 必須**: TwitterAPI.io は HTTPS 接続のみサポート

    - SSL 証明書が正しく設定されていること
    - Let's Encrypt やクラウドプロバイダーの証明書を使用

3. **本番デプロイ**: Vercel、Heroku、AWS、GCP などにデプロイ

    ```bash
    # Vercelの場合
    vercel --prod

    # 本番URL例
    https://twitter-tool-eight.vercel.app/webhook/twitter
    ```

#### コード実装について

**重要**: 既存の`server.js`がローカルと Vercel 本番環境の両方で動作します。**追加のサーバーレス関数実装は不要**です。

##### 動作方式の違い

-   **ローカル開発**: Express.js サーバーとしてポート 3002 で起動
-   **Vercel 本番**: @vercel/node ランタイムでサーバーレス関数として実行

##### 設定ファイル（vercel.json）

```json
{
    "version": 2,
    "builds": [
        {
            "src": "server.js",
            "use": "@vercel/node"
        }
    ],
    "routes": [
        {
            "src": "/(.*)",
            "dest": "/server.js"
        }
    ]
}
```

この設定により、同一の`server.js`ファイルが：

-   **ローカル**: `npm run dev` → Express.js サーバー
-   **Vercel**: 自動的にサーバーレス関数に変換

##### WebSocket・リアルタイム機能

**重要**: Vercel はサーバーレス環境のため、WebSocket や SSE などの永続的接続をサポートしていません。

-   **ローカル開発**: WebSocket で双方向リアルタイム通信
-   **Vercel 本番**: HTTP ポーリングでリアルタイム風通信

##### 実装の違い

| 機能             | ローカル環境          | Vercel 本番            |
| ---------------- | --------------------- | ---------------------- |
| リアルタイム通信 | WebSocket             | HTTP ポーリング        |
| 接続方式         | `ws://localhost:3002` | `/api/realtime/latest` |
| 更新間隔         | 即座                  | 3 秒間隔               |
| サーバー負荷     | 低                    | 低                     |
| 双方向通信       | ✅                    | ✅ (HTTP API 併用)     |

##### 技術詳細

**ローカル環境（WebSocket）:**

```javascript
const ws = new WebSocket("ws://localhost:3002");
ws.onmessage = (event) => {
    const tweet = JSON.parse(event.data);
    displayTweet(tweet); // 即座に表示
};
```

**Vercel 環境（軽量ポーリング）:**

```javascript
// 3秒間隔でサーバーから最新ツイートを取得
setInterval(async () => {
    const response = await fetch("/api/realtime/latest");
    const data = await response.json();
    displayNewTweets(data.latestTweets);
}, 3000); // 実用的なリアルタイム体験
```

##### 軽量ポーリングの利点

**ポーリングの特徴:**

-   **遅延**: 最大 3 秒（実用的なリアルタイム体験）
-   **接続**: 軽量な HTTP リクエスト
-   **Vercel 対応**: サーバーレス環境で完全サポート
-   **安定性**: 接続切断の心配なし

#### Vercel プラン要件

##### ポーリング使用時の制限

| 使用パターン | 月間使用時間 | API 呼び出し数   | 必要プラン        |
| ------------ | ------------ | ---------------- | ----------------- |
| **軽量使用** | 10-20 時間   | 12,000-24,000 回 | Hobby (無料) ✅   |
| **標準使用** | 20-28 時間   | 24,000-33,600 回 | Hobby (無料) ✅   |
| **重量使用** | 28-50 時間   | 33,600-60,000 回 | Pro ($20/月) 推奨 |
| **連続使用** | 50 時間+     | 60,000 回+       | Pro ($20/月) 必須 |

**3 秒間隔の使用量計算:**

-   1 分間 = 20 回の API 呼び出し
-   1 時間 = 1,200 回の API 呼び出し
-   無料プラン上限（100,000 回）= 約 83 時間分

##### 環境検出ロジック

```javascript
// フロントエンドで自動検出・切り替え
const isVercel = window.location.hostname.includes("vercel.app");
if (isVercel) {
    connectPolling(); // ポーリング方式
} else {
    connectWebSocket(); // WebSocket方式
}
```

#### TwitterAPI.io 設定更新

本番環境では以下の Webhook URL を設定：

```
https://your-production-domain.com/webhook/twitter
```

#### 環境変数の設定

本番環境の環境変数も適切に設定してください：

```bash
TWITTER_API_KEY=your_production_api_key
OPENAI_API_KEY=your_production_openai_key
```

#### Vercel 認証設定（重要）

**Webhook 機能を使用する場合、Vercel 認証を無効化する必要があります：**

1. **Vercel Dashboard**にアクセス

    - https://vercel.com/dashboard

2. **プロジェクト選択**

    - `twitter-tool` プロジェクトをクリック

3. **Settings タブ**をクリック

4. **Security セクション**で以下の設定を確認
    - "Vercel Authentication" → OFF
    - "Password Protection" → OFF
    - "Deployment Protection" → OFF

**理由**: TwitterAPI.io からの Webhook リクエストは認証なしで送信されるため、Vercel 認証が有効だと Webhook が失敗します。

**セキュリティ補完策**:

```javascript
// server.jsでWebhook署名検証を実装（推奨）
app.post("/webhook/twitter", (req, res) => {
    const signature = req.headers["x-signature"];
    if (!verifyWebhookSignature(req.body, signature)) {
        return res.status(401).json({ error: "Invalid signature" });
    }
    // 処理続行
});
```

#### セキュリティ考慮事項

-   Webhook 署名検証の実装（推奨）
-   Rate limiting 対策
-   エラーハンドリングの強化
-   ログ監視の設定

## Vercel Cron Jobs（定期実行）

### 概要

Vercel Cron Jobsを使用して、TwitterAPI.ioのリスト関連APIを定期実行できます。

### 利用可能なエンドポイント

#### TwitterAPI.io リスト機能
- **リストメンバー取得**: `/twitter/list/members`
  - リストのメンバー一覧を取得
  - 1ページあたり20メンバー
  - カーソルベースのページネーション

- **リストツイート取得**: `/twitter/list/tweets`
  - リストIDでツイート取得
  - 1ページあたり20ツイート
  - ツイート時間の降順でソート

- **リストフォロワー取得**: `/twitter/list/followers`
  - リストのフォロワー一覧
  - 1ページあたり20フォロワー

### Vercel Cron Jobs制限（2024-2025年）

#### プラン別制限・料金
- **Hobbyプラン（無料）**: 
  - **Cronジョブ数**: **2個まで**
  - **頻度制限**: **1時間単位のみ**（分単位不可）
  - **Function実行回数**: **100,000回/月**
  - **超過時**: サービス停止（リセット待ち）
  
- **Proプラン（$20/月）**: 
  - **Cronジョブ数**: **40個まで**
  - **頻度制限**: **分単位対応**
  - **Function実行回数**: **1,000,000回/月**
  - **超過料金**: $0.60/100万回

- **Enterpriseプラン**: 
  - **Cronジョブ数**: **100個まで**
  - **制限**: カスタム設定

#### 実行頻度と使用量（Proプラン）
| 実行間隔 | 月間実行回数 | 使用率 | 追加料金 |
|----------|--------------|--------|----------|
| 15分ごと | 2,880回 | 0.29% | $0 |
| 10分ごと | 4,320回 | 0.43% | $0 |
| 5分ごと | 8,640回 | 0.86% | $0 |
| 1分ごと | 43,200回 | 4.32% | $0 |

**結論**: Proプランなら15分間隔でも使用率0.3%で十分実用的

### 実装例

#### 1. vercel.json設定
```json
{
  "version": 2,
  "crons": [
    {
      "path": "/api/cron/fetch-list-tweets",
      "schedule": "0 */6 * * *"
    },
    {
      "path": "/api/cron/fetch-list-members", 
      "schedule": "0 0 * * *"
    }
  ],
  "builds": [
    {
      "src": "server.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "/server.js"
    }
  ]
}
```

#### 2. Cron Job関数実装
```javascript
// /api/cron/fetch-list-tweets.js
export default async function handler(req, res) {
  // セキュリティチェック
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    // TwitterAPI.ioでリストツイート取得
    const response = await fetch(`https://api.twitterapi.io/twitter/list/tweets?list_id=123`, {
      headers: {
        'Authorization': `Bearer ${process.env.TWITTER_API_KEY}`
      }
    });
    
    const data = await response.json();
    
    // データ処理・保存
    // ...
    
    res.json({ success: true, count: data.data?.length || 0 });
  } catch (error) {
    console.error('Cron job error:', error);
    res.status(500).json({ error: 'Failed to fetch tweets' });
  }
}
```

#### 3. セキュリティ設定
```bash
# Vercel環境変数に追加
CRON_SECRET=your-random-secret-string-16chars+
TWITTER_API_KEY=your-twitterapi-io-key
```

### スケジュール例

#### 複数リスト監視
```json
{
  "crons": [
    {"path": "/api/cron/list-tech", "schedule": "0 */6 * * *"},
    {"path": "/api/cron/list-crypto", "schedule": "30 */6 * * *"},
    {"path": "/api/cron/list-news", "schedule": "0 */8 * * *"}
  ]
}
```

#### 制限回避策
- **1つのジョブで複数処理**: 単一エンドポイントで複数リストを処理
- **条件分岐**: 時間帯により処理を分ける

### 代替手段

#### 1. 外部Cronサービス
- **GitHub Actions**: 無料枠あり
- **Cron-job.org**: 外部HTTP cronサービス
- **Uptime Robot**: 監視+cron機能

#### 2. Grok API連携（今後）
- **xAI Grok API**: リアルタイムX(Twitter)データアクセス
- **制限**: 現在は直接的なX検索機能なし
- **回避策**: X API v2 + Grok API組み合わせ

### 注意点

- **本番環境のみ実行**: プレビューデプロイでは実行されない
- **無効化したジョブもカウント**: 削除しない限り制限数に含まれる
- **タイムアウト制限**: Serverless/Edge Functionと同じ制限

## 🚀 Twitter List Scheduler（Twitterリスト定期取得システム）

### 📊 **システム概要**

**Firestore対応の本格的なTwitterリスト監視システム**を実装しました。汎用Cronタスクエンジン上で動作し、リストを登録して定期的にツイートを収集する機能です。

### 🏗️ **アーキテクチャ（最新版）**

#### **Firestoreベースの永続化システム**
```
汎用Cronエンジン
├── cron_tasks (タスク管理マスター)
├── twitter_lists (リスト設定)  
├── collected_tweets (収集ツイート)
└── cron_executions (実行ログ)
```

#### **実行フロー**
```
vercel.json (15分ごと実行)
    ↓
/api/cron/universal-executor
    ↓
cron_tasks (アクティブタスク取得)
    ↓
個別頻度チェック + 時間範囲指定取得
    ↓
TwitterAPI.io (sinceTime/untilTime)
    ↓
重複防止フィルタ (3重チェック)
    ↓
collected_tweets (永続保存)
    ↓
メタデータ更新 + 実行ログ記録
```

### 利用可能な機能

#### 📋 List Scheduler UI
- **アクセス**: `http://localhost:3002/list-scheduler.html` (ローカル)
- **アクセス**: `https://your-app.vercel.app/list-scheduler.html` (本番)

#### 🔧 主要機能
1. **リスト登録**
   - TwitterリストURLを入力（自動でリストID抽出）
   - 頻度選択（30分・1時間・2時間・6時間・12時間・24時間）
   - リスト名設定（任意）

2. **ツイート自動取得（最新実装）**
   - TwitterAPI.ioの`sinceTime`/`untilTime`パラメータで効率的取得
   - 3分マージンでの確実な増分取得
   - 3重重複防止（時間フィルタ + ID比較 + DB重複チェック）
   - Firestoreに永続保存

3. **要約機能**
   - **3つの要約タイプ**:
     - `brief`: 簡潔要約（3-5行）
     - `detailed`: 詳細分析
     - `insights`: 洞察・トレンド分析
   - 要約後のデータ自動削除オプション

4. **統計・管理**
   - リアルタイム統計表示
   - リスト有効/無効切り替え
   - 手動ツイート取得機能

### 🗄️ **Firestoreデータベーススキーマ**

#### **cron_tasks (タスク管理マスター)**
```javascript
{
    taskId: "task-1704110400-abc123",
    taskType: "twitter_list",
    name: "AI関連リスト - 定期取得", 
    description: "AI関連のツイートを60分ごとに取得",
    frequency: 60,                    // 実行頻度（分）
    active: true,                     // 有効/無効
    createdAt: "2024-01-01T12:00:00Z",
    lastExecuted: "2024-01-01T12:00:00Z",
    nextExecution: "2024-01-01T13:00:00Z",
    executionCount: 125,              // 実行回数
    successCount: 123,                // 成功回数
    errorCount: 2,                    // エラー回数
    lastError: null,                  // 最新エラー
    config: {
        relatedTableId: "list-1704110400-def456"  // twitter_listsの参照
    }
}
```

#### **twitter_lists (リスト設定)**
```javascript
{
    listId: "list-1704110400-def456",         // 内部管理ID
    twitterListId: "123456789",               // TwitterのリストID
    name: "AI関連の人たち",
    url: "https://twitter.com/i/lists/123456789",
    lastExecuted: "2024-01-01T12:00:00Z",    // 最終実行時刻
    lastTweetId: "1745678901234567890",       // 重複回避用
    tweetCount: 125,                          // 保存済みツイート数
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T12:00:00Z"
}
```

#### **collected_tweets (収集ツイート)**
```javascript
{
    tweetId: "1745678901234567890",           // Twitter固有ID
    sourceType: "twitter_list",               // 収集元タイプ
    sourceId: "list-1704110400-def456",       // twitter_listsのlistId
    taskId: "task-1704110400-abc123",         // 実行タスクID
    text: "AI技術の最新動向について...",      // ツイート本文
    authorId: "987654321",                    // 投稿者ID
    authorName: "ai_researcher",              // 投稿者名
    createdAt: "2024-01-01T10:30:00Z",       // ツイート投稿時刻
    collectedAt: "2024-01-01T12:00:00Z",     // 収集時刻
    data: { ... }                             // 完全なTwitterデータ
}
```

#### **cron_executions (実行ログ)**
```javascript
{
    executionId: "exec-1704110400",
    taskId: "task-1704110400-abc123",
    taskType: "twitter_list",
    startTime: "2024-01-01T12:00:00Z",
    endTime: "2024-01-01T12:02:15Z",
    status: "success",                        // success/error/partial
    newItems: 12,                             // 新規取得ツイート数
    processingTime: 135,                      // 処理時間（秒）
    metadata: {
        sourceId: "list-1704110400-def456",
        totalFetched: 15,                     // API取得総数
        duplicatesSkipped: 3                  // 重複スキップ数
    }
}
```

### 🔌 **API エンドポイント（最新版）**

#### **Cronシステム**
```
POST /api/cron/universal-executor    # 汎用Cron実行エンジン（15分ごと自動実行）
```

#### **リスト管理（Firestore対応）**
```
POST /api/lists/register             # リスト登録（cron_tasks + twitter_lists作成）
GET  /api/lists                     # リスト一覧取得（Firestore統合データ）
DELETE /api/lists/:listId           # リスト削除（関連データ一括削除）
PATCH /api/lists/:listId/toggle     # 有効/無効切り替え
GET  /api/lists/stats               # 統計情報取得
```

#### **ツイート取得・管理**
```
GET  /api/lists/:listId/tweets       # 保存済みツイート取得（collected_tweets）
POST /api/lists/:listId/fetch        # 手動ツイート取得
```

#### **監視・ログ**
```
GET  /api/cron/executions           # 実行履歴取得
GET  /api/cron/tasks                # タスク一覧取得
```

### Vercel Cron Jobs設定

#### 設定済みスケジュール（vercel.json）
```json
{
  "crons": [
    {
      "path": "/api/cron/fetch-list-tweets",
      "schedule": "0 */2 * * *"
    },
    {
      "path": "/api/cron/summarize-lists", 
      "schedule": "0 0 * * *"
    }
  ]
}
```

#### 実行スケジュール
- **ツイート取得**: 2時間ごと（0:00, 2:00, 4:00...）
- **要約実行**: 毎日0時

#### 必要な環境変数
```bash
CRON_SECRET=your-random-secret-16chars-minimum
TWITTER_API_KEY=your-twitterapi-io-key
OPENAI_API_KEY=your-openai-key
```


### 🚀 **マイグレーション・運用ガイド**

#### **既存システムからの移行**
1. **新規リスト**: 自動的にFirestoreシステムで動作
2. **既存リスト**: 後方互換性を維持（段階的移行）
3. **データ移行**: メモリからFirestoreへの自動変換

#### **運用開始手順**
1. **デプロイ**: Vercelに最新コードをプッシュ
2. **確認**: List Schedulerで新規リスト登録テスト
3. **監視**: 15分後にVercelログで実行確認
4. **検証**: Firestoreコンソールでデータ確認

#### **監視・トラブルシューティング**
- **実行ログ**: Vercel Functions → `/api/cron/universal-executor`
- **データ確認**: Firebase Console → `cron_tasks`, `twitter_lists`
- **エラー追跡**: `cron_executions`コレクションで詳細分析

### ~~💡 解決策・改善案~~（**実装完了**）

#### ~~推奨解決策: オプション1（Cron内で頻度チェック）~~（**実装済み**）

**メリット**:
- Hobbyプランでも実装可能（現在の2個のCronジョブ制限内）
- 個別リストの頻度設定が正確に反映される
- API使用量の最適化（不要な実行を回避）

**実装例**:
```javascript
// /api/cron/fetch-list-tweets 内での改善
app.post('/api/cron/fetch-list-tweets', async (req, res) => {
    const activeLists = Array.from(registeredLists.values()).filter(list => list.active);
    
    for (const list of activeLists) {
        const now = new Date();
        const lastUpdated = new Date(list.lastUpdated || 0);
        const intervalMs = list.frequency * 60 * 1000; // 分を秒に変換
        
        // 設定頻度に達した場合のみ実行
        if (now - lastUpdated >= intervalMs) {
            await fetchTweetsForList(list);
            list.lastUpdated = now.toISOString();
        }
    }
});
```

#### 代替案: オプション2（頻度別Cronジョブ）

**制限**:
- **Hobbyプラン**: 2個制限のため実装困難
- **Proプラン**: 40個制限内で部分的に可能

**実装例（Proプラン）**:
```json
{
  "crons": [
    {"path": "/api/cron/fetch-frequent", "schedule": "*/15 * * * *"},
    {"path": "/api/cron/fetch-hourly", "schedule": "0 * * * *"},
    {"path": "/api/cron/fetch-daily", "schedule": "0 0 * * *"}
  ]
}
```

#### 頻度別使用量シミュレーション（Proプラン）

| リスト数 | 設定頻度 | 月間実行回数 | 年間実行回数 | 使用率 |
|----------|----------|--------------|--------------|--------|
| 5リスト | 15分ごと | 14,400回 | 172,800回 | 1.44% |
| 10リスト | 30分ごと | 14,400回 | 172,800回 | 1.44% |
| 20リスト | 1時間ごと | 14,400回 | 172,800回 | 1.44% |

**合計でも使用率4.32%**で、Proプランの制限内で十分運用可能。

### 🗄️ **データベース永続化の問題**

#### 現在のデータ保存状況

| データ種類 | 保存場所 | 永続化 | 問題 |
|------------|----------|--------|------|
| **ツイートデータ** | Firebase Firestore | ✅ 永続化 | なし |
| **リスト登録情報** | メモリ（Map） | ❌ 一時的 | サーバー再起動で消失 |
| **lastUpdated** | メモリ（Map） | ❌ 一時的 | 頻度チェック不可 |
| **tweetCount** | メモリ（Map） | ❌ 一時的 | 統計情報消失 |
| **lastTweetId** | メモリ（Map） | ❌ 一時的 | 重複チェック不可 |

#### Cronタスクでの処理

```javascript
// ✅ Firestoreに保存される
await addDoc(collection(db, 'list-tweets'), {
    listId: list.listId,
    tweetId: tweet.id,
    text: tweet.text,
    // ... ツイートデータ
});

// ❌ メモリのみ（Firestoreに保存されない）
list.lastUpdated = new Date().toISOString();
list.tweetCount = newTweets.length;
list.lastTweetId = newTweets[0].id;
registeredLists.set(list.listId, list); // Map更新のみ
```

#### 使用されるFirestoreコレクション

- **`list-tweets`**: 個別ツイートデータ（✅ 保存済み）
- **`list-summaries`**: AI要約データ（✅ 保存済み）
- **`realtime-tweets`**: リアルタイム監視データ（✅ 保存済み）
- **`registered-lists`**: **❌ 未実装**（リスト登録情報）

#### 問題の影響

1. **サーバー再起動時**: 登録済みリストが全て消失
2. **Vercel デプロイ時**: 新しいインスタンスでリスト情報なし
3. **頻度チェック**: `lastUpdated`が復旧できずCron機能停止
4. **重複チェック**: `lastTweetId`が復旧できず同じツイート再取得

#### 必要な実装

```javascript
// 1. リスト情報をFirestoreに保存
async function saveListToFirestore(list) {
    await setDoc(doc(db, 'registered-lists', list.listId), {
        listId: list.listId,
        name: list.name,
        frequency: list.frequency,
        active: list.active,
        lastUpdated: list.lastUpdated,
        tweetCount: list.tweetCount,
        lastTweetId: list.lastTweetId,
        createdAt: list.createdAt
    });
}

// 2. 起動時にFirestoreからリスト情報を復旧
async function loadListsFromFirestore() {
    const snapshot = await getDocs(collection(db, 'registered-lists'));
    snapshot.forEach(doc => {
        registeredLists.set(doc.id, doc.data());
    });
    console.log(`Loaded ${registeredLists.size} lists from Firestore`);
}
```

### トラブルシューティング

#### 一般的な問題
1. **リスト登録失敗**: TwitterリストIDの確認・API KEY確認
2. **Cronジョブ未実行**: 環境変数設定・プラン制限確認
3. **要約失敗**: OpenAI API KEY確認・ツイート件数確認
4. **リスト消失**: サーバー再起動/デプロイ時にリスト登録情報が失われる
5. **重複ツイート**: `lastTweetId`復旧不可で同じツイートを再取得
6. **統計情報リセット**: `tweetCount`がデプロイごとに0に戻る

#### ログ確認方法
- **ローカル**: コンソールログ
- **Vercel**: Functions → Cron Jobs → Logs

### 使用技術

#### フロントエンド
- Vanilla HTML/CSS/JavaScript
- レスポンシブデザイン

#### バックエンド
- Node.js + Express.js
- TwitterAPI.io（リストツイート取得）
- OpenAI API（要約生成）
- Firebase Firestore（永続化）

#### インフラ
- Vercel（ホスティング + Cron Jobs）
- Serverless Functions

## License

MIT
