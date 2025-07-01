const request = require('supertest');
const express = require('express');

// Express アプリケーションのセットアップをテスト用にモック
const app = express();
app.use(express.json());

// Firebase モック
const mockFirestore = {
    collection: jest.fn(),
    doc: jest.fn(),
    getDocs: jest.fn(),
    getDoc: jest.fn(),
    addDoc: jest.fn(),
    updateDoc: jest.fn(),
    deleteDoc: jest.fn(),
    query: jest.fn(),
    where: jest.fn(),
    orderBy: jest.fn(),
    limit: jest.fn()
};

// 実際のサーバーファイルからAPIエンドポイントを抽象化してテスト
jest.mock('firebase/firestore', () => ({
    getFirestore: () => mockFirestore,
    collection: jest.fn(),
    doc: jest.fn(),
    getDocs: jest.fn(),
    getDoc: jest.fn(),
    addDoc: jest.fn(),
    updateDoc: jest.fn(),
    deleteDoc: jest.fn(),
    query: jest.fn(),
    where: jest.fn(),
    orderBy: jest.fn(),
    limit: jest.fn()
}));

jest.mock('firebase/app', () => ({
    initializeApp: jest.fn()
}));

jest.mock('axios');

describe('ChatGPT Analysis API Endpoints', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        
        // 環境変数設定
        process.env.FIREBASE_API_KEY = 'test-key';
        process.env.FIREBASE_PROJECT_ID = 'test-project';
        process.env.RAILWAY_WORKER_URL = 'https://test-worker.railway.app';
        process.env.WORKER_SECRET = 'test-secret';
    });

    describe('Template Management', () => {
        // テンプレート作成のテスト
        test('POST /api/analysis/templates - should create template successfully', async () => {
            const templateData = {
                name: 'Test Template',
                category: 'sentiment',
                description: 'Test description',
                prompt: 'Analyze {{tweets}}',
                maxTokens: 2000,
                temperature: 0.7
            };

            const mockDocRef = { id: 'template-123' };
            const { addDoc, collection } = require('firebase/firestore');
            addDoc.mockResolvedValue(mockDocRef);
            collection.mockReturnValue('mocked-collection');

            // テスト用APIエンドポイント
            app.post('/api/analysis/templates', async (req, res) => {
                try {
                    const { name, category, description, prompt, maxTokens, temperature } = req.body;
                    
                    if (!name || !category || !prompt) {
                        return res.status(400).json({
                            success: false,
                            error: 'Name, category, and prompt are required'
                        });
                    }
                    
                    const template = {
                        name,
                        category,
                        description: description || '',
                        prompt,
                        maxTokens: maxTokens || 2000,
                        temperature: temperature || 0.7,
                        active: true,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                        usage: {
                            totalRuns: 0,
                            lastUsed: null
                        }
                    };
                    
                    const docRef = await addDoc(collection(mockFirestore, 'analysis_templates'), template);
                    
                    res.json({ 
                        success: true, 
                        id: docRef.id,
                        template: template
                    });
                } catch (error) {
                    res.status(500).json({ 
                        success: false, 
                        error: error.message 
                    });
                }
            });

            const response = await request(app)
                .post('/api/analysis/templates')
                .send(templateData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.id).toBe('template-123');
            expect(response.body.template.name).toBe('Test Template');
            expect(addDoc).toHaveBeenCalledWith(
                'mocked-collection',
                expect.objectContaining({
                    name: 'Test Template',
                    category: 'sentiment',
                    prompt: 'Analyze {{tweets}}'
                })
            );
        });

        test('POST /api/analysis/templates - should fail with missing required fields', async () => {
            const incompleteData = {
                name: 'Test Template'
                // missing category and prompt
            };

            app.post('/api/analysis/templates', async (req, res) => {
                const { name, category, prompt } = req.body;
                
                if (!name || !category || !prompt) {
                    return res.status(400).json({
                        success: false,
                        error: 'Name, category, and prompt are required'
                    });
                }
                
                res.json({ success: true });
            });

            const response = await request(app)
                .post('/api/analysis/templates')
                .send(incompleteData)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Name, category, and prompt are required');
        });

        test('GET /api/analysis/templates - should return templates list', async () => {
            const mockTemplates = [
                {
                    id: 'template-1',
                    name: 'Sentiment Analysis',
                    category: 'sentiment',
                    createdAt: new Date(),
                    usage: { totalRuns: 5 }
                },
                {
                    id: 'template-2',
                    name: 'Trend Analysis',
                    category: 'trend',
                    createdAt: new Date(),
                    usage: { totalRuns: 2 }
                }
            ];

            const { getDocs, query, collection, orderBy } = require('firebase/firestore');
            const mockSnapshot = {
                forEach: jest.fn((callback) => {
                    mockTemplates.forEach((template, index) => {
                        callback({
                            id: template.id,
                            data: () => template
                        });
                    });
                })
            };

            getDocs.mockResolvedValue(mockSnapshot);
            query.mockReturnValue('mocked-query');
            collection.mockReturnValue('mocked-collection');
            orderBy.mockReturnValue('mocked-order');

            app.get('/api/analysis/templates', async (req, res) => {
                try {
                    const templatesRef = collection(mockFirestore, 'analysis_templates');
                    const templatesQuery = query(templatesRef, orderBy('createdAt', 'desc'));
                    const snapshot = await getDocs(templatesQuery);
                    
                    const templates = [];
                    snapshot.forEach(doc => {
                        templates.push({
                            id: doc.id,
                            ...doc.data()
                        });
                    });
                    
                    res.json({ success: true, templates });
                } catch (error) {
                    res.status(500).json({ 
                        success: false, 
                        error: error.message 
                    });
                }
            });

            const response = await request(app)
                .get('/api/analysis/templates')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.templates).toHaveLength(2);
            expect(response.body.templates[0].name).toBe('Sentiment Analysis');
            expect(response.body.templates[1].name).toBe('Trend Analysis');
        });
    });

    describe('Analysis Settings', () => {
        test('GET /api/analysis/lists/:listId/settings - should return list analysis settings', async () => {
            const listId = 'list-123';
            const mockListData = {
                name: 'Test List',
                analysis: {
                    enabled: true,
                    templateId: 'template-123',
                    frequency: 'daily',
                    minTweets: 10,
                    maxTweets: 100
                }
            };

            const { getDoc, doc } = require('firebase/firestore');
            const mockDoc = {
                exists: () => true,
                data: () => mockListData
            };

            getDoc.mockResolvedValue(mockDoc);
            doc.mockReturnValue('mocked-doc-ref');

            app.get('/api/analysis/lists/:listId/settings', async (req, res) => {
                try {
                    const { listId } = req.params;
                    const listRef = doc(mockFirestore, 'twitter_lists', listId);
                    const listDoc = await getDoc(listRef);
                    
                    if (!listDoc.exists()) {
                        return res.status(404).json({
                            success: false,
                            error: 'List not found'
                        });
                    }
                    
                    const listData = listDoc.data();
                    const analysisSettings = listData.analysis || {
                        enabled: false,
                        templateId: null,
                        frequency: 'daily',
                        minTweets: 5,
                        maxTweets: 50,
                        lastAnalyzed: null
                    };
                    
                    res.json({ 
                        success: true, 
                        settings: analysisSettings 
                    });
                } catch (error) {
                    res.status(500).json({ 
                        success: false, 
                        error: error.message 
                    });
                }
            });

            const response = await request(app)
                .get(`/api/analysis/lists/${listId}/settings`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.settings.enabled).toBe(true);
            expect(response.body.settings.templateId).toBe('template-123');
            expect(response.body.settings.frequency).toBe('daily');
        });

        test('PUT /api/analysis/lists/:listId/settings - should update analysis settings', async () => {
            const listId = 'list-123';
            const updateData = {
                enabled: true,
                templateId: 'template-456',
                frequency: 'hourly',
                minTweets: 15,
                maxTweets: 75
            };

            const { updateDoc, doc } = require('firebase/firestore');
            updateDoc.mockResolvedValue();
            doc.mockReturnValue('mocked-doc-ref');

            app.put('/api/analysis/lists/:listId/settings', async (req, res) => {
                try {
                    const { listId } = req.params;
                    const { enabled, templateId, frequency, minTweets, maxTweets } = req.body;
                    
                    const analysisSettings = {
                        enabled: enabled || false,
                        templateId: templateId || null,
                        frequency: frequency || 'daily',
                        minTweets: minTweets || 5,
                        maxTweets: maxTweets || 50,
                        updatedAt: new Date()
                    };
                    
                    const listRef = doc(mockFirestore, 'twitter_lists', listId);
                    await updateDoc(listRef, { 
                        analysis: analysisSettings,
                        updatedAt: new Date()
                    });
                    
                    res.json({ success: true, settings: analysisSettings });
                } catch (error) {
                    res.status(500).json({ 
                        success: false, 
                        error: error.message 
                    });
                }
            });

            const response = await request(app)
                .put(`/api/analysis/lists/${listId}/settings`)
                .send(updateData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.settings.enabled).toBe(true);
            expect(response.body.settings.templateId).toBe('template-456');
            expect(response.body.settings.frequency).toBe('hourly');
            expect(updateDoc).toHaveBeenCalledWith(
                'mocked-doc-ref',
                expect.objectContaining({
                    analysis: expect.objectContaining({
                        enabled: true,
                        templateId: 'template-456',
                        frequency: 'hourly'
                    })
                })
            );
        });
    });

    describe('Manual Analysis', () => {
        test('POST /api/analysis/manual/:listId - should submit manual analysis job', async () => {
            const listId = 'list-123';
            const requestData = {
                templateId: 'template-456'
            };

            const axios = require('axios');
            axios.post.mockResolvedValue({
                status: 200,
                data: { success: true }
            });

            app.post('/api/analysis/manual/:listId', async (req, res) => {
                try {
                    const { listId } = req.params;
                    const { templateId } = req.body;
                    
                    if (!templateId) {
                        return res.status(400).json({
                            success: false,
                            error: 'Template ID is required'
                        });
                    }
                    
                    const workerUrl = process.env.RAILWAY_WORKER_URL;
                    const workerSecret = process.env.WORKER_SECRET;
                    
                    if (!workerUrl || !workerSecret) {
                        return res.status(500).json({
                            success: false,
                            error: 'Railway Worker not configured'
                        });
                    }
                    
                    const jobData = {
                        type: 'manual_analysis',
                        data: {
                            listId,
                            templateId,
                            requestedBy: 'manual',
                            requestedAt: new Date().toISOString()
                        },
                        requestId: `manual-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`
                    };
                    
                    await axios.post(`${workerUrl}/job`, jobData, {
                        headers: {
                            'Authorization': `Bearer ${workerSecret}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 30000
                    });
                    
                    res.json({ 
                        success: true, 
                        jobId: jobData.requestId,
                        message: 'Analysis job submitted to Railway Worker'
                    });
                } catch (error) {
                    res.status(500).json({ 
                        success: false, 
                        error: error.message 
                    });
                }
            });

            const response = await request(app)
                .post(`/api/analysis/manual/${listId}`)
                .send(requestData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.jobId).toMatch(/^manual-\d+-\w+$/);
            expect(response.body.message).toBe('Analysis job submitted to Railway Worker');
            expect(axios.post).toHaveBeenCalledWith(
                'https://test-worker.railway.app/job',
                expect.objectContaining({
                    type: 'manual_analysis',
                    data: expect.objectContaining({
                        listId: 'list-123',
                        templateId: 'template-456'
                    })
                }),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'Authorization': 'Bearer test-secret'
                    })
                })
            );
        });

        test('POST /api/analysis/manual/:listId - should fail without template ID', async () => {
            const listId = 'list-123';
            const requestData = {}; // missing templateId

            app.post('/api/analysis/manual/:listId', async (req, res) => {
                const { templateId } = req.body;
                
                if (!templateId) {
                    return res.status(400).json({
                        success: false,
                        error: 'Template ID is required'
                    });
                }
                
                res.json({ success: true });
            });

            const response = await request(app)
                .post(`/api/analysis/manual/${listId}`)
                .send(requestData)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Template ID is required');
        });
    });

    describe('Analysis History', () => {
        test('GET /api/analysis/history - should return analysis history', async () => {
            const mockHistory = [
                {
                    id: 'analysis-1',
                    sourceId: 'list-123',
                    templateId: 'template-456',
                    status: 'completed',
                    createdAt: new Date(),
                    summary: 'Analysis completed successfully'
                },
                {
                    id: 'analysis-2',
                    sourceId: 'list-456',
                    templateId: 'template-789',
                    status: 'error',
                    createdAt: new Date(),
                    error: 'API quota exceeded'
                }
            ];

            const { getDocs, query, collection, orderBy, limit } = require('firebase/firestore');
            const mockSnapshot = {
                forEach: jest.fn((callback) => {
                    mockHistory.forEach((analysis) => {
                        callback({
                            id: analysis.id,
                            data: () => analysis
                        });
                    });
                })
            };

            getDocs.mockResolvedValue(mockSnapshot);
            query.mockReturnValue('mocked-query');
            collection.mockReturnValue('mocked-collection');
            orderBy.mockReturnValue('mocked-order');
            limit.mockReturnValue('mocked-limit');

            app.get('/api/analysis/history', async (req, res) => {
                try {
                    const { limit: queryLimit } = req.query;
                    const limitCount = parseInt(queryLimit) || 20;
                    
                    const analysisQuery = query(
                        collection(mockFirestore, 'ai_analysis'),
                        orderBy('createdAt', 'desc'),
                        limit(limitCount)
                    );
                    
                    const snapshot = await getDocs(analysisQuery);
                    
                    const history = [];
                    snapshot.forEach(doc => {
                        history.push({
                            id: doc.id,
                            ...doc.data()
                        });
                    });
                    
                    res.json({ success: true, history });
                } catch (error) {
                    res.status(500).json({ 
                        success: false, 
                        error: error.message 
                    });
                }
            });

            const response = await request(app)
                .get('/api/analysis/history?limit=10')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.history).toHaveLength(2);
            expect(response.body.history[0].id).toBe('analysis-1');
            expect(response.body.history[0].status).toBe('completed');
            expect(response.body.history[1].id).toBe('analysis-2');
            expect(response.body.history[1].status).toBe('error');
        });
    });
});