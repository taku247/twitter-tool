# Twitter Analytics Tool

AI-powered Twitter analytics dashboard using TwitterAPI.io and OpenAI ChatGPT.

## Features

- 🔍 **Advanced Tweet Search** with filters (language, date, RT exclusion)
- 📎 **Manual Tweet Addition** via URL input  
- 🤖 **AI Analysis** powered by ChatGPT
- 🕒 **JST Timezone Support** for Japanese users
- 🔗 **Click-to-View** tweets directly from the dashboard

## Tech Stack

- **Backend**: Node.js, Express.js
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **APIs**: TwitterAPI.io, OpenAI GPT-4
- **Deployment**: Vercel

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
- `POST /api/twitter/search` - Advanced tweet search
- `POST /api/twitter/tweet` - Single tweet by ID
- `POST /api/twitter/list` - List tweets

### AI Analysis
- `POST /api/openai/test` - ChatGPT analysis
- `POST /api/twitter/summarize` - Tweet summarization

### Utilities
- `GET /api/health` - Health check

## Deployment

This application is deployed on Vercel with automatic deployment configured.

### Production URL
🌐 **https://twitter-tool-eight.vercel.app**

### Deployment Workflow

#### Automatic Deployment
- **main branch** → Production environment (twitter-tool-eight.vercel.app)
- **Other branches** → Preview environments (temporary URLs)

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
- **Vercel Dashboard**: https://vercel.com/dashboard → twitter-tool → Deployments tab
- **GitHub PR Comments**: Preview URLs posted automatically
- **GitHub Commit Status**: Check results with deployment links

### Configuration
- `vercel.json` - Vercel deployment configuration
- Environment variables setup in Vercel dashboard
- Node.js runtime support

## ngrokを使用したWebhook開発

### 事前準備

1. **ngrokのインストール**
   ```bash
   # Homebrewを使用（推奨）
   brew install ngrok
   
   # または https://ngrok.com/download からダウンロード
   ```

2. **ngrok認証トークンの設定**
   ```bash
   ngrok config add-authtoken YOUR_AUTHTOKEN
   ```

### 開発環境のセットアップ

1. **開発サーバーの起動**
   ```bash
   npm run dev
   ```
   サーバーは `http://localhost:3002` で起動します

2. **ngrokトンネルの開始**（別ターミナルで実行）
   ```bash
   ngrok http 3002
   ```
   
3. **ngrok URLの取得**
   出力から転送URLを確認してください：
   ```
   Forwarding  https://abc123.ngrok-free.app -> http://localhost:3002
   ```

### Webhook機能のテスト

#### Webhookエンドポイントのテスト
```bash
curl -X POST https://YOUR_NGROK_URL.ngrok-free.app/webhook/test \
  -H "Content-Type: application/json" \
  -d '{"test": "hello from ngrok"}'
```

期待されるレスポンス：
```json
{"success":true,"message":"Test webhook received"}
```

#### ngrokトラフィックの監視
- ngrok Web インターface を開く：`http://127.0.0.1:4040`
- リアルタイムでリクエストとレスポンスを確認

### リアルタイム監視ダッシュボード

Twitterリアルタイム監視ダッシュボードへのアクセス：
- **ローカル**: http://localhost:3002/realtime-monitor.html
- **ngrok**: https://YOUR_NGROK_URL.ngrok-free.app/realtime-monitor.html

### 利用可能なWebhookエンドポイント

1. **テスト用Webhook**
   ```
   POST /webhook/test
   ```
   Webhook接続のテスト用

2. **Twitter Webhook**
   ```
   POST /webhook/twitter
   ```
   TwitterAPI.ioからのTwitterデータ受信用

### TwitterAPI.io Webhook設定

TwitterAPI.ioのWebhook設定には以下のURLを使用してください：
```
https://YOUR_NGROK_URL.ngrok-free.app/webhook/twitter
```

### リアルタイム監視の仕組み

リアルタイムツイート監視は**2段階の仕組み**で動作します：

#### Step 1: Webhookルール設定（ツイート取得）
1. **ポーリング間隔を選択**
   - 3秒（最速・高コスト）
   - 10秒（推奨）
   - 30秒（バランス）
   - 60秒（低コスト）
   - 120秒（最低コスト）

2. **Webhookルール設定**: `🌐 Webhookルール設定`
   - TwitterAPI.ioにフィルタールールを作成・有効化（自動）
   - 指定したポーリング間隔でツイートをチェック
   - TwitterAPI.io → サーバーへのWebhook送信開始

#### Step 2: WebSocket接続（リアルタイム表示）
3. **WebSocket監視開始**: `📡 WebSocket監視開始`
   - ブラウザとサーバー間でWebSocket接続確立
   - Webhookで受信したツイートを即座にブラウザに転送
   - 「📨 リアルタイムツイート」エリアに表示

