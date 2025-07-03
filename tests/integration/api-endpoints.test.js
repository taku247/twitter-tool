// APIエンドポイント 統合テスト

const request = require('supertest');
const express = require('express');
const { mockFirebaseClient, setupSuccessfulFirestoreMocks, resetFirebaseMocks } = require('../mocks/firebase');
const { mockAxios, setupSuccessfulTwitterAPIMock, setupSuccessfulRailwayWorkerMock, resetAPIMocks } = require('../mocks/apis');
const { sampleTweets, sampleTwitterLists, sampleTemplates, sampleAnalysisResults } = require('../fixtures/sampleData');

// Express アプリケーションのモック設定
const createTestApp = () => {
    const app = express();
    app.use(express.json());
    
    // ミドルウェアの設定
    app.use((req, res, next) => {
        req.db = mockFirebaseClient;
        next();
    });
    
    // 実際のルートファイルをモック
    jest.doMock('../../api/lists/index', () => require('./mocks/api-routes'));
    jest.doMock('../../api/analysis/index', () => require('./mocks/api-routes'));
    jest.doMock('../../api/templates/index', () => require('./mocks/api-routes'));
    
    return app;
};

// ヘルパー関数
const mockFirestoreDoc = (data) => ({
    exists: () => !!data,
    data: () => data,
    id: data?.id || 'mock-doc-id'
});

const mockFirestoreSnapshot = (docs) => ({
    docs: docs,
    empty: docs.length === 0,
    size: docs.length
});

