// TwitterWorker ユニットテスト

const { mockFirebaseClient, setupSuccessfulFirestoreMocks, resetFirebaseMocks } = require('../mocks/firebase');
const { mockAxios, setupSuccessfulTwitterAPIMock, setupTwitterAPIError, resetAPIMocks } = require('../mocks/apis');
const { sampleTweets, sampleTwitterLists, sampleCronTasks, mockTwitterAPIResponse, mockFirestoreDoc, mockFirestoreSnapshot } = require('../fixtures/sampleData');

// モジュールのモック
jest.mock('firebase/app', () => ({
    initializeApp: jest.fn()
}));
jest.mock('firebase/firestore', () => mockFirebaseClient);
jest.mock('axios', () => mockAxios);

// ChatGPTAnalyzer と TemplateManager のモック
const mockChatGPTAnalyzer = {
    analyze: jest.fn(),
    updateAnalysisRecord: jest.fn()
};
const mockTemplateManager = {
    get: jest.fn()
};

jest.mock('../../railway-worker/workers/ChatGPTAnalyzer', () => {
    return jest.fn().mockImplementation(() => mockChatGPTAnalyzer);
});
jest.mock('../../railway-worker/workers/AnalysisTemplateManager', () => {
    return jest.fn().mockImplementation(() => mockTemplateManager);
});

const TwitterWorker = require('../../railway-worker/workers/TwitterWorker');

