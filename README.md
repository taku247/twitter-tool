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

### Vercel Cron Jobs制限

#### プラン別制限
- **Hobbyプラン（無料）**: **2個まで**
  - 1日1回の実行のみ
  - 時間単位の精度のみ（分単位不可）
  
- **Pro・Enterpriseプラン**: **20個まで**
  - 分単位の精度で実行可能
  - より柔軟なスケジューリング

#### 料金
- **Cron Job自体**: ベータ期間中は無料（正式版では有料予定）
- **実行される関数**: 標準の関数料金が適用
  - 関数の実行回数
  - 実行時間（GB-hours）
  - データ転送量

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

## License

MIT
