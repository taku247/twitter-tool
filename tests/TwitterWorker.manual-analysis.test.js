const TwitterWorker = require('../railway-worker/workers/TwitterWorker');
const ChatGPTAnalyzer = require('../railway-worker/workers/ChatGPTAnalyzer');
const AnalysisTemplateManager = require('../railway-worker/workers/AnalysisTemplateManager');

// Mock dependencies
jest.mock('../railway-worker/workers/ChatGPTAnalyzer');
jest.mock('../railway-worker/workers/AnalysisTemplateManager');
jest.mock('firebase/app');
jest.mock('firebase/firestore');

describe('TwitterWorker - Manual Analysis', () => {
    let worker;
    let mockDb;
    let mockChatGPTAnalyzer;
    let mockTemplateManager;

    beforeEach(() => {
        // Mock Firebase
        mockDb = {
            collection: jest.fn(),
            doc: jest.fn()
        };

        // Mock ChatGPTAnalyzer
        mockChatGPTAnalyzer = {
            analyze: jest.fn()
        };
        ChatGPTAnalyzer.mockImplementation(() => mockChatGPTAnalyzer);

        // Mock AnalysisTemplateManager
        mockTemplateManager = {
            getById: jest.fn()
        };
        AnalysisTemplateManager.mockImplementation(() => mockTemplateManager);

        // Mock environment variables
        process.env.OPENAI_API_KEY = 'test-api-key';
        process.env.FIREBASE_API_KEY = 'test-firebase-key';
        process.env.FIREBASE_AUTH_DOMAIN = 'test.firebaseapp.com';
        process.env.FIREBASE_PROJECT_ID = 'test-project';
        process.env.FIREBASE_STORAGE_BUCKET = 'test.appspot.com';
        process.env.FIREBASE_MESSAGING_SENDER_ID = '123456789';
        process.env.FIREBASE_APP_ID = '1:123456789:web:abcdef';

        worker = new TwitterWorker();
        worker.db = mockDb;
        worker.isInitialized = true;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('processManualAnalysis', () => {
        test('should process manual analysis successfully', async () => {
            const testData = {
                listId: 'list-123',
                templateId: 'template-456',
                requestedBy: 'user@example.com',
                requestedAt: '2024-01-01T12:00:00Z'
            };

            const mockListData = {
                name: 'Test List',
                twitterListId: '12345',
                analysis: {
                    enabled: true,
                    templateId: 'template-456'
                }
            };

            const mockTemplate = {
                id: 'template-456',
                name: 'Sentiment Analysis',
                category: 'sentiment',
                prompt: 'Analyze sentiment of {{tweets}}'
            };

            const mockAnalysisResult = {
                analysisId: 'analysis-789',
                summary: 'Positive sentiment detected',
                tweetCount: 25,
                tokensUsed: 1500,
                csvPath: '/reports/2024/01/analysis-789.csv'
            };

            // Mock Firebase operations
            const { getDoc, doc, updateDoc, Timestamp } = require('firebase/firestore');
            const mockListDoc = {
                exists: () => true,
                data: () => mockListData
            };

            getDoc.mockResolvedValue(mockListDoc);
            doc.mockReturnValue('mocked-doc-ref');
            updateDoc.mockResolvedValue();
            Timestamp.now = jest.fn(() => ({ toDate: () => new Date() }));

            // Mock template manager
            mockTemplateManager.getById.mockResolvedValue(mockTemplate);

            // Mock ChatGPT analyzer
            mockChatGPTAnalyzer.analyze.mockResolvedValue(mockAnalysisResult);

            const result = await worker.processManualAnalysis(testData);

            expect(result.success).toBe(true);
            expect(result.analysisId).toBe('analysis-789');
            expect(result.listName).toBe('Test List');
            expect(result.templateName).toBe('Sentiment Analysis');
            expect(result.summary).toBe('Positive sentiment detected');
            expect(result.tweetCount).toBe(25);
            expect(result.tokensUsed).toBe(1500);

            // Verify Firebase operations
            expect(getDoc).toHaveBeenCalledWith('mocked-doc-ref');
            expect(doc).toHaveBeenCalledWith(mockDb, 'twitter_lists', 'list-123');

            // Verify template retrieval
            expect(mockTemplateManager.getById).toHaveBeenCalledWith('template-456');

            // Verify analysis execution
            expect(mockChatGPTAnalyzer.analyze).toHaveBeenCalledWith(
                'list-123',
                mockListData,
                'template-456',
                {
                    manualRequest: true,
                    requestedBy: 'user@example.com',
                    requestedAt: '2024-01-01T12:00:00Z'
                }
            );

            // Verify list update
            expect(updateDoc).toHaveBeenCalledWith(
                'mocked-doc-ref',
                expect.objectContaining({
                    'analysis.lastAnalyzed': expect.any(Object),
                    updatedAt: expect.any(Object)
                })
            );
        });

        test('should fail with missing parameters', async () => {
            const incompleteData = {
                listId: 'list-123'
                // missing templateId
            };

            await expect(worker.processManualAnalysis(incompleteData))
                .rejects
                .toThrow('Missing required parameters: listId and templateId');
        });

        test('should fail when list not found', async () => {
            const testData = {
                listId: 'nonexistent-list',
                templateId: 'template-456'
            };

            const { getDoc } = require('firebase/firestore');
            const mockListDoc = {
                exists: () => false
            };

            getDoc.mockResolvedValue(mockListDoc);

            await expect(worker.processManualAnalysis(testData))
                .rejects
                .toThrow('List not found: nonexistent-list');

            expect(mockTemplateManager.getById).not.toHaveBeenCalled();
            expect(mockChatGPTAnalyzer.analyze).not.toHaveBeenCalled();
        });

        test('should fail when template not found', async () => {
            const testData = {
                listId: 'list-123',
                templateId: 'nonexistent-template'
            };

            const mockListData = {
                name: 'Test List',
                analysis: { enabled: true }
            };

            const { getDoc } = require('firebase/firestore');
            const mockListDoc = {
                exists: () => true,
                data: () => mockListData
            };

            getDoc.mockResolvedValue(mockListDoc);
            mockTemplateManager.getById.mockResolvedValue(null);

            await expect(worker.processManualAnalysis(testData))
                .rejects
                .toThrow('Template not found: nonexistent-template');

            expect(mockTemplateManager.getById).toHaveBeenCalledWith('nonexistent-template');
            expect(mockChatGPTAnalyzer.analyze).not.toHaveBeenCalled();
        });

        test('should fail when ChatGPT analysis fails', async () => {
            const testData = {
                listId: 'list-123',
                templateId: 'template-456'
            };

            const mockListData = {
                name: 'Test List',
                analysis: { enabled: true }
            };

            const mockTemplate = {
                id: 'template-456',
                name: 'Test Template'
            };

            const { getDoc } = require('firebase/firestore');
            const mockListDoc = {
                exists: () => true,
                data: () => mockListData
            };

            getDoc.mockResolvedValue(mockListDoc);
            mockTemplateManager.getById.mockResolvedValue(mockTemplate);
            mockChatGPTAnalyzer.analyze.mockRejectedValue(new Error('OpenAI API quota exceeded'));

            await expect(worker.processManualAnalysis(testData))
                .rejects
                .toThrow('OpenAI API quota exceeded');

            expect(mockTemplateManager.getById).toHaveBeenCalledWith('template-456');
            expect(mockChatGPTAnalyzer.analyze).toHaveBeenCalled();
        });

        test('should handle list without analysis settings', async () => {
            const testData = {
                listId: 'list-123',
                templateId: 'template-456'
            };

            const mockListData = {
                name: 'Test List',
                twitterListId: '12345'
                // no analysis field
            };

            const mockTemplate = {
                id: 'template-456',
                name: 'Test Template'
            };

            const mockAnalysisResult = {
                analysisId: 'analysis-789',
                summary: 'Analysis completed',
                tweetCount: 10,
                tokensUsed: 800,
                csvPath: '/reports/analysis-789.csv'
            };

            const { getDoc, updateDoc } = require('firebase/firestore');
            const mockListDoc = {
                exists: () => true,
                data: () => mockListData
            };

            getDoc.mockResolvedValue(mockListDoc);
            updateDoc.mockResolvedValue();
            mockTemplateManager.getById.mockResolvedValue(mockTemplate);
            mockChatGPTAnalyzer.analyze.mockResolvedValue(mockAnalysisResult);

            const result = await worker.processManualAnalysis(testData);

            expect(result.success).toBe(true);
            expect(result.analysisId).toBe('analysis-789');

            // Should not call updateDoc for analysis.lastAnalyzed since no analysis field
            expect(updateDoc).not.toHaveBeenCalled();
        });
    });

    describe('processJob - manual_analysis type', () => {
        test('should process manual analysis job through main job handler', async () => {
            const jobData = {
                type: 'manual_analysis',
                data: {
                    listId: 'list-123',
                    templateId: 'template-456',
                    requestedBy: 'test-user'
                },
                requestId: 'manual-req-123'
            };

            const mockResult = {
                success: true,
                analysisId: 'analysis-789',
                listName: 'Test List',
                templateName: 'Test Template'
            };

            // Mock processManualAnalysis
            jest.spyOn(worker, 'processManualAnalysis').mockResolvedValue(mockResult);
            jest.spyOn(worker, 'logJobExecution').mockResolvedValue();

            const result = await worker.processJob(jobData);

            expect(result.success).toBe(true);
            expect(result.result).toEqual(mockResult);
            expect(worker.processManualAnalysis).toHaveBeenCalledWith(jobData.data);
            expect(worker.logJobExecution).toHaveBeenCalledWith(
                'manual_analysis',
                'manual-req-123',
                'success',
                mockResult,
                expect.any(Number)
            );
        });

        test('should handle manual analysis job failure', async () => {
            const jobData = {
                type: 'manual_analysis',
                data: {
                    listId: 'list-123',
                    templateId: 'template-456'
                },
                requestId: 'manual-req-123'
            };

            const errorMessage = 'Analysis failed due to insufficient tweets';

            // Mock processManualAnalysis to throw error
            jest.spyOn(worker, 'processManualAnalysis').mockRejectedValue(new Error(errorMessage));
            jest.spyOn(worker, 'logJobExecution').mockResolvedValue();

            await expect(worker.processJob(jobData))
                .rejects
                .toThrow(errorMessage);

            expect(worker.processManualAnalysis).toHaveBeenCalledWith(jobData.data);
            expect(worker.logJobExecution).toHaveBeenCalledWith(
                'manual_analysis',
                'manual-req-123',
                'error',
                { error: errorMessage },
                expect.any(Number)
            );
        });
    });
});