describe('API Endpoints Integration Tests', () => {
    let app;

    beforeAll(() => {
        app = createTestApp();
    });

    beforeEach(() => {
        resetFirebaseMocks();
        resetAPIMocks();
        setupSuccessfulFirestoreMocks();
    });

    describe('GET /api/lists', () => {
        it('リスト一覧を取得できる', async () => {
            const listDocs = sampleTwitterLists.map(list => mockFirestoreDoc(list));
            mockFirebaseClient.getDocs.mockResolvedValue(
                mockFirestoreSnapshot(listDocs)
            );

            const response = await request(app)
                .get('/api/lists')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.lists).toHaveLength(1);
            expect(response.body.lists[0]).toHaveProperty('name', 'AI Tech List');
        });

        it('空のリストも正常に処理する', async () => {
            mockFirebaseClient.getDocs.mockResolvedValue(
                mockFirestoreSnapshot([])
            );

            const response = await request(app)
                .get('/api/lists')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.lists).toHaveLength(0);
        });

        it('データベースエラーを適切に処理する', async () => {
            mockFirebaseClient.getDocs.mockRejectedValue(
                new Error('Firestore connection failed')
            );

            const response = await request(app)
                .get('/api/lists')
                .expect(500);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('Firestore connection failed');
        });
    });

    describe('GET /api/lists/:id', () => {
        it('特定のリストを取得できる', async () => {
            mockFirebaseClient.getDoc.mockResolvedValue(
                mockFirestoreDoc(sampleTwitterLists[0])
            );

            const response = await request(app)
                .get('/api/lists/list-doc-123')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.list).toHaveProperty('name', 'AI Tech List');
            expect(response.body.list).toHaveProperty('analysis');
        });

        it('存在しないリストIDは404エラー', async () => {
            mockFirebaseClient.getDoc.mockResolvedValue({
                exists: () => false
            });

            const response = await request(app)
                .get('/api/lists/non-existent-list')
                .expect(404);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('List not found');
        });
    });

    describe('PUT /api/lists/:id/analysis', () => {
        it('リストの分析設定を更新できる', async () => {
            mockFirebaseClient.getDoc.mockResolvedValue(
                mockFirestoreDoc(sampleTwitterLists[0])
            );
            mockFirebaseClient.updateDoc.mockResolvedValue();

            const updateData = {
                enabled: true,
                templateId: 'template-123',
                frequency: 'daily',
                minTweets: 10
            };

            const response = await request(app)
                .put('/api/lists/list-doc-123/analysis')
                .send(updateData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(mockFirebaseClient.updateDoc).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    analysis: expect.objectContaining(updateData)
                })
            );
        });

        it('無効なパラメータはバリデーションエラー', async () => {
            const invalidData = {
                enabled: 'invalid', // boolean以外
                minTweets: -1 // 負の値
            };

            const response = await request(app)
                .put('/api/lists/list-doc-123/analysis')
                .send(invalidData)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('Validation error');
        });
    });

    describe('POST /api/analysis/execute/:listId', () => {
        beforeEach(() => {
            setupSuccessfulRailwayWorkerMock();
            mockFirebaseClient.getDoc.mockResolvedValue(
                mockFirestoreDoc(sampleTwitterLists[0])
            );
        });

        it('手動分析を実行できる', async () => {
            const response = await request(app)
                .post('/api/analysis/execute/list-doc-123')
                .send({
                    templateId: 'template-123',
                    requestedBy: 'manual'
                })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toContain('Analysis started');
            expect(response.body.requestId).toBeDefined();
        });

        it('必須パラメータがない場合はエラー', async () => {
            const response = await request(app)
                .post('/api/analysis/execute/list-doc-123')
                .send({}) // templateId がない
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('templateId is required');
        });

        it('Railway Worker接続エラーを処理する', async () => {
            mockAxios.post.mockRejectedValue(
                new Error('Railway Worker connection failed')
            );

            const response = await request(app)
                .post('/api/analysis/execute/list-doc-123')
                .send({
                    templateId: 'template-123',
                    requestedBy: 'manual'
                })
                .expect(500);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('Railway Worker connection failed');
        });
    });

    describe('GET /api/analysis/results', () => {
        it('分析結果一覧を取得できる', async () => {
            const resultDocs = sampleAnalysisResults.map(result => mockFirestoreDoc(result));
            mockFirebaseClient.getDocs.mockResolvedValue(
                mockFirestoreSnapshot(resultDocs)
            );

            const response = await request(app)
                .get('/api/analysis/results')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.results).toHaveLength(1);
            expect(response.body.results[0]).toHaveProperty('analysisId');
            expect(response.body.results[0]).toHaveProperty('status', 'completed');
        });

        it('リストIDでフィルタリングできる', async () => {
            const filteredResults = sampleAnalysisResults.filter(r => r.sourceId === 'list-doc-123');
            const resultDocs = filteredResults.map(result => mockFirestoreDoc(result));
            mockFirebaseClient.getDocs.mockResolvedValue(
                mockFirestoreSnapshot(resultDocs)
            );

            const response = await request(app)
                .get('/api/analysis/results?listId=list-doc-123')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.results).toHaveLength(1);
            expect(response.body.results[0].sourceId).toBe('list-doc-123');
        });

        it('期間でフィルタリングできる', async () => {
            const response = await request(app)
                .get('/api/analysis/results?from=2025-01-01&to=2025-01-31')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(mockFirebaseClient.getDocs).toHaveBeenCalledWith(
                expect.anything()
            );
        });
    });

    describe('GET /api/templates', () => {
        it('テンプレート一覧を取得できる', async () => {
            const templateDocs = sampleTemplates.map(template => mockFirestoreDoc(template));
            mockFirebaseClient.getDocs.mockResolvedValue(
                mockFirestoreSnapshot(templateDocs)
            );

            const response = await request(app)
                .get('/api/templates')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.templates).toHaveLength(2);
            expect(response.body.templates[0]).toHaveProperty('name');
            expect(response.body.templates[0]).toHaveProperty('category');
        });

        it('アクティブなテンプレートのみ取得できる', async () => {
            const activeTemplates = sampleTemplates.filter(t => t.active);
            const templateDocs = activeTemplates.map(template => mockFirestoreDoc(template));
            mockFirebaseClient.getDocs.mockResolvedValue(
                mockFirestoreSnapshot(templateDocs)
            );

            const response = await request(app)
                .get('/api/templates?active=true')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.templates.every(t => t.active)).toBe(true);
        });
    });

    describe('POST /api/templates', () => {
        it('新しいテンプレートを作成できる', async () => {
            mockFirebaseClient.addDoc.mockResolvedValue({ id: 'new-template-id' });

            const newTemplate = {
                name: 'New Test Template',
                category: 'custom',
                prompt: 'Test prompt: {{ tweets }}',
                description: 'Test template description'
            };

            const response = await request(app)
                .post('/api/templates')
                .send(newTemplate)
                .expect(201);

            expect(response.body.success).toBe(true);
            expect(response.body.templateId).toBe('new-template-id');
            expect(mockFirebaseClient.addDoc).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    name: 'New Test Template',
                    category: 'custom',
                    active: true
                })
            );
        });

        it('必須フィールドのバリデーション', async () => {
            const incompleteTemplate = {
                name: 'Incomplete Template'
                // prompt が不足
            };

            const response = await request(app)
                .post('/api/templates')
                .send(incompleteTemplate)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('prompt is required');
        });

        it('プロンプトのプレースホルダーをバリデーション', async () => {
            const invalidTemplate = {
                name: 'Invalid Template',
                prompt: 'This prompt has no placeholders', // {{ tweets }} がない
                category: 'custom'
            };

            const response = await request(app)
                .post('/api/templates')
                .send(invalidTemplate)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('{{ tweets }}');
        });
    });

    describe('PUT /api/templates/:id', () => {
        it('既存のテンプレートを更新できる', async () => {
            mockFirebaseClient.getDoc.mockResolvedValue(
                mockFirestoreDoc(sampleTemplates[0])
            );
            mockFirebaseClient.updateDoc.mockResolvedValue();

            const updateData = {
                name: 'Updated Template Name',
                temperature: 0.8,
                maxTokens: 1500
            };

            const response = await request(app)
                .put('/api/templates/template-sentiment')
                .send(updateData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(mockFirebaseClient.updateDoc).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    name: 'Updated Template Name',
                    temperature: 0.8,
                    maxTokens: 1500
                })
            );
        });

        it('存在しないテンプレートIDは404エラー', async () => {
            mockFirebaseClient.getDoc.mockResolvedValue({
                exists: () => false
            });

            const response = await request(app)
                .put('/api/templates/non-existent-template')
                .send({ name: 'Updated Name' })
                .expect(404);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Template not found');
        });
    });

    describe('GET /api/debug/tweets/:listId', () => {
        it('デバッグ用ツイート情報を取得できる', async () => {
            const tweetDocs = sampleTweets.map(tweet => mockFirestoreDoc(tweet));
            mockFirebaseClient.getDocs.mockResolvedValue(
                mockFirestoreSnapshot(tweetDocs)
            );

            const response = await request(app)
                .get('/api/debug/tweets/list-doc-123')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.totalTweets).toBe(3);
            expect(response.body.recentTweets).toHaveLength(3);
            expect(response.body.dateRange).toHaveProperty('oldest');
            expect(response.body.dateRange).toHaveProperty('newest');
        });

        it('ツイートが存在しない場合の処理', async () => {
            mockFirebaseClient.getDocs.mockResolvedValue(
                mockFirestoreSnapshot([])
            );

            const response = await request(app)
                .get('/api/debug/tweets/empty-list')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.totalTweets).toBe(0);
            expect(response.body.recentTweets).toHaveLength(0);
        });
    });

    describe('POST /api/worker/execute', () => {
        it('Railway Workerジョブを実行できる', async () => {
            setupSuccessfulRailwayWorkerMock();

            const jobData = {
                type: 'manual_analysis',
                data: {
                    listId: 'list-doc-123',
                    templateId: 'template-123'
                }
            };

            const response = await request(app)
                .post('/api/worker/execute')
                .send(jobData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.accepted).toBe(true);
            expect(response.body.requestId).toBeDefined();
        });

        it('無効なジョブタイプはエラー', async () => {
            const invalidJob = {
                type: 'invalid_job_type',
                data: {}
            };

            const response = await request(app)
                .post('/api/worker/execute')
                .send(invalidJob)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('Invalid job type');
        });
    });

    describe('エラーハンドリング', () => {
        it('JSON解析エラーを適切に処理する', async () => {
            const response = await request(app)
                .post('/api/templates')
                .send('{ invalid json')
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('Invalid JSON');
        });

        it('レート制限エラーを適切に処理する', async () => {
            mockFirebaseClient.getDocs.mockRejectedValue({
                code: 'resource-exhausted',
                message: 'Quota exceeded'
            });

            const response = await request(app)
                .get('/api/lists')
                .expect(429);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('Rate limit exceeded');
        });

        it('認証エラーを適切に処理する', async () => {
            mockFirebaseClient.getDocs.mockRejectedValue({
                code: 'permission-denied',
                message: 'Permission denied'
            });

            const response = await request(app)
                .get('/api/lists')
                .expect(403);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('Permission denied');
        });
    });
});