#### 動作フロー
```
Twitter → TwitterAPI.io → Webhook → サーバー → WebSocket → ブラウザ表示
         (ポーリング間隔)  (即座)    (即座)     (即座)
```

**重要**: 両方の設定が必要です
- **Webhookのみ**: ツイート取得はできるがサーバーログのみ表示
- **WebSocketのみ**: ブラウザ接続はできるがツイートが取得されない

#### デバッグ機能
- `🛠️ RESTルール追加テスト`: REST API機能のテスト
- `📋 ルール一覧確認`: 既存フィルタールールの確認
- `🔗 接続状態確認`: 接続状態の確認
- `🗑️ ログクリア`: デバッグログのクリア

### よくある問題

#### ngrok接続問題
「endpoint is offline」と表示される場合：
1. ポート3002でサーバーが起動していることを確認
2. ngrokトンネルがアクティブか確認
3. 正しいngrok URLを使用（`.ngrok-free.app`で終わる）

#### Webhookでデータが受信されない場合
1. TwitterAPI.io webhook URL設定を確認
2. Webhookルールが有効化されているか確認（`is_effect: 1`）
3. ngrok Web インターフェースで受信リクエストを監視

### 開発ワークフロー

1. **開発環境の起動**
   ```bash
   # ターミナル1: サーバー起動
   npm run dev
   
   # ターミナル2: ngrok起動
   ngrok http 3002
   ```

2. **Webhookの設定**
   - ngrok URLをコピー
   - TwitterAPI.io webhookルールを設定
   - curlコマンドでテスト

3. **リアルタイムアクティビティの監視**
   - リアルタイムダッシュボードを開く
   - 対象Twitterアカウントの監視を開始
   - Webhookデータ受信を確認

## 本番環境での運用

### Webhook URL設定

**⚠️ 重要**: ngrokは開発・テスト環境専用です。本番環境では専用のWebhook URLを用意してください。

#### 本番環境での要件

1. **固定ドメイン**: ngrokの一時的なURLではなく、固定のドメインが必要
   ```
   例: https://your-domain.com/webhook/twitter
   ```

2. **HTTPS必須**: TwitterAPI.ioはHTTPS接続のみサポート
   - SSL証明書が正しく設定されていること
   - Let's Encryptやクラウドプロバイダーの証明書を使用

3. **本番デプロイ**: Vercel、Heroku、AWS、GCPなどにデプロイ
   ```bash
   # Vercelの場合
   vercel --prod
   
   # 本番URL例
   https://twitter-tool-eight.vercel.app/webhook/twitter
   ```

#### コード実装について

**重要**: 既存の`server.js`がローカルとVercel本番環境の両方で動作します。**追加のサーバーレス関数実装は不要**です。

##### 動作方式の違い
- **ローカル開発**: Express.jsサーバーとしてポート3002で起動
- **Vercel本番**: @vercel/nodeランタイムでサーバーレス関数として実行

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
- **ローカル**: `npm run dev` → Express.jsサーバー
- **Vercel**: 自動的にサーバーレス関数に変換

##### WebSocket・リアルタイム機能

**重要**: Vercelはサーバーレス環境のため、永続的なWebSocket接続をサポートしていません。

- **ローカル開発**: WebSocketで双方向リアルタイム通信
- **Vercel本番**: Server-Sent Events (SSE) で一方向リアルタイム通信

##### 実装の違い

| 機能 | ローカル環境 | Vercel本番 |
|------|-------------|------------|
| リアルタイム通信 | WebSocket | Server-Sent Events |
| 接続方式 | `ws://localhost:3002` | `/api/realtime/tweets` |
| 双方向通信 | ✅ | ❌ (SSEは一方向) |
| 自動フォールバック | 自動検出・切り替え | 自動検出・切り替え |

##### 環境検出ロジック
```javascript
// フロントエンドで自動検出
const isVercel = window.location.hostname.includes('vercel.app');
if (isVercel) {
    // SSE使用
    connectSSE(username);
} else {
    // WebSocket使用  
    connectWebSocket(username);
}
```

#### TwitterAPI.io設定更新

本番環境では以下のWebhook URLを設定：
```
https://your-production-domain.com/webhook/twitter
```

#### 環境変数の設定

本番環境の環境変数も適切に設定してください：
```bash
TWITTER_API_KEY=your_production_api_key
OPENAI_API_KEY=your_production_openai_key
```

#### セキュリティ考慮事項

- Webhook署名検証の実装（推奨）
- Rate limiting対策
- エラーハンドリングの強化
- ログ監視の設定

## License

MIT