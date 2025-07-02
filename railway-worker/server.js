const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// 環境変数検証
const { validateEnvironment, debugEnvironment } = require('./config/environment');

// 環境変数チェック
if (!validateEnvironment()) {
    console.error('❌ Environment validation failed. Exiting...');
    process.exit(1);
}
debugEnvironment();

// Worker classes (遅延読み込み対応)
let TwitterWorker;
try {
    TwitterWorker = require('./workers/TwitterWorker');
    console.log('✅ TwitterWorker class loaded successfully');
    console.log('TwitterWorker type:', typeof TwitterWorker);
    console.log('TwitterWorker constructor:', TwitterWorker ? TwitterWorker.name : 'undefined');
    
    // テスト初期化
    try {
        const testWorker = new TwitterWorker();
        console.log('✅ TwitterWorker test instantiation successful');
        console.log('TwitterWorker instance methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(testWorker)));
    } catch (initError) {
        console.error('❌ TwitterWorker instantiation failed:', initError.message);
        console.error('Init error details:', initError);
        TwitterWorker = null; // 初期化に失敗した場合はnullにする
    }
} catch (error) {
    console.error('❌ Failed to load TwitterWorker:', error.message);
    console.error('Full error:', error);
    console.error('Stack trace:', error.stack);
    console.error('This may be due to missing environment variables or module dependencies');
    TwitterWorker = null;
}

const app = express();
const PORT = process.env.PORT || 3000;

// セキュリティミドルウェア
app.use(helmet());
app.use(compression());
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['https://twitter-tool-eight.vercel.app'],
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// レート制限
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分
    max: 100, // 最大100リクエスト
    message: 'Too many requests from this IP'
});
app.use('/api/', limiter);

// 認証ミドルウェア
const authenticateWorker = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const expectedToken = `Bearer ${process.env.WORKER_SECRET}`;
    
    if (authHeader !== expectedToken) {
        console.warn(`⚠️ Unauthorized access attempt from IP: ${req.ip}`);
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

// ========== ヘルスチェック ==========
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date(),
        uptime: process.uptime(),
        memory: {
            used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
            unit: 'MB'
        },
        environment: process.env.NODE_ENV || 'development',
        version: process.env.npm_package_version || '1.0.0'
    });
});

// ========== ワーカー実行エンドポイント ==========
app.post('/api/worker/execute', authenticateWorker, async (req, res) => {
    try {
        const { type, data, requestId } = req.body;
        
        console.log(`📋 Job received: ${type} | Request: ${requestId} | Time: ${new Date().toISOString()}`);
        
        // 即座にレスポンスを返す（Vercelのタイムアウト対策）
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
                console.log(`🔄 Starting job execution: ${requestId}`);
                
                // TwitterWorkerで実際の処理を実行
                if (!TwitterWorker) {
                    console.error('❌ TwitterWorker class not available - check Railway logs for initialization errors');
                    throw new Error('TwitterWorker class not available - service initialization failed');
                }
                
                const worker = new TwitterWorker();
                const result = await worker.processJob({ type, data, requestId });
                
                console.log(`✅ Job completed: ${requestId}`);
            } catch (error) {
                console.error(`❌ Job failed: ${requestId}`, error);
            }
        });
        
    } catch (error) {
        console.error('Worker execution error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ========== AI分析エンドポイント（将来実装） ==========
app.post('/api/worker/analysis', authenticateWorker, async (req, res) => {
    try {
        const { sourceId, analysisType, notifyDiscord } = req.body;
        
        console.log(`🤖 Analysis request: ${analysisType} for ${sourceId}`);
        
        res.json({ 
            success: true, 
            analysisStarted: true,
            sourceId: sourceId,
            analysisType: analysisType,
            message: 'AI analysis feature will be implemented in Phase 3'
        });
        
        // TODO: AI分析実装
        
    } catch (error) {
        console.error('Analysis execution error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ========== ジョブ状況確認 ==========
app.get('/api/worker/status/:jobId', authenticateWorker, async (req, res) => {
    try {
        const { jobId } = req.params;
        
        // TODO: Redis or Firestore からジョブ状況を取得
        res.json({ 
            jobId: jobId,
            status: 'pending', // pending, processing, completed, error
            message: 'Job status tracking will be implemented',
            timestamp: new Date()
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== 404ハンドラー ==========
app.use((req, res) => {
    res.status(404).json({ 
        error: 'Not Found',
        path: req.path,
        timestamp: new Date()
    });
});

// ========== エラーハンドリング ==========
app.use((error, req, res, next) => {
    console.error('🚨 Unhandled error:', error);
    res.status(500).json({ 
        error: 'Internal server error',
        requestId: req.headers['x-request-id'] || 'unknown',
        timestamp: new Date()
    });
});

// ========== メモリ使用量監視 ==========
const monitorMemory = () => {
    const usage = process.memoryUsage();
    const memoryMB = usage.heapUsed / 1024 / 1024;
    
    // Hobbyプラン（512MB）の80%を超えたら警告
    if (memoryMB > 410) {
        console.warn(`⚠️  High memory usage: ${memoryMB.toFixed(2)}MB`);
        
        // ガベージコレクションの実行（--expose-gcフラグが必要）
        if (global.gc) {
            console.log('🧹 Running garbage collection...');
            global.gc();
        }
    }
};

// 60秒ごとにメモリチェック
setInterval(monitorMemory, 60000);

// ========== Graceful Shutdown ==========
const gracefulShutdown = (signal) => {
    console.log(`\n🛑 ${signal} received. Starting graceful shutdown...`);
    
    // 新しいリクエストの受付を停止
    server.close(() => {
        console.log('✅ HTTP server closed');
        
        // TODO: 実行中のジョブの完了を待つ
        
        // TODO: データベース接続のクローズ
        
        console.log('👋 Graceful shutdown completed');
        process.exit(0);
    });
    
    // 30秒後に強制終了
    setTimeout(() => {
        console.error('❌ Forceful shutdown due to timeout');
        process.exit(1);
    }, 30000);
};

// シグナルハンドラー
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ========== サーバー起動 ==========
const server = app.listen(PORT, () => {
    console.log(`
🚀 Railway Worker Server Started
================================
Port: ${PORT}
Environment: ${process.env.NODE_ENV || 'development'}
Node Version: ${process.version}
Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB / ${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB
Time: ${new Date().toISOString()}
================================
    `);
});

// 未処理のPromiseエラーをキャッチ
process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('🚨 Uncaught Exception:', error);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});