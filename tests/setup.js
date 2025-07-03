// テスト環境のセットアップ
require('dotenv').config({ path: '.env.test' });

// テスト用の環境変数設定
process.env.NODE_ENV = 'test';
process.env.FIREBASE_PROJECT_ID = 'test-project';
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.TWITTER_API_KEY = 'test-twitter-key';
process.env.DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/test';
process.env.WORKER_SECRET = 'test-worker-secret';

// タイムアウト設定
jest.setTimeout(30000);

// グローバルなテストヘルパー
global.mockTimestamp = () => ({
    toDate: () => new Date('2025-01-01T00:00:00Z'),
    seconds: 1735689600,
    nanoseconds: 0
});

global.mockFirestoreDoc = (data) => ({
    id: 'mock-doc-id',
    exists: () => true,
    data: () => data,
    ref: { 
        path: 'mock-collection/mock-doc-id',
        update: jest.fn().mockResolvedValue(),
        delete: jest.fn().mockResolvedValue()
    }
});

global.mockFirestoreSnapshot = (docs) => ({
    empty: docs.length === 0,
    size: docs.length,
    docs: docs,
    forEach: (callback) => docs.forEach(callback)
});

// コンソールログのモック（テスト出力をクリーンに）
global.console = {
    ...console,
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};