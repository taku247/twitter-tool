# Railway Twitter Worker

Railway上で動作するTwitter分析ワーカーサービスです。

## 概要

Vercelの15分タイムアウト制限を回避するため、重い処理をRailway上で実行します。

### 主な機能
- Twitter リスト定期取得処理
- ChatGPT分析機能（Phase 3で実装予定）
- Discord通知機能
- Firebase Firestore連携

### アーキテクチャ
```
Vercel (軽量トリガー) → Railway Worker (重い処理) → Firestore (データ保存)
                                    ↓
                              Discord (通知)
```

## セットアップ

### 1. 依存関係インストール
```bash
npm install
```

### 2. 環境変数設定
`.env.example`を参考に`.env`ファイルを作成してください。

### 3. ローカル開発
```bash
npm run dev
```

### 4. Railway デプロイ
```bash
# Railway CLI インストール
npm install -g @railway/cli

# ログイン
railway login

# プロジェクト作成・デプロイ
railway new twitter-worker
railway deploy
```

## API エンドポイント

### ヘルスチェック
```
GET /health
```

### ワーカー実行
```
POST /api/worker/execute
Authorization: Bearer <WORKER_SECRET>

{
  "type": "scheduled_processing",
  "data": {},
  "requestId": "unique-request-id"
}
```

### AI分析（Phase 3で実装予定）
```
POST /api/worker/analysis
Authorization: Bearer <WORKER_SECRET>

{
  "sourceId": "list-id",
  "analysisType": "daily_summary",
  "notifyDiscord": true
}
```

## 環境変数

| 変数名 | 説明 | 必須 |
|--------|------|------|
| TWITTER_API_KEY | TwitterAPI.io APIキー | ✅ |
| OPENAI_API_KEY | OpenAI APIキー | ✅ |
| FIREBASE_* | Firebase設定 | ✅ |
| WORKER_SECRET | ワーカー認証用シークレット | ✅ |
| DISCORD_WEBHOOK_URL | Discord通知用Webhook URL | ✅ |
| NODE_ENV | 実行環境 | - |
| PORT | サーバーポート | - |

## 実装進捗

### Phase 1: 基盤構築 ✅
- [x] Railway Worker基本実装
- [x] TwitterWorkerクラス実装
- [x] Vercel-Railway通信
- [x] Firebase連携

### Phase 2: Cron移行 (次回)
- [ ] 既存Cron処理の完全移行
- [ ] エラーハンドリング強化
- [ ] 監視・ログ機能

### Phase 3: AI分析 (将来)
- [ ] ChatGPT API統合
- [ ] AI分析エンジン
- [ ] 分析結果UI

### Phase 4: UI統合 (将来)
- [ ] フロントエンド統合
- [ ] 分析結果表示
- [ ] ユーザーインターフェース

## トラブルシューティング

### メモリ使用量が高い場合
```javascript
// Hobbyプラン（512MB）制限監視
const usage = process.memoryUsage();
const memoryMB = usage.heapUsed / 1024 / 1024;
console.log(`Memory usage: ${memoryMB.toFixed(2)}MB`);
```

### Firebase接続エラー
- 環境変数の設定確認
- Firebase プロジェクト設定確認
- ネットワーク接続確認

### Railway Worker認証エラー
- WORKER_SECRET の一致確認
- Authorization ヘッダー確認

## ログ

### 開発時
```bash
railway logs --tail
```

### 本番監視
- Railway Dashboard → Service → Logs
- Discord通知による実行結果確認

## コスト試算

### Railway Hobby プラン ($5/月)
- 制限: 500時間/月
- 予想使用量: 140時間/月 (28%使用)
- 余裕: 360時間/月

### 処理能力
- 10分/回 × 24回/日 = 240分/日 = 120時間/月
- AI分析: 5分/回 × 8回/日 = 40分/日 = 20時間/月
- 合計: 140時間/月

## 開発・運用ガイド

詳細な実装・運用ガイドは以下を参照：
- `/_doc/railway-migration-architecture.md` - システム設計
- `/_doc/implementation-checklist.md` - 実装チェックリスト  
- `/_doc/railway-deployment-guide.md` - デプロイメントガイド
- `/_doc/chatgpt-analysis-prompts.md` - AI分析設計