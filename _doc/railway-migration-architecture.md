# Railway移行アーキテクチャ設計書

## 📋 プロジェクト概要

### 目的
- Vercel Cronの15分制限を回避
- ChatGPT分析機能追加による処理時間延長対応
- 既存機能（UI、DB、Discord）の完全維持
- コスト効率的な運用（月額$5で開始）

### 移行方針
**ハイブリッド構成**: Vercel（UI・軽量処理）+ Railway（重い処理・AI分析）

---

## 🏗️ システムアーキテクチャ

### 全体構成図
```
┌─────────────────────────────────┐    ┌─────────────────────────────────┐
│ Vercel (フロントエンド)          │    │ Railway Worker (バックエンド)    │
├─────────────────────────────────┤    ├─────────────────────────────────┤
│ ✅ ブラウザUI (全ページ)          │◄──►│ 🆕 ChatGPT分析・要約             │
│ ✅ リスト管理API                 │    │ 🆕 大量ツイート処理             │
│ ✅ 軽量検索・表示               │    │ 🆕 複雑なデータ変換             │
│ ✅ Firebase認証                 │    │ ✅ Discord webhook送信          │
│ ✅ 即座レスポンス必要なAPI       │    │ ✅ 長時間Cron処理               │
└─────────────────────────────────┘    └─────────────────────────────────┘
                    │                                      │
                    └──────────────────┬───────────────────┘
                                       │
                            ┌─────────────────────────────────┐
                            │ Firestore Database (共通)       │
                            ├─────────────────────────────────┤
                            │ ├─ cron_tasks                   │
                            │ ├─ twitter_lists                │
                            │ ├─ collected_tweets             │
                            │ ├─ ai_analysis (🆕新規)         │
                            │ └─ cron_executions              │
                            └─────────────────────────────────┘
```

### データフロー
```
[ブラウザ] → [Vercel UI] → [Railway Worker] → [Firestore]
                ↑              ↓
           [結果表示] ← [ChatGPT API] → [Discord Webhook]
```

---

## 📊 データベース設計

### 新規追加: ai_analysis コレクション

#### スキーマ定義
```javascript
{
    // 基本情報
    analysisId: "analysis-1751234567890",
    sourceType: "twitter_list",                    // 分析対象タイプ
    sourceId: "list-1704110400-def456",           // 対象リストID
    
    // 分析設定
    analysisType: "sentiment_trend",               // 分析タイプ
    tweetIds: [                                   // 分析対象ツイートID配列
        "1745678901234567890", 
        "1745678901234567891"
    ],
    prompt: "以下のツイートから主要なトレンドを分析してください...",
    
    // 分析結果
    result: {
        summary: "AI技術に関する議論が活発化...",
        topics: ["機械学習", "自然言語処理", "倫理"],
        sentiment: { 
            positive: 0.7, 
            neutral: 0.2, 
            negative: 0.1 
        },
        keyInsights: [
            "企業の導入事例が増加", 
            "規制に関する懸念"
        ]
    },
    
    // メタデータ
    tokensUsed: 1250,                             // ChatGPT使用トークン数
    processingTimeMs: 8500,                       // 処理時間
    model: "gpt-4",                               // 使用モデル
    createdAt: "2024-01-01T12:00:00Z",
    status: "completed"                           // pending, processing, completed, error
}
```

#### 分析タイプ定義
| analysisType | 説明 | 用途 |
|--------------|------|------|
| `daily_summary` | 日次要約 | 1日分のツイートから主要トピック抽出 |
| `sentiment_trend` | 感情分析 | ポジティブ/ニュートラル/ネガティブ割合 |
| `topic_analysis` | トピック分析 | 技術トレンドのランキング |
| `user_insights` | ユーザー分析 | 影響力のあるユーザーや発言の特定 |
| `keyword_extraction` | キーワード抽出 | 頻出キーワードとその重要度 |

---

## 🔧 Railway Worker実装設計

