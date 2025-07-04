const TwitterWorker = require('../railway-worker/workers/TwitterWorker');
const ChatGPTAnalyzer = require('../railway-worker/workers/ChatGPTAnalyzer');
const AnalysisTemplateManager = require('../railway-worker/workers/AnalysisTemplateManager');

// Mock dependencies
jest.mock('../railway-worker/workers/ChatGPTAnalyzer');
jest.mock('../railway-worker/workers/AnalysisTemplateManager');
jest.mock('firebase/app');
jest.mock('firebase/firestore');
jest.mock('axios');

describe('TwitterWorker - ChatGPT Integration', () => {
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
        delete process.env.OPENAI_API_KEY;
    });

    describe('shouldRunAnalysis', () => {
        test('should return false when analysis is not enabled', async () => {
            const listData = {
                name: 'Test List',
                analysis: { enabled: false }
            };

            const result = await worker.shouldRunAnalysis(listData, 'list-123');

            expect(result.should).toBe(false);
            expect(result.reason).toBe('Analysis not enabled');
        });

        test('should return false when OpenAI API key is not set', async () => {
            delete process.env.OPENAI_API_KEY;

            const listData = {
                name: 'Test List',
                analysis: { enabled: true }
            };

            const result = await worker.shouldRunAnalysis(listData, 'list-123');

            expect(result.should).toBe(false);
            expect(result.reason).toBe('OpenAI API key not configured');
        });

        test('should return false when template is not found', async () => {
            mockTemplateManager.getById.mockResolvedValue(null);

            const listData = {
                name: 'Test List',
                analysis: {
                    enabled: true,
                    templateId: 'template-123'
                }
            };

            const result = await worker.shouldRunAnalysis(listData, 'list-123');

            expect(result.should).toBe(false);
            expect(result.reason).toBe('Template not found');
        });

        test('should return true when all conditions are met', async () => {
            mockTemplateManager.getById.mockResolvedValue({
                id: 'template-123',
                name: 'Test Template'
            });

            // Mock getUnanalyzedTweetCount
            jest.spyOn(worker, 'getUnanalyzedTweetCount').mockResolvedValue(10);

            const listData = {
                name: 'Test List',
                analysis: {
                    enabled: true,
                    templateId: 'template-123',
                    minTweets: 5,
                    maxTweets: 50
                }
            };

            const result = await worker.shouldRunAnalysis(listData, 'list-123');

            expect(result.should).toBe(true);
            expect(result.templateId).toBe('template-123');
            expect(result.options.minTweets).toBe(5);
            expect(result.options.maxTweets).toBe(50);
        });
    });

    describe('shouldRunByFrequency', () => {
        test('should allow hourly analysis after 1 hour', () => {
            const oneHourAgo = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
            const result = worker.shouldRunByFrequency(oneHourAgo, 'hourly');
            expect(result).toBe(true);
        });

        test('should prevent hourly analysis before 1 hour', () => {
            const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago
            const result = worker.shouldRunByFrequency(thirtyMinutesAgo, 'hourly');
            expect(result).toBe(false);
        });

        test('should allow daily analysis after 24 hours', () => {
            const yesterdayDate = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
            const result = worker.shouldRunByFrequency(yesterdayDate, 'daily');
            expect(result).toBe(true);
        });

        test('should default to daily frequency', () => {
            const yesterdayDate = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
            const result = worker.shouldRunByFrequency(yesterdayDate, 'unknown');
            expect(result).toBe(true);
        });

        test('should always allow per_execution frequency', () => {
            const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000); // 1 minute ago
            const result = worker.shouldRunByFrequency(oneMinuteAgo, 'per_execution');
            expect(result).toBe(true);
        });

        test('should allow per_execution even with very recent analysis', () => {
            const tenSecondsAgo = new Date(Date.now() - 10 * 1000); // 10 seconds ago
            const result = worker.shouldRunByFrequency(tenSecondsAgo, 'per_execution');
            expect(result).toBe(true);
        });
    });

    describe('checkAndRunAnalysis', () => {
        test('should skip tasks without listData', async () => {
            const executedTasks = [
                { id: 'task-1', result: null }
            ];

            const result = await worker.checkAndRunAnalysis(executedTasks);

            expect(result).toEqual([]);
            expect(mockChatGPTAnalyzer.analyze).not.toHaveBeenCalled();
        });

        test('should skip analysis when conditions not met', async () => {
            jest.spyOn(worker, 'shouldRunAnalysis').mockResolvedValue({
                should: false,
                reason: 'Analysis not enabled'
            });

            const executedTasks = [
                {
                    id: 'task-1',
                    config: { relatedTableId: 'list-123' },
                    result: {
                        listData: { name: 'Test List' }
                    }
                }
            ];

            const result = await worker.checkAndRunAnalysis(executedTasks);

            expect(result).toEqual([]);
            expect(mockChatGPTAnalyzer.analyze).not.toHaveBeenCalled();
        });

        test('should run analysis when conditions are met', async () => {
            jest.spyOn(worker, 'shouldRunAnalysis').mockResolvedValue({
                should: true,
                templateId: 'template-123',
                options: { minTweets: 5, maxTweets: 50 }
            });

            mockChatGPTAnalyzer.analyze.mockResolvedValue({
                analysisId: 'analysis-123',
                summary: 'Test analysis',
                tokensUsed: 1500
            });

            const executedTasks = [
                {
                    id: 'task-1',
                    config: { relatedTableId: 'list-123' },
                    result: {
                        listData: { name: 'Test List' }
                    }
                }
            ];

            const result = await worker.checkAndRunAnalysis(executedTasks);

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                listId: 'list-123',
                listName: 'Test List',
                success: true,
                result: {
                    analysisId: 'analysis-123',
                    summary: 'Test analysis',
                    tokensUsed: 1500
                }
            });

            expect(mockChatGPTAnalyzer.analyze).toHaveBeenCalledWith(
                'list-123',
                { name: 'Test List' },
                'template-123',
                { minTweets: 5, maxTweets: 50 }
            );
        });

        test('should handle analysis errors gracefully', async () => {
            jest.spyOn(worker, 'shouldRunAnalysis').mockResolvedValue({
                should: true,
                templateId: 'template-123',
                options: { minTweets: 5, maxTweets: 50 }
            });

            mockChatGPTAnalyzer.analyze.mockRejectedValue(new Error('API quota exceeded'));

            const executedTasks = [
                {
                    id: 'task-1',
                    taskName: 'Test List Task',
                    config: { relatedTableId: 'list-123' },
                    result: {
                        listData: { name: 'Test List' }
                    }
                }
            ];

            const result = await worker.checkAndRunAnalysis(executedTasks);

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                listId: 'list-123',
                listName: 'Test List Task',
                success: false,
                error: 'API quota exceeded'
            });
        });

        test('should handle task results with success flag correctly', async () => {
            jest.spyOn(worker, 'shouldRunAnalysis').mockResolvedValue({
                should: true,
                templateId: 'template-123',
                options: { minTweets: 5, maxTweets: 50 }
            });

            mockChatGPTAnalyzer.analyze.mockResolvedValue({
                analysisId: 'analysis-456',
                summary: 'Test analysis for successful task',
                tokensUsed: 800
            });

            // 成功したタスクと失敗したタスクを混在させる
            const executedTasks = [
                {
                    taskId: 'task-1',
                    taskName: 'Successful Task',
                    success: true,
                    config: { relatedTableId: 'list-123' },
                    result: {
                        listData: { name: 'Test List' }
                    }
                },
                {
                    taskId: 'task-2', 
                    taskName: 'Failed Task',
                    success: false,
                    error: 'Network error'
                }
            ];

            const result = await worker.checkAndRunAnalysis(executedTasks);

            // 成功したタスクのみ分析される
            expect(result).toHaveLength(1);
            expect(result[0].listName).toBe('Test List');
            expect(mockChatGPTAnalyzer.analyze).toHaveBeenCalledTimes(1);
        });

        test('should log debug information for analysis checks', async () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            
            const executedTasks = [
                {
                    taskId: 'task-1',
                    success: true,
                    config: { relatedTableId: 'list-123' },
                    result: {}  // listDataなし
                }
            ];

            await worker.checkAndRunAnalysis(executedTasks);

            expect(consoleSpy).toHaveBeenCalledWith('🔍 Checking analysis for 1 executed tasks');
            expect(consoleSpy).toHaveBeenCalledWith('⚠️ No listData found for task task-1');
            
            consoleSpy.mockRestore();
        });
    });

    describe('integration with processScheduledTasks', () => {
        test('should include analysis results in task processing', async () => {
            // Mock Firebase functions
            const { getDocs, query, collection, where } = require('firebase/firestore');
            
            getDocs.mockResolvedValue({
                docs: [{
                    id: 'task-1',
                    data: () => ({
                        name: 'Test Task',
                        active: true,
                        config: { relatedTableId: 'list-123' },
                        frequency: 15
                    })
                }]
            });

            query.mockImplementation(() => 'mocked-query');
            collection.mockImplementation(() => 'mocked-collection');
            where.mockImplementation(() => 'mocked-where');

            // Mock executeTwitterListTask to return listData
            jest.spyOn(worker, 'executeTwitterListTask').mockResolvedValue({
                listName: 'Test List',
                newTweets: 5,
                listData: { name: 'Test List', analysis: { enabled: true } }
            });

            // Mock analysis flow
            jest.spyOn(worker, 'checkAndRunAnalysis').mockResolvedValue([
                {
                    listId: 'list-123',
                    listName: 'Test List',
                    success: true,
                    result: { analysisId: 'analysis-123', tokensUsed: 1500 }
                }
            ]);

            jest.spyOn(worker, 'sendDiscordSummary').mockResolvedValue();

            const result = await worker.processScheduledTasks();

            expect(result.analysisResults).toBe(1);
            expect(worker.sendDiscordSummary).toHaveBeenCalledWith(
                expect.any(Array),
                expect.arrayContaining([
                    expect.objectContaining({
                        listName: 'Test List',
                        success: true
                    })
                ])
            );
        });
    });
});