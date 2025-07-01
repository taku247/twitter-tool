# Railway デプロイメントガイド

## 🚀 Railway環境構築手順

### Phase 1: アカウント・プロジェクト作成

#### 1. Railwayアカウント作成
1. [Railway.app](https://railway.app/)にアクセス
2. GitHubアカウントでサインアップ
3. プラン選択: **Hobby ($5/月)** を選択

#### 2. プロジェクト作成
```bash
# Railway CLI インストール
npm install -g @railway/cli

# ログイン
railway login

# プロジェクト作成
railway new twitter-worker
cd twitter-worker
```

#### 3. GitHubリポジトリ連携
```bash
# 既存リポジトリとの連携
railway link [PROJECT_ID]

# または新しいリポジトリを作成
git init
git remote add origin https://github.com/your-username/twitter-worker.git
```

---

### Phase 2: アプリケーション準備

#### 1. ディレクトリ構造準備
```
twitter-worker/
├── package.json
├── railway.json
├── server.js           # メインアプリケーション
├── workers/
│   ├── TwitterWorker.js
│   ├── AIAnalyzer.js
│   └── DiscordNotifier.js
├── config/
│   ├── database.js
│   └── prompts.js
└── utils/
    ├── logger.js
    └── validators.js
```

#### 2. package.json設定
```json
{
  "name": "twitter-worker",
  "version": "1.0.0",
  "description": "Twitter analysis worker for Railway",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "test": "jest"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "axios": "^1.6.2",
    "openai": "^4.24.7",
    "firebase": "^10.7.1",
    "dotenv": "^16.3.1",
    "helmet": "^7.1.0",
    "compression": "^1.7.4"
  },
  "devDependencies": {
    "nodemon": "^3.0.2",
    "jest": "^29.7.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

#### 3. railway.json設定
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
  },
  "networking": {
    "serviceDomain": "twitter-worker"
  }
}
```

---

### Phase 3: Railway Worker実装

#### 1. メインサーバー (server.js)
```javascript
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const TwitterWorker = require('./workers/TwitterWorker');
const AIAnalyzer = require('./workers/AIAnalyzer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ミドルウェア
app.use(helmet());
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// セキュリティ認証ミドルウェア
const authenticateWorker = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const expectedToken = `Bearer ${process.env.WORKER_SECRET}`;
    
    if (authHeader !== expectedToken) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

// ヘルスチェック
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date(),
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

// ワーカージョブ実行エンドポイント
app.post('/api/worker/execute', authenticateWorker, async (req, res) => {
    try {
        const { type, data, requestId } = req.body;
        
        console.log(`📋 Job received: ${type} | Request: ${requestId}`);
        
        // 即座にレスポンスを返す
        res.json({ 
            success: true, 
            accepted: true,
            jobType: type,
            requestId: requestId,
            startTime: new Date()
        });
        
        // バックグラウンドで処理実行
        setImmediate(async () => {
            try {
                const worker = new TwitterWorker();
                const result = await worker.processJob({ type, data, requestId });
                console.log(`✅ Job completed: ${requestId}`, result);
            } catch (error) {
                console.error(`❌ Job failed: ${requestId}`, error);
            }
        });
        
    } catch (error) {
        console.error('Worker execution error:', error);
        res.status(500).json({ error: error.message });
    }
});

// AI分析エンドポイント
app.post('/api/worker/analysis', authenticateWorker, async (req, res) => {
    try {
        const { sourceId, analysisType, notifyDiscord } = req.body;
        
        res.json({ 
            success: true, 
            analysisStarted: true,
            sourceId: sourceId,
            analysisType: analysisType 
        });
        
        // バックグラウンドでAI分析実行
        setImmediate(async () => {
            try {
                const analyzer = new AIAnalyzer();
                const result = await analyzer.performAnalysis(sourceId, analysisType);
                
                if (notifyDiscord) {
                    await analyzer.notifyDiscord(result);
                }
                
                console.log(`✅ Analysis completed: ${sourceId}`, result);
            } catch (error) {
                console.error(`❌ Analysis failed: ${sourceId}`, error);
            }
        });
        
    } catch (error) {
        console.error('Analysis execution error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ジョブ状況確認エンドポイント
app.get('/api/worker/status/:jobId', authenticateWorker, async (req, res) => {
    try {
        // 実装: Redis や Firestore からジョブ状況を取得
        res.json({ 
            jobId: req.params.jobId,
            status: 'completed', // pending, processing, completed, error
            result: 'Job completed successfully'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// エラーハンドリング
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ 
        error: 'Internal server error',
        requestId: req.headers['x-request-id'] || 'unknown'
    });
});

// サーバー起動
app.listen(PORT, () => {
    console.log(`🚀 Railway Worker Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Memory: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`);
});
```

#### 2. Twitter Worker (workers/TwitterWorker.js)
```javascript
const { initializeApp } = require('firebase/app');
const { 
    getFirestore, 
    collection, 
    addDoc, 
    getDocs, 
    query, 
    where, 
    orderBy 
} = require('firebase/firestore');
const axios = require('axios');

class TwitterWorker {
    constructor() {
        this.initializeFirebase();
        this.isRunning = false;
    }
    
    async initializeFirebase() {
        const firebaseConfig = {
            apiKey: process.env.FIREBASE_API_KEY,
            authDomain: process.env.FIREBASE_AUTH_DOMAIN,
            projectId: process.env.FIREBASE_PROJECT_ID,
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
            messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
            appId: process.env.FIREBASE_APP_ID,
            measurementId: process.env.FIREBASE_MEASUREMENT_ID
        };
        
        this.app = initializeApp(firebaseConfig);
        this.db = getFirestore(this.app);
        
        console.log('✅ Firebase initialized in Railway Worker');
    }
    
    async processJob(job) {
        const { type, data, requestId } = job;
        const startTime = Date.now();
        
        try {
            console.log(`🔄 Processing job: ${type} | ${requestId}`);
            
            let result;
            switch (type) {
                case 'scheduled_processing':
                    result = await this.processScheduledTasks();
                    break;
                case 'twitter_list_processing':
                    result = await this.processTwitterList(data);
                    break;
                case 'ai_analysis':
                    result = await this.processAIAnalysis(data);
                    break;
                default:
                    throw new Error(`Unknown job type: ${type}`);
            }
            
            const processingTime = Date.now() - startTime;
            
            // 実行ログをFirestoreに保存
            await this.logJobExecution(type, requestId, 'success', result, processingTime);
            
            return { success: true, result, processingTime };
            
        } catch (error) {
            const processingTime = Date.now() - startTime;
            console.error(`❌ Job failed: ${type} | ${requestId}`, error);
            
            await this.logJobExecution(type, requestId, 'error', { error: error.message }, processingTime);
            
            throw error;
        }
    }
    
    async processScheduledTasks() {
        console.log('📋 Processing scheduled tasks...');
        
        // アクティブなタスクを取得
        const tasksSnapshot = await getDocs(
            query(collection(this.db, 'cron_tasks'), where('active', '==', true))
        );
        
        const allTasks = tasksSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        const now = new Date();
        const tasksToExecute = allTasks.filter(task => {
            const lastExecuted = new Date(task.lastExecuted || 0);
            const minutesSince = (now - lastExecuted) / (1000 * 60);
            return minutesSince >= (task.frequency - 2); // 2分マージン
        });
        
        console.log(`📊 Found ${tasksToExecute.length} tasks to execute`);
        
        const results = [];
        for (const task of tasksToExecute) {
            try {
                const result = await this.executeTwitterListTask(task, now);
                results.push({ taskId: task.id, success: true, result });
            } catch (error) {
                console.error(`❌ Task failed: ${task.id}`, error);
                results.push({ taskId: task.id, success: false, error: error.message });
            }
        }
        
        // Discord通知
        if (results.length > 0) {
            await this.sendDiscordSummary(results);
        }
        
        return { executedTasks: results.length, results };
    }
    
    async executeTwitterListTask(task, currentTime) {
        console.log(`🐦 Processing Twitter list: ${task.config?.relatedTableId}`);
        
        // 既存のTwitterリスト処理ロジックをここに移植
        // (現在のserver.jsのexecuteTwitterListTask内容)
        
        // リストデータ取得
        const listSnapshot = await getDocs(
            query(collection(this.db, 'twitter_lists'), where('listId', '==', task.config.relatedTableId))
        );
        
        if (listSnapshot.empty) {
            throw new Error(`List not found: ${task.config.relatedTableId}`);
        }
        
        const listData = listSnapshot.docs[0].data();
        
        // TwitterAPI.ioからツイート取得
        const tweets = await this.fetchTweetsFromAPI(listData, currentTime);
        
        // 新規ツイートのみフィルタリング・保存
        const newTweets = await this.saveNewTweets(tweets, task.config.relatedTableId, task.id);
        
        console.log(`✅ Processed ${newTweets.length} new tweets for ${task.config.relatedTableId}`);
        
        return { newTweets: newTweets.length, totalProcessed: tweets.length };
    }
    
    async fetchTweetsFromAPI(listData, currentTime) {
        const lastExecuted = new Date(listData.lastExecuted || 0);
        const marginTime = new Date(lastExecuted.getTime() - 3 * 60 * 1000); // 3分マージン
        
        const params = {
            listId: listData.twitterListId,
            sinceTime: Math.floor(marginTime.getTime() / 1000),
            untilTime: Math.floor(currentTime.getTime() / 1000)
        };
        
        const response = await axios.get('https://api.twitterapi.io/twitter/list/tweets', {
            params,
            headers: {
                'X-API-Key': process.env.TWITTER_API_KEY,
                'Content-Type': 'application/json'
            }
        });
        
        return response.data.tweets || [];
    }
    
    async saveNewTweets(tweets, listId, taskId) {
        const newTweets = [];
        
        for (const tweet of tweets) {
            // 重複チェック
            const existingSnapshot = await getDocs(
                query(collection(this.db, 'collected_tweets'), where('tweetId', '==', tweet.id))
            );
            
            if (existingSnapshot.empty) {
                // 新規ツイートを保存
                const tweetData = {
                    tweetId: tweet.id,
                    sourceType: 'twitter_list',
                    sourceId: listId,
                    taskId: taskId,
                    text: tweet.text,
                    authorId: tweet.author?.id || tweet.userId,
                    authorName: tweet.author?.username || tweet.username,
                    createdAt: tweet.created_at || tweet.createdAt,
                    collectedAt: new Date(),
                    data: tweet
                };
                
                await addDoc(collection(this.db, 'collected_tweets'), tweetData);
                newTweets.push(tweetData);
            }
        }
        
        return newTweets;
    }
    
    async sendDiscordSummary(results) {
        try {
            const successCount = results.filter(r => r.success).length;
            const errorCount = results.filter(r => !r.success).length;
            const totalNewTweets = results
                .filter(r => r.success)
                .reduce((sum, r) => sum + (r.result?.newTweets || 0), 0);
            
            const message = {
                embeds: [{
                    title: "🤖 Railway Worker - タスク実行完了",
                    color: errorCount > 0 ? 0xff6b6b : 0x28a745,
                    fields: [
                        { name: "✅ 成功", value: successCount.toString(), inline: true },
                        { name: "❌ エラー", value: errorCount.toString(), inline: true },
                        { name: "🐦 新規ツイート", value: totalNewTweets.toString(), inline: true }
                    ],
                    timestamp: new Date().toISOString(),
                    footer: { text: "Railway Worker System" }
                }]
            };
            
            await axios.post(process.env.DISCORD_WEBHOOK_URL, message);
            
        } catch (error) {
            console.error('Discord notification failed:', error);
        }
    }
    
    async logJobExecution(jobType, requestId, status, result, processingTime) {
        try {
            const logData = {
                jobType,
                requestId,
                status,
                result,
                processingTime,
                timestamp: new Date(),
                workerInfo: {
                    platform: 'railway',
                    memory: process.memoryUsage(),
                    uptime: process.uptime()
                }
            };
            
            await addDoc(collection(this.db, 'worker_executions'), logData);
            
        } catch (error) {
            console.error('Failed to log job execution:', error);
        }
    }
}

module.exports = TwitterWorker;
```

---

### Phase 4: 環境変数設定

#### Railway Dashboard設定
```bash
# Railway CLIで環境変数設定
railway variables set NODE_ENV=production
railway variables set PORT=3000

# API Keys
railway variables set TWITTER_API_KEY=your_twitterapi_io_key
railway variables set OPENAI_API_KEY=your_openai_api_key

# Firebase Configuration  
railway variables set FIREBASE_API_KEY=your_firebase_api_key
railway variables set FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
railway variables set FIREBASE_PROJECT_ID=your_project_id
railway variables set FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
railway variables set FIREBASE_MESSAGING_SENDER_ID=your_sender_id
railway variables set FIREBASE_APP_ID=your_app_id
railway variables set FIREBASE_MEASUREMENT_ID=your_measurement_id

# Security
railway variables set WORKER_SECRET=$(openssl rand -base64 32)
railway variables set CRON_SECRET=your_existing_cron_secret

# Discord
railway variables set DISCORD_WEBHOOK_URL=your_discord_webhook_url
```

#### 環境変数確認
```bash
# 設定済み環境変数の確認
railway variables

# 特定の変数の確認
railway variables get WORKER_SECRET
```

---

### Phase 5: デプロイ・動作確認

#### 1. 初回デプロイ
```bash
# コードをプッシュ（自動デプロイ）
git add .
git commit -m "Initial Railway worker implementation"
git push origin main

# 手動デプロイ（必要な場合）
railway deploy

# デプロイ状況確認
railway status
```

#### 2. ログ確認
```bash
# リアルタイムログ
railway logs

# 特定サービスのログ
railway logs --service=web

# 過去のログ
railway logs --tail=100
```

#### 3. 動作確認テスト
```bash
# ヘルスチェック
curl https://your-app.railway.app/health

# ワーカー認証テスト
curl -X POST https://your-app.railway.app/api/worker/execute \
  -H "Authorization: Bearer YOUR_WORKER_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"type":"test","data":{},"requestId":"test-001"}'
```

---

### Phase 6: Vercel連携設定

#### 1. Vercel環境変数追加
```bash
# Vercel CLIまたはダッシュボードで設定
vercel env add RAILWAY_WORKER_URL
# 値: https://your-app.railway.app

vercel env add WORKER_SECRET  
# 値: Railway で設定したものと同じWORKER_SECRET
```

#### 2. Vercel側コード修正
```javascript
// Vercel - /api/cron/universal-executor の軽量化
app.get('/api/cron/universal-executor', async (req, res) => {
    try {
        console.log('🔄 Triggering Railway worker...');
        
        const response = await fetch(`${process.env.RAILWAY_WORKER_URL}/api/worker/execute`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.WORKER_SECRET}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type: 'scheduled_processing',
                data: {},
                requestId: `vercel_${Date.now()}`
            }),
            timeout: 10000 // 10秒でタイムアウト
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log('✅ Railway worker triggered successfully:', result);
            
            res.json({ 
                success: true, 
                triggered: true,
                workerResponse: result,
                timestamp: new Date()
            });
        } else {
            throw new Error(`Railway worker responded with status: ${response.status}`);
        }
        
    } catch (error) {
        console.error('❌ Failed to trigger Railway worker:', error);
        
        res.status(500).json({ 
            success: false, 
            error: 'Failed to trigger worker',
            details: error.message,
            timestamp: new Date()
        });
    }
});
```

---

### Phase 7: 監視・メンテナンス

#### 1. Railway監視設定
```javascript
// worker/monitoring.js
class WorkerMonitor {
    static async checkHealth() {
        const health = {
            timestamp: new Date(),
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            cpu: process.cpuUsage(),
            environment: process.env.NODE_ENV,
            version: process.env.npm_package_version
        };
        
        return health;
    }
    
    static async logMetrics() {
        const metrics = await this.checkHealth();
        
        // 高メモリ使用量の警告
        const memoryUsageMB = metrics.memory.heapUsed / 1024 / 1024;
        if (memoryUsageMB > 400) { // 400MB以上
            console.warn(`⚠️  High memory usage: ${memoryUsageMB.toFixed(2)}MB`);
        }
        
        // 長時間稼働の確認
        const uptimeHours = metrics.uptime / 3600;
        if (uptimeHours > 48) { // 48時間以上
            console.info(`ℹ️  Long uptime: ${uptimeHours.toFixed(1)} hours`);
        }
        
        return metrics;
    }
}

// 定期的なヘルスチェック（30分ごと）
setInterval(async () => {
    try {
        const metrics = await WorkerMonitor.logMetrics();
        console.log('📊 Health check:', {
            memory: `${(metrics.memory.heapUsed / 1024 / 1024).toFixed(2)}MB`,
            uptime: `${(metrics.uptime / 3600).toFixed(1)}h`
        });
    } catch (error) {
        console.error('Health check failed:', error);
    }
}, 30 * 60 * 1000);
```

#### 2. アラート設定
```bash
# Railway Webhookでアラート設定
# Dashboard → Settings → Webhooks で設定
# 対象イベント: deployment.success, deployment.failed, service.restart
```

#### 3. バックアップ・復旧手順
```bash
# 設定のバックアップ
railway variables > railway-env-backup.txt

# コードのバックアップ
git archive --format=tar.gz --output=railway-worker-backup.tar.gz HEAD

# 復旧時の手順
# 1. 新しいRailwayプロジェクト作成
# 2. 環境変数の復元
# 3. コードのデプロイ
# 4. 動作確認
```

---

## 🔧 トラブルシューティング

### よくある問題と解決方法

#### 1. デプロイエラー
```bash
# 問題: Build failed
# 解決: Nixpacksビルダーの設定確認
echo 'python' > .tool-versions  # Node.js以外の依存関係がある場合

# 問題: Port binding failed  
# 解決: PORT環境変数の確認
railway variables set PORT=3000
```

#### 2. 環境変数問題
```bash
# 問題: Firebase connection failed
# 解決: 全ての必須環境変数が設定されているか確認
railway variables | grep FIREBASE

# 問題: Worker authentication failed
# 解決: WORKER_SECRETの一致確認  
railway variables get WORKER_SECRET
```

#### 3. メモリ・パフォーマンス問題
```javascript
// メモリ使用量の監視
setInterval(() => {
    const usage = process.memoryUsage();
    const memoryMB = usage.heapUsed / 1024 / 1024;
    
    if (memoryMB > 450) { // Hobbyプランの限界近く
        console.warn(`⚠️  Memory warning: ${memoryMB.toFixed(2)}MB`);
        
        // ガベージコレクションの強制実行
        if (global.gc) {
            global.gc();
        }
    }
}, 60000);
```

#### 4. API制限・エラー処理
```javascript
// Twitter API制限対応
class APIRateLimiter {
    constructor() {
        this.requests = [];
        this.limit = 100; // 1時間あたり
        this.window = 60 * 60 * 1000; // 1時間
    }
    
    async checkLimit() {
        const now = Date.now();
        this.requests = this.requests.filter(time => now - time < this.window);
        
        if (this.requests.length >= this.limit) {
            const waitTime = this.window - (now - this.requests[0]);
            throw new Error(`Rate limit exceeded. Wait ${Math.ceil(waitTime / 1000)} seconds.`);
        }
        
        this.requests.push(now);
    }
}
```

---

## 📊 パフォーマンス最適化

### 1. メモリ最適化
```javascript
// 大量データ処理時のストリーミング
const processLargeTweetBatch = async (tweets) => {
    const batchSize = 50;
    const results = [];
    
    for (let i = 0; i < tweets.length; i += batchSize) {
        const batch = tweets.slice(i, i + batchSize);
        const batchResult = await processTweetBatch(batch);
        results.push(...batchResult);
        
        // メモリ解放のための小休止
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return results;
};
```

### 2. データベース最適化
```javascript
// Firestoreバッチ書き込み
const saveTweetsInBatch = async (tweets) => {
    const batch = writeBatch(db);
    
    tweets.forEach(tweet => {
        const docRef = doc(collection(db, 'collected_tweets'));
        batch.set(docRef, tweet);
    });
    
    await batch.commit();
};
```

### 3. 並列処理最適化
```javascript
// 複数リストの並列処理
const processMultipleLists = async (tasks) => {
    const maxConcurrent = 3; // 同時実行数を制限
    const results = [];
    
    for (let i = 0; i < tasks.length; i += maxConcurrent) {
        const batch = tasks.slice(i, i + maxConcurrent);
        const promises = batch.map(task => processTwitterList(task));
        const batchResults = await Promise.allSettled(promises);
        results.push(...batchResults);
    }
    
    return results;
};
```

---

## ✅ 完了チェックリスト

### デプロイ前確認
- [ ] Railway プロジェクト作成完了
- [ ] 全ての環境変数設定完了  
- [ ] `railway.json` 設定完了
- [ ] Firebase接続テスト完了
- [ ] Discord webhook テスト完了

### デプロイ後確認
- [ ] アプリケーション起動確認
- [ ] ヘルスチェックエンドポイント動作確認
- [ ] Vercel-Railway通信確認
- [ ] ログ出力確認
- [ ] エラーハンドリング動作確認

### 運用開始確認
- [ ] 既存Cron機能の完全移行
- [ ] 1週間の安定動作確認
- [ ] メモリ・CPU使用量監視
- [ ] Discord通知正常動作
- [ ] エラーアラート設定完了

---

*このガイドに従って段階的にRailway移行を進めてください。問題が発生した場合は、該当セクションのトラブルシューティングを参照してください。*