### クラス構造
```javascript
class EnhancedTwitterWorker {
    constructor() {
        this.isRunning = false;
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        this.discord = new DiscordWebhook(process.env.DISCORD_WEBHOOK_URL);
    }
    
    // メインワーカーループ
    async start()
    
    // ジョブ処理ディスパッチャー
    async processJob(job)
    
    // 既存機能
    async processTwitterList(data)
    
    // 新規機能
    async processAIAnalysis(data)
    async processBulkAnalysis(data)
    async processScheduledAnalysis(data)
    
    // AI分析関連
    async performChatGPTAnalysis(tweets, analysisType)
    async saveAnalysisResult(sourceId, analysisType, result)
    async getTargetTweets(sourceId, limit)
    
    // 通知機能
    async sendDiscordAnalysisNotification(analysisResult)
    async sendDiscordErrorNotification(error)
}
```

### ジョブタイプ定義
```javascript
const JOB_TYPES = {
    // 既存
    'twitter_list_processing': {
        description: 'Twitterリストからツイート収集',
        estimatedTime: '5-10分',
        priority: 'high'
    },
    
    // 新規AI分析
    'ai_analysis': {
        description: '単発AI分析（手動実行）',
        estimatedTime: '1-3分',
        priority: 'medium'
    },
    
    'bulk_analysis': {
        description: '大量データのバッチ分析',
        estimatedTime: '10-30分',
        priority: 'low'
    },
    
    'scheduled_analysis': {
        description: '定期自動分析',
        estimatedTime: '5-15分',
        priority: 'medium'
    }
};
```

### ChatGPT分析プロンプト設計
```javascript
const ANALYSIS_PROMPTS = {
    daily_summary: {
        system: "あなたはTwitterデータの分析専門家です。簡潔で実用的な分析を提供してください。",
        template: `以下の{count}件のツイートから今日の主要トピックを3つ抽出し、それぞれ1-2行で要約してください。

出力形式:
## 主要トピック
1. **[トピック名]**: [要約]
2. **[トピック名]**: [要約]  
3. **[トピック名]**: [要約]

## 注目ツイート
- [最も重要なツイートの引用]

--- ツイート ---
{tweets}`
    },
    
    sentiment_trend: {
        system: "あなたは感情分析の専門家です。ツイートから正確な感情を読み取ってください。",
        template: `以下のツイートの感情分析を行い、結果をJSON形式で出力してください。

出力形式:
```json
{
  "sentiment_distribution": {
    "positive": 0.0,
    "neutral": 0.0, 
    "negative": 0.0
  },
  "key_emotions": ["emotion1", "emotion2", "emotion3"],
  "sentiment_summary": "全体的な感情の傾向の説明"
}
```

--- ツイート ---
{tweets}`
    }
};
```

---

## 🌐 Vercel側実装設計

### API エンドポイント再設計

#### 軽量化されたエンドポイント
```javascript
// /api/cron/universal-executor (軽量トリガー)
app.get('/api/cron/universal-executor', async (req, res) => {
    // Railway Workerに処理委譲（即座にレスポンス）
    const response = await triggerRailwayWorker('scheduled_processing');
    res.json({ success: true, triggered: true });
});

// /api/analysis/:sourceId (結果取得)
app.get('/api/analysis/:sourceId', async (req, res) => {
    // Firestoreから分析結果を取得して返却
    const analyses = await getAnalysisResults(req.params.sourceId);
    res.json({ success: true, analyses });
});

// /api/analysis/request (手動分析リクエスト)
app.post('/api/analysis/request', async (req, res) => {
    // Railway Workerに分析ジョブを送信
    const jobId = await triggerRailwayWorker('ai_analysis', req.body);
    res.json({ success: true, jobId });
});
```

#### Railway通信ヘルパー
```javascript
class RailwayClient {
    constructor() {
        this.baseUrl = process.env.RAILWAY_WORKER_URL;
        this.secret = process.env.WORKER_SECRET;
    }
    
    async triggerJob(jobType, data = {}) {
        const response = await fetch(`${this.baseUrl}/api/worker/execute`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.secret}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type: jobType,
                data: data,
                timestamp: new Date(),
                requestId: `req_${Date.now()}_${Math.random()}`
            }),
            timeout: 10000 // 10秒でタイムアウト
        });
        
        if (!response.ok) {
            throw new Error(`Railway worker error: ${response.status}`);
        }
        
        return response.json();
    }
    
    async getJobStatus(jobId) {
        const response = await fetch(`${this.baseUrl}/api/worker/status/${jobId}`, {
            headers: { 'Authorization': `Bearer ${this.secret}` }
        });
        return response.json();
    }
}
```

---

## 🎨 フロントエンド UI設計

### List Scheduler拡張