describe('TwitterWorker', () => {
    let worker;

    beforeEach(() => {
        resetFirebaseMocks();
        resetAPIMocks();
        worker = new TwitterWorker();
        worker.db = mockFirebaseClient;
        worker.isInitialized = true;
        worker.chatGPTAnalyzer = mockChatGPTAnalyzer;
        worker.templateManager = mockTemplateManager;
    });

    describe('processJob', () => {
        it('scheduled_processing ジョブを処理できる', async () => {
            const mockProcessScheduledTasks = jest.spyOn(worker, 'processScheduledTasks')
                .mockResolvedValue({ executedTasks: 2, results: [] });

            const job = {
                type: 'scheduled_processing',
                data: {},
                requestId: 'test-request-1'
            };

            const result = await worker.processJob(job);

            expect(result.success).toBe(true);
            expect(result.result.executedTasks).toBe(2);
            expect(mockProcessScheduledTasks).toHaveBeenCalled();
        });

        it('manual_analysis ジョブを処理できる', async () => {
            const mockProcessManualAnalysis = jest.spyOn(worker, 'processManualAnalysis')
                .mockResolvedValue({ success: true, analysisId: 'test-analysis' });

            const job = {
                type: 'manual_analysis',
                data: { listId: 'list-123', templateId: 'template-123' },
                requestId: 'test-request-2'
            };

            const result = await worker.processJob(job);

            expect(result.success).toBe(true);
            expect(mockProcessManualAnalysis).toHaveBeenCalledWith(job.data);
        });

        it('未知のジョブタイプはエラーになる', async () => {
            const job = {
                type: 'unknown_job_type',
                data: {},
                requestId: 'test-request-3'
            };

            await expect(worker.processJob(job)).rejects.toThrow('Unknown job type: unknown_job_type');
        });

        it('ジョブ実行ログが保存される', async () => {
            jest.spyOn(worker, 'processScheduledTasks').mockResolvedValue({ executedTasks: 1 });
            const mockLogJobExecution = jest.spyOn(worker, 'logJobExecution').mockResolvedValue();

            const job = {
                type: 'scheduled_processing',
                data: {},
                requestId: 'test-request-4'
            };

            await worker.processJob(job);

            expect(mockLogJobExecution).toHaveBeenCalledWith(
                'scheduled_processing',
                'test-request-4',
                'success',
                expect.any(Object),
                expect.any(Number)
            );
        });
    });

    describe('processScheduledTasks', () => {
        beforeEach(() => {
            // アクティブなタスクのモック
            const taskDocs = sampleCronTasks.map(task => mockFirestoreDoc(task));
            mockFirebaseClient.getDocs.mockResolvedValue(
                mockFirestoreSnapshot(taskDocs)
            );
        });

        it('アクティブなタスクを取得して実行する', async () => {
            const mockExecuteTwitterListTask = jest.spyOn(worker, 'executeTwitterListTask')
                .mockResolvedValue({ newTweets: 5, totalProcessed: 10 });
            const mockSendDiscordSummary = jest.spyOn(worker, 'sendDiscordSummary')
                .mockResolvedValue();

            const result = await worker.processScheduledTasks();

            expect(result.executedTasks).toBe(1);
            expect(mockExecuteTwitterListTask).toHaveBeenCalled();
            expect(mockSendDiscordSummary).toHaveBeenCalled();
        });

        it('実行対象がない場合は0件を返す', async () => {
            // 空のタスクリスト
            mockFirebaseClient.getDocs.mockResolvedValue(
                mockFirestoreSnapshot([])
            );

            const result = await worker.processScheduledTasks();

            expect(result.executedTasks).toBe(0);
            expect(result.results).toEqual([]);
        });

        it('分析が有効なリストも処理する', async () => {
            const mockExecuteTwitterListTask = jest.spyOn(worker, 'executeTwitterListTask')
                .mockResolvedValue({ newTweets: 5, totalProcessed: 10 });
            const mockRunAnalysisIfNeeded = jest.spyOn(worker, 'runAnalysisIfNeeded')
                .mockResolvedValue({ success: true, analysisId: 'analysis-123' });
            const mockSendDiscordSummary = jest.spyOn(worker, 'sendDiscordSummary')
                .mockResolvedValue();

            const result = await worker.processScheduledTasks();

            expect(result.executedTasks).toBe(1);
            expect(mockExecuteTwitterListTask).toHaveBeenCalled();
            expect(mockRunAnalysisIfNeeded).toHaveBeenCalled();
            expect(mockSendDiscordSummary).toHaveBeenCalled();
        });

        it('タスク実行エラーを適切に処理する', async () => {
            jest.spyOn(worker, 'executeTwitterListTask')
                .mockRejectedValue(new Error('Task execution failed'));

            const result = await worker.processScheduledTasks();

            expect(result.executedTasks).toBe(1);
            expect(result.failedTasks).toBe(1);
            expect(result.results[0].success).toBe(false);
            expect(result.results[0].error).toBe('Task execution failed');
        });
    });

    describe('executeTwitterListTask', () => {
        beforeEach(() => {
            setupSuccessfulFirestoreMocks(sampleTwitterLists[0]);
            setupSuccessfulTwitterAPIMock();
        });

        it('Twitterリストタスクを正常実行する', async () => {
            const mockSaveNewTweets = jest.spyOn(worker, 'saveNewTweets')
                .mockResolvedValue(sampleTweets);

            const task = sampleCronTasks[0];
            const currentTime = new Date();

            const result = await worker.executeTwitterListTask(task, currentTime);

            expect(result.newTweets).toBe(3);
            expect(result.listName).toBe('AI Tech List');
            expect(mockSaveNewTweets).toHaveBeenCalled();
        });

        it('存在しないリストIDはエラーになる', async () => {
            // リストが存在しない
            mockFirebaseClient.getDoc.mockResolvedValue({
                exists: () => false
            });

            const task = sampleCronTasks[0];
            const currentTime = new Date();

            await expect(
                worker.executeTwitterListTask(task, currentTime)
            ).rejects.toThrow('List not found: list-doc-123');
        });

        it('分析が有効な場合は分析も実行する', async () => {
            const mockSaveNewTweets = jest.spyOn(worker, 'saveNewTweets')
                .mockResolvedValue(sampleTweets);
            const mockRunAnalysisIfNeeded = jest.spyOn(worker, 'runAnalysisIfNeeded')
                .mockResolvedValue({ success: true, analysisId: 'analysis-123' });

            const task = sampleCronTasks[0];
            const currentTime = new Date();

            const result = await worker.executeTwitterListTask(task, currentTime);

            expect(result.newTweets).toBe(3);
            expect(mockSaveNewTweets).toHaveBeenCalled();
            expect(mockRunAnalysisIfNeeded).toHaveBeenCalled();
        });
    });

    describe('fetchTweetsFromAPI', () => {
        it('TwitterAPI.ioからツイートを取得する', async () => {
            setupSuccessfulTwitterAPIMock();

            const listData = sampleTwitterLists[0];
            const currentTime = new Date();

            const tweets = await worker.fetchTweetsFromAPI(listData, currentTime);

            expect(tweets).toHaveLength(2);
            expect(tweets[0]).toHaveProperty('id');
            expect(tweets[0]).toHaveProperty('text');
            expect(mockAxios.get).toHaveBeenCalledWith(
                'https://api.twitterapi.io/twitter/list/tweets',
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'X-API-Key': 'test-twitter-key'
                    })
                })
            );
        });

        it('API エラーを適切に処理する', async () => {
            setupTwitterAPIError(429, 'Rate limit exceeded');

            const listData = sampleTwitterLists[0];
            const currentTime = new Date();

            await expect(
                worker.fetchTweetsFromAPI(listData, currentTime)
            ).rejects.toThrow();
        });

        it('複数ページを正しく取得する', async () => {
            // 1ページ目: 20件のツイート
            const page1Response = {
                tweets: Array(20).fill().map((_, i) => ({
                    id: `tweet-${i}`,
                    text: `Tweet ${i}`,
                    created_at: '2025-01-01T10:00:00Z'
                }))
            };
            // 2ページ目: 5件のツイート
            const page2Response = {
                tweets: Array(5).fill().map((_, i) => ({
                    id: `tweet-${i + 20}`,
                    text: `Tweet ${i + 20}`,
                    created_at: '2025-01-01T10:00:00Z'
                }))
            };

            mockAxios.get
                .mockResolvedValueOnce({ data: page1Response })
                .mockResolvedValueOnce({ data: page2Response });

            const listData = sampleTwitterLists[0];
            const currentTime = new Date();

            const tweets = await worker.fetchTweetsFromAPI(listData, currentTime);

            expect(tweets).toHaveLength(25);
            expect(mockAxios.get).toHaveBeenCalledTimes(2);
        });
    });

    describe('saveNewTweets', () => {
        it('新規ツイートのみを保存する', async () => {
            // 重複チェック: 1件目は既存、2-3件目は新規
            mockFirebaseClient.getDocs
                .mockResolvedValueOnce(mockFirestoreSnapshot([mockFirestoreDoc(sampleTweets[0])])) // 既存
                .mockResolvedValueOnce(mockFirestoreSnapshot([])) // 新規
                .mockResolvedValueOnce(mockFirestoreSnapshot([])); // 新規

            const mockBatch = {
                set: jest.fn(),
                commit: jest.fn().mockResolvedValue()
            };
            mockFirebaseClient.writeBatch.mockReturnValue(mockBatch);

            const tweets = mockTwitterAPIResponse.tweets;
            const newTweets = await worker.saveNewTweets(tweets, 'list-123', 'task-123');

            expect(newTweets).toHaveLength(1); // 2件は新規だが、テストデータが1件のため
            expect(mockBatch.set).toHaveBeenCalled();
            expect(mockBatch.commit).toHaveBeenCalled();
        });

        it('全て重複の場合は0件を返す', async () => {
            // 全て既存ツイート
            mockFirebaseClient.getDocs.mockResolvedValue(
                mockFirestoreSnapshot([mockFirestoreDoc(sampleTweets[0])])
            );

            const tweets = [mockTwitterAPIResponse.tweets[0]];
            const newTweets = await worker.saveNewTweets(tweets, 'list-123', 'task-123');

            expect(newTweets).toHaveLength(0);
        });
    });

    describe('processManualAnalysis', () => {
        beforeEach(() => {
            setupSuccessfulFirestoreMocks(sampleTwitterLists[0]);
            mockTemplateManager.get.mockResolvedValue({
                id: 'template-123',
                name: 'Test Template',
                prompt: 'Analyze: {{ tweets }}'
            });
            mockChatGPTAnalyzer.analyze.mockResolvedValue({
                analysisId: 'analysis-123',
                summary: 'Test analysis result',
                tweetCount: 5,
                tokensUsed: 300,
                csvPath: './reports/test.csv'
            });
        });

        it('手動分析を正常実行する', async () => {
            const data = {
                listId: 'list-doc-123',
                templateId: 'template-123',
                requestedBy: 'manual'
            };

            const result = await worker.processManualAnalysis(data);

            expect(result.success).toBe(true);
            expect(result.analysisId).toBe('analysis-123');
            expect(result.listName).toBe('AI Tech List');
            expect(mockChatGPTAnalyzer.analyze).toHaveBeenCalled();
            expect(mockChatGPTAnalyzer.updateAnalysisRecord).toHaveBeenCalled();
        });

        it('必須パラメータがない場合はエラーになる', async () => {
            const data = { listId: 'list-123' }; // templateId がない

            await expect(
                worker.processManualAnalysis(data)
            ).rejects.toThrow('Missing required parameters: listId and templateId');
        });

        it('存在しないリストIDはエラーになる', async () => {
            mockFirebaseClient.getDoc.mockResolvedValue({
                exists: () => false
            });

            const data = {
                listId: 'non-existent-list',
                templateId: 'template-123'
            };

            await expect(
                worker.processManualAnalysis(data)
            ).rejects.toThrow('List not found: non-existent-list');
        });

        it('存在しないテンプレートIDはエラーになる', async () => {
            mockTemplateManager.get.mockResolvedValue(null);

            const data = {
                listId: 'list-doc-123',
                templateId: 'non-existent-template'
            };

            await expect(
                worker.processManualAnalysis(data)
            ).rejects.toThrow('Template not found: non-existent-template');
        });
    });

    describe('sendDiscordSummary', () => {
        it('Discord通知を送信する', async () => {
            mockAxios.post.mockResolvedValue({ status: 200 });

            const results = [
                { taskId: 'task-1', success: true, result: { newTweets: 5 } },
                { taskId: 'task-2', success: false, error: 'API Error' }
            ];

            await worker.sendDiscordSummary(results);

            expect(mockAxios.post).toHaveBeenCalledWith(
                'https://discord.com/api/webhooks/test',
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            title: expect.stringContaining('Railway Worker'),
                            color: expect.any(Number),
                            fields: expect.any(Array)
                        })
                    ])
                })
            );
        });

        it('Discord通知エラーでも処理が継続する', async () => {
            mockAxios.post.mockRejectedValue(new Error('Discord API error'));

            const results = [
                { taskId: 'task-1', success: true, result: { newTweets: 5 } }
            ];

            // エラーが投げられないことを確認
            await expect(
                worker.sendDiscordSummary(results)
            ).resolves.not.toThrow();
        });
    });

    describe('logJobExecution', () => {
        it('ジョブ実行ログを保存する', async () => {
            mockFirebaseClient.addDoc.mockResolvedValue({ id: 'log-123' });

            await worker.logJobExecution(
                'manual_analysis',
                'request-123',
                'success',
                { analysisId: 'analysis-123' },
                15000
            );

            expect(mockFirebaseClient.addDoc).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    jobType: 'manual_analysis',
                    requestId: 'request-123',
                    status: 'success',
                    processingTime: 15000,
                    workerInfo: expect.objectContaining({
                        platform: 'railway'
                    })
                })
            );
        });
    });

    describe('runAnalysisIfNeeded', () => {
        beforeEach(() => {
            mockTemplateManager.get.mockResolvedValue({
                id: 'template-123',
                name: 'Test Template',
                prompt: 'Analyze: {{ tweets }}'
            });
            mockChatGPTAnalyzer.analyze.mockResolvedValue({
                analysisId: 'analysis-123',
                summary: 'Test analysis result',
                tweetCount: 5,
                tokensUsed: 300
            });
        });

        it('分析条件を満たす場合は分析を実行する', async () => {
            const listData = {
                analysis: {
                    enabled: true,
                    templateId: 'template-123',
                    minTweets: 5
                }
            };
            
            jest.spyOn(worker, 'shouldRunAnalysis').mockResolvedValue({
                should: true,
                templateId: 'template-123'
            });

            const result = await worker.runAnalysisIfNeeded(listData, 'list-123');

            expect(result.success).toBe(true);
            expect(result.analysisId).toBe('analysis-123');
            expect(mockChatGPTAnalyzer.analyze).toHaveBeenCalled();
        });

        it('分析条件を満たさない場合はスキップ', async () => {
            const listData = {
                analysis: { enabled: false }
            };
            
            jest.spyOn(worker, 'shouldRunAnalysis').mockResolvedValue({
                should: false,
                reason: 'Analysis not enabled'
            });

            const result = await worker.runAnalysisIfNeeded(listData, 'list-123');

            expect(result.skipped).toBe(true);
            expect(result.reason).toBe('Analysis not enabled');
            expect(mockChatGPTAnalyzer.analyze).not.toHaveBeenCalled();
        });
    });

    describe('shouldRunAnalysis', () => {
        it('分析が有効で条件を満たす場合はtrueを返す', async () => {
            const listData = {
                analysis: {
                    enabled: true,
                    templateId: 'template-123',
                    frequency: 'daily',
                    minTweets: 5
                }
            };

            mockTemplateManager.get.mockResolvedValue({ id: 'template-123' });
            jest.spyOn(worker, 'getUnanalyzedTweetCount').mockResolvedValue(10);

            const result = await worker.shouldRunAnalysis(listData, 'list-123');

            expect(result.should).toBe(true);
            expect(result.templateId).toBe('template-123');
        });

        it('分析が無効の場合はfalseを返す', async () => {
            const listData = {
                analysis: { enabled: false }
            };

            const result = await worker.shouldRunAnalysis(listData, 'list-123');

            expect(result.should).toBe(false);
            expect(result.reason).toBe('Analysis not enabled');
        });

        it('十分なツイート数がない場合はfalseを返す', async () => {
            const listData = {
                analysis: {
                    enabled: true,
                    templateId: 'template-123',
                    minTweets: 10
                }
            };

            mockTemplateManager.get.mockResolvedValue({ id: 'template-123' });
            jest.spyOn(worker, 'getUnanalyzedTweetCount').mockResolvedValue(3);

            const result = await worker.shouldRunAnalysis(listData, 'list-123');

            expect(result.should).toBe(false);
            expect(result.reason).toBe('Not enough tweets (3 < 10)');
        });

        it('テンプレートが存在しない場合はfalseを返す', async () => {
            const listData = {
                analysis: {
                    enabled: true,
                    templateId: 'non-existent-template',
                    minTweets: 5
                }
            };

            mockTemplateManager.get.mockResolvedValue(null);

            const result = await worker.shouldRunAnalysis(listData, 'list-123');

            expect(result.should).toBe(false);
            expect(result.reason).toBe('Template not found: non-existent-template');
        });
    });

    describe('getUnanalyzedTweetCount', () => {
        it('未分析ツイート数を取得する', async () => {
            // 未分析ツイートのモック
            const unanalyzedTweets = sampleTweets.slice(0, 2);
            mockFirebaseClient.getDocs.mockResolvedValue(
                mockFirestoreSnapshot(unanalyzedTweets.map(tweet => mockFirestoreDoc(tweet)))
            );

            const count = await worker.getUnanalyzedTweetCount('list-123');

            expect(count).toBe(2);
            expect(mockFirebaseClient.getDocs).toHaveBeenCalledWith(
                expect.anything()
            );
        });

        it('全て分析済みの場合は0を返す', async () => {
            // 空の結果
            mockFirebaseClient.getDocs.mockResolvedValue(
                mockFirestoreSnapshot([])
            );

            const count = await worker.getUnanalyzedTweetCount('list-123');

            expect(count).toBe(0);
        });
    });

    describe('initializeFirebase', () => {
        it('Firebaseを初期化する', async () => {
            await worker.initializeFirebase();

            expect(worker.isInitialized).toBe(true);
            expect(worker.db).toBeDefined();
            expect(worker.chatGPTAnalyzer).toBeDefined();
            expect(worker.templateManager).toBeDefined();
        });

        it('初期化エラーを適切に処理する', async () => {
            const initError = new Error('Firebase initialization failed');
            mockFirebaseClient.getFirestore.mockImplementation(() => {
                throw initError;
            });

            await expect(worker.initializeFirebase()).rejects.toThrow(
                'Firebase initialization failed'
            );
            expect(worker.isInitialized).toBe(false);
        });
    });
});