#### 新規UI要素
```html
<!-- 既存のリスト項目に分析機能を追加 -->
<div class="list-item">
    <div class="list-info">
        <h4>${list.name}</h4>
        <small>ID: ${list.listId} | ${formatFrequency(list.frequency)}</small>
        
        <!-- 新規: 最新分析結果 -->
        <div class="latest-analysis" id="analysis-${list.listId}">
            <span class="analysis-status">🤖 分析結果を読み込み中...</span>
        </div>
    </div>
    
    <div class="list-actions">
        <!-- 既存ボタン -->
        <button onclick="toggleList('${list.listId}', ${!list.active})" 
                class="btn btn-small ${list.active ? 'btn-danger' : ''}">
            ${list.active ? '⏸️ 停止' : '▶️ 開始'}
        </button>
        
        <!-- 新規: AI分析ボタン -->
        <button onclick="requestAnalysis('${list.listId}', 'daily_summary')" 
                class="btn btn-small btn-ai">
            🤖 AI分析
        </button>
        
        <!-- 新規: 分析結果表示ボタン -->
        <button onclick="showAnalysisHistory('${list.listId}')" 
                class="btn btn-small btn-secondary">
            📊 履歴
        </button>
        
        <button onclick="deleteList('${list.listId}')" 
                class="btn btn-danger btn-small">
            🗑️ 削除
        </button>
    </div>
</div>
```

#### 分析結果表示モーダル
```html
<div id="analysisModal" class="modal" style="display: none;">
    <div class="modal-content">
        <div class="modal-header">
            <h3>🤖 AI分析結果</h3>
            <span class="close" onclick="closeAnalysisModal()">&times;</span>
        </div>
        
        <div class="modal-body">
            <!-- 分析タイプ選択 -->
            <div class="analysis-controls">
                <select id="analysisTypeSelect">
                    <option value="daily_summary">日次要約</option>
                    <option value="sentiment_trend">感情分析</option>
                    <option value="topic_analysis">トピック分析</option>
                    <option value="keyword_extraction">キーワード抽出</option>
                </select>
                <button onclick="requestNewAnalysis()" class="btn btn-primary">
                    新規分析実行
                </button>
            </div>
            
            <!-- 分析結果一覧 -->
            <div id="analysisResults" class="analysis-results">
                <!-- 動的に生成 -->
            </div>
        </div>
    </div>
</div>
```

#### JavaScript分析機能
```javascript
// AI分析結果の表示
async function showAnalysisHistory(listId) {
    const modal = document.getElementById('analysisModal');
    const resultsDiv = document.getElementById('analysisResults');
    
    // 分析結果取得
    const response = await fetch(`/api/analysis/${listId}`);
    const data = await response.json();
    
    if (data.success && data.analyses.length > 0) {
        resultsDiv.innerHTML = data.analyses.map(analysis => `
            <div class="analysis-card" data-type="${analysis.analysisType}">
                <div class="analysis-header">
                    <h4>🤖 ${getAnalysisTypeLabel(analysis.analysisType)}</h4>
                    <span class="analysis-meta">
                        ${new Date(analysis.createdAt).toLocaleString('ja-JP')} | 
                        ${analysis.tokensUsed} tokens | 
                        ${Math.round(analysis.processingTimeMs / 1000)}秒
                    </span>
                </div>
                
                <div class="analysis-content">
                    ${formatAnalysisResult(analysis.result)}
                </div>
                
                <div class="analysis-actions">
                    <button onclick="copyAnalysisResult('${analysis.analysisId}')" 
                            class="btn btn-small">
                        📋 コピー
                    </button>
                    <button onclick="shareToDiscord('${analysis.analysisId}')" 
                            class="btn btn-small">
                        📢 Discord共有
                    </button>
                </div>
            </div>
        `).join('');
    } else {
        resultsDiv.innerHTML = '<p class="no-analysis">まだ分析結果がありません。</p>';
    }
    
    modal.style.display = 'block';
}

// 手動分析リクエスト
async function requestAnalysis(listId, analysisType) {
    const loadingBtn = event.target;
    loadingBtn.disabled = true;
    loadingBtn.textContent = '🔄 分析中...';
    
    try {
        const response = await fetch('/api/analysis/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sourceId: listId,
                analysisType: analysisType,
                notifyDiscord: true
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('🤖 AI分析を開始しました。結果は1-2分後に表示されます。', 'success');
            
            // 30秒後に結果をポーリング
            setTimeout(() => {
                checkAnalysisProgress(listId, result.jobId);
            }, 30000);
        } else {
            showToast('❌ 分析リクエストに失敗しました', 'error');
        }
        
    } catch (error) {
        showToast(`❌ エラー: ${error.message}`, 'error');
    } finally {
        loadingBtn.disabled = false;
        loadingBtn.textContent = '🤖 AI分析';
    }
}

// 分析進行状況チェック
async function checkAnalysisProgress(listId, jobId) {
    try {
        const response = await fetch(`/api/analysis/status/${jobId}`);
        const status = await response.json();
        
        if (status.completed) {
            showToast('✅ AI分析が完了しました！', 'success');
            updateAnalysisDisplay(listId);
        } else if (status.error) {
            showToast('❌ AI分析でエラーが発生しました', 'error');
        } else {
            // まだ処理中、再度チェック
            setTimeout(() => checkAnalysisProgress(listId, jobId), 15000);
        }
    } catch (error) {
        console.error('分析進行チェックエラー:', error);
    }
}
```

---

## 🚀 移行実装スケジュール

### Phase 1: Railway基盤構築 (Week 1)
**目標**: Railway環境でのベース機能動作確認

#### タスク
- [ ] Railway Hobbyプラン契約
- [ ] `server.js`をRailwayにデプロイ
- [ ] 環境変数設定（Firebase, Twitter API等）
- [ ] Vercel → Railway HTTP通信テスト
- [ ] 基本的なワーカージョブ実行確認

#### 成果物
- Railway上で動作するベースアプリケーション
- Vercel-Railway間の通信確立

### Phase 2: Cron処理移行 (Week 2)
**目標**: 既存Cron処理の完全移行

#### タスク
- [ ] `cronExecutor`をRailway Worker内に移植
- [ ] Vercel Cronから軽量トリガーに変更
- [ ] Firestore接続・操作確認
- [ ] Discord webhook動作確認
- [ ] 既存リスト機能の動作検証

#### 成果物
- Railway上で動作する完全なCron処理
- 既存機能の100%互換性確保

### Phase 3: AI分析基盤実装 (Week 3)
**目標**: ChatGPT分析機能の基盤構築

#### タスク
- [ ] `ai_analysis`コレクション作成
- [ ] `EnhancedTwitterWorker`クラス実装
- [ ] ChatGPT API統合
- [ ] 基本的な分析機能実装（daily_summary）
- [ ] 分析結果保存・取得API実装

#### 成果物
- 動作するAI分析エンジン
- 基本的な分析結果の生成・保存

### Phase 4: UI統合・完成 (Week 4)
**目標**: フロントエンドとの完全統合

#### タスク
- [ ] List SchedulerにAI分析UI追加
- [ ] 分析結果表示モーダル実装
- [ ] 手動分析リクエスト機能
- [ ] 進行状況表示・通知機能
- [ ] Discord分析結果共有機能

#### 成果物
- 完全統合されたAI分析機能
- ユーザーフレンドリーなUI

---

## 💰 コスト分析

### Railway Hobby ($5/月)での使用量予測

#### 処理パターン
- **ツイート収集**: 10分/回 × 24回/日 = 240分/日 = 120時間/月
- **AI分析**: 5分/回 × 8回/日 = 40分/日 = 20時間/月
- **合計**: 140時間/月

#### Hobbyプラン制限との比較
- **制限**: 500時間/月
- **使用予定**: 140時間/月
- **使用率**: 28%
- **余裕**: 360時間/月

#### ChatGPT API コスト (GPT-4)
- **1回の分析**: 約1,000トークン = $0.03
- **月間分析回数**: 240回 (8回/日 × 30日)
- **月額API コスト**: $7.2

#### 総コスト
- **Railway**: $5/月
- **ChatGPT API**: $7.2/月
- **合計**: $12.2/月

---

## 🔒 セキュリティ・監視設計

### 認証・認可
```javascript
// Railway Worker API認証
const authenticateWorkerRequest = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const expectedToken = `Bearer ${process.env.WORKER_SECRET}`;
    
    if (authHeader !== expectedToken) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    next();
};

// レート制限
const rateLimitConfig = {
    windowMs: 15 * 60 * 1000, // 15分
    max: 100, // 最大100リクエスト
    message: 'Too many requests from this IP'
};
```

### エラー監視
```javascript
// 包括的エラーハンドリング
class ErrorMonitor {
    static async logError(error, context) {
        const errorLog = {
            timestamp: new Date(),
            error: error.message,
            stack: error.stack,
            context: context,
            severity: this.getSeverity(error)
        };
        
        // Firestoreにログ保存
        await addDoc(collection(db, 'error_logs'), errorLog);
        
        // Discord通知（重要なエラーのみ）
        if (errorLog.severity >= 3) {
            await this.notifyDiscord(errorLog);
        }
    }
    
    static getSeverity(error) {
        if (error.message.includes('ChatGPT') || error.message.includes('OpenAI')) {
            return 3; // High
        }
        if (error.message.includes('Firebase') || error.message.includes('Firestore')) {
            return 4; // Critical
        }
        return 2; // Medium
    }
}
```

### パフォーマンス監視
```javascript
// 処理時間監視
class PerformanceMonitor {
    static async trackJobPerformance(jobType, startTime, endTime, result) {
        const performance = {
            jobType: jobType,
            executionTime: endTime - startTime,
            timestamp: new Date(),
            success: result.success,
            memoryUsage: process.memoryUsage(),
            cpuUsage: process.cpuUsage()
        };
        
        await addDoc(collection(db, 'performance_logs'), performance);
        
        // 異常な処理時間の場合は通知
        if (performance.executionTime > 600000) { // 10分以上
            await this.alertSlowPerformance(performance);
        }
    }
}
```

---

## 📝 設定ファイル

### Railway用環境変数
```bash
# API Keys
TWITTER_API_KEY=your_twitterapi_io_key
OPENAI_API_KEY=your_openai_api_key

# Firebase Configuration
FIREBASE_API_KEY=your_firebase_api_key
FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
FIREBASE_APP_ID=your_app_id
FIREBASE_MEASUREMENT_ID=your_measurement_id

# Security
WORKER_SECRET=your-random-secret-32chars-minimum
CRON_SECRET=your-random-secret-32chars-minimum

# Discord
DISCORD_WEBHOOK_URL=your_discord_webhook_url

# Railway Configuration
NODE_ENV=production
PORT=3000
```

### Vercel用追加環境変数
```bash
# Railway Worker URL
RAILWAY_WORKER_URL=https://your-app.railway.app
WORKER_SECRET=your-random-secret-32chars-minimum
```

### railway.json
```json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "numReplicas": 1,
    "sleepApplication": false,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  },
  "runtime": {
    "memory": "512MB",
    "cpu": "0.5"
  }
}
```

---

## ✅ 検証・テスト計画

### 単体テスト
- [ ] ChatGPT分析機能のユニットテスト
- [ ] Firebase操作のテスト
- [ ] Discord通知のテスト

### 統合テスト
- [ ] Vercel-Railway間通信テスト
- [ ] エンドツーエンドのリスト処理テスト
- [ ] UI操作から結果表示までのフローテスト

### パフォーマンステスト
- [ ] 大量ツイート処理の負荷テスト
- [ ] ChatGPT API制限下での動作テスト
- [ ] Railway Hobbyプランでの制限テスト

### 運用テスト
- [ ] 1週間の連続運用テスト
- [ ] エラー復旧能力のテスト
- [ ] バックアップ・復元機能のテスト

---

## 📚 参考資料・依存関係

### 主要ライブラリ
- `openai`: "^4.0.0" (ChatGPT API)
- `firebase`: "^10.0.0" (Firestore)
- `express`: "^4.18.0" (Web フレームワーク)
- `axios`: "^1.0.0" (HTTP クライアント)

### 外部サービス
- [Railway](https://railway.app/) - ワーカー実行環境
- [OpenAI API](https://platform.openai.com/) - AI分析
- [TwitterAPI.io](https://twitterapi.io/) - ツイートデータ
- [Firebase Firestore](https://firebase.google.com/docs/firestore) - データベース
- [Discord Webhooks](https://discord.com/developers/docs/resources/webhook) - 通知

### 開発・デバッグツール
- Railway CLI
- Firebase CLI
- VS Code Railway Extension
- Postman (API テスト)

---

*このドキュメントは実装進行に応じて更新されます。*