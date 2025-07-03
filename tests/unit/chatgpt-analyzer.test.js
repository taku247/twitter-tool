// ChatGPTAnalyzer ユニットテスト

const { mockFirebaseClient, setupSuccessfulFirestoreMocks, resetFirebaseMocks } = require('../mocks/firebase');
const { mockOpenAI, setupSuccessfulChatGPTMock, setupChatGPTError, resetAPIMocks } = require('../mocks/apis');
const { sampleTweets, sampleTemplates, mockChatGPTResponse } = require('../fixtures/sampleData');

// モジュールのモック
jest.mock('firebase/firestore', () => mockFirebaseClient);
jest.mock('openai', () => ({
    OpenAI: jest.fn().mockImplementation(() => mockOpenAI)
}));
jest.mock('fs', () => ({
    promises: {
        mkdir: jest.fn().mockResolvedValue(),
        writeFile: jest.fn().mockResolvedValue()
    }
}));

const ChatGPTAnalyzer = require('../../railway-worker/workers/ChatGPTAnalyzer');

describe('ChatGPTAnalyzer', () => {
    let analyzer;

    beforeEach(() => {
        resetFirebaseMocks();
        resetAPIMocks();
        analyzer = new ChatGPTAnalyzer(mockFirebaseClient);
    });

    describe('analyze', () => {
        it('正常な分析実行ができる', async () => {
            const { mockFirestoreDoc, mockFirestoreSnapshot } = require('../fixtures/sampleData');
            
            // モック設定
            setupSuccessfulFirestoreMocks();
            setupSuccessfulChatGPTMock();
            
            // テンプレート取得のモック
            mockFirebaseClient.getDoc.mockResolvedValueOnce(
                mockFirestoreDoc(sampleTemplates[0])
            );

            const result = await analyzer.analyze(
                'list-test-123',
                { name: 'Test List' },
                'template-sentiment',
                {}
            );

            expect(result).toHaveProperty('analysisId');
            expect(result).toHaveProperty('summary');
            expect(result).toHaveProperty('tweetCount', 3);
            expect(result).toHaveProperty('tokensUsed', 450);
            expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(1);
        });

        it('ツイートが0件の場合はエラーになる', async () => {
            const { mockFirestoreSnapshot } = require('../fixtures/sampleData');
            
            // 空のツイートデータ
            const emptyTweetsQuery = jest.fn().mockResolvedValue(
                mockFirestoreSnapshot([])
            );
            mockFirebaseClient.getDocs.mockImplementation(emptyTweetsQuery);

            await expect(
                analyzer.analyze('list-test-123', { name: 'Test List' }, 'template-sentiment', {})
            ).rejects.toThrow('No tweets available for analysis');
        });

        it('テンプレートが存在しない場合はエラーになる', async () => {
            setupSuccessfulFirestoreMocks();
            
            // テンプレートが存在しない
            mockFirebaseClient.getDoc.mockResolvedValueOnce({
                exists: () => false,
                data: () => undefined
            });

            await expect(
                analyzer.analyze('list-test-123', { name: 'Test List' }, 'non-existent-template', {})
            ).rejects.toThrow('Template not found: non-existent-template');
        });

        it('OpenAI APIエラーを適切に処理する', async () => {
            const { mockFirestoreDoc } = require('../fixtures/sampleData');
            
            setupSuccessfulFirestoreMocks();
            mockFirebaseClient.getDoc.mockResolvedValueOnce(
                mockFirestoreDoc(sampleTemplates[0])
            );
            setupChatGPTError(new Error('OpenAI API rate limit'));

            await expect(
                analyzer.analyze('list-test-123', { name: 'Test List' }, 'template-sentiment', {})
            ).rejects.toThrow('OpenAI API rate limit');

            // エラー時も分析レコードが更新されることを確認
            expect(mockFirebaseClient.updateDoc).toHaveBeenCalled();
        });
    });

    describe('getAnalysisTargetTweets', () => {
        beforeEach(() => {
            const { mockFirestoreDoc, mockFirestoreSnapshot } = require('../fixtures/sampleData');
            
            // ツイートデータのモック
            const tweetDocs = sampleTweets.map(tweet => mockFirestoreDoc(tweet));
            mockFirebaseClient.getDocs.mockResolvedValue(
                mockFirestoreSnapshot(tweetDocs)
            );
        });

        it('未分析ツイートを優先的に取得する', async () => {
            const tweets = await analyzer.getAnalysisTargetTweets('list-test-123', {
                minTweets: 2,
                maxTweets: 10
            });

            expect(tweets).toHaveLength(3);
            expect(tweets[0]).toHaveProperty('tweetId');
            expect(tweets[0]).toHaveProperty('text');
        });

        it('最小ツイート数に満たない場合はnullを返す', async () => {
            const { mockFirestoreDoc, mockFirestoreSnapshot } = require('../fixtures/sampleData');
            
            // 1件だけのツイート
            const singleTweet = [mockFirestoreDoc(sampleTweets[0])];
            mockFirebaseClient.getDocs.mockResolvedValue(
                mockFirestoreSnapshot(singleTweet)
            );

            const tweets = await analyzer.getAnalysisTargetTweets('list-test-123', {
                minTweets: 5,
                maxTweets: 10
            });

            expect(tweets).toBeNull();
        });

        it('最大ツイート数を超えない', async () => {
            const tweets = await analyzer.getAnalysisTargetTweets('list-test-123', {
                minTweets: 1,
                maxTweets: 2
            });

            expect(tweets).toHaveLength(2);
        });
    });

    describe('callChatGPT', () => {
        it('プロンプトテンプレートを正しく処理する', async () => {
            setupSuccessfulChatGPTMock();
            
            const template = {
                prompt: '以下のツイートを分析してください：\n\n{{ tweets }}\n\n合計{{ tweet_count }}件',
                temperature: 0.7,
                maxTokens: 1000
            };

            await analyzer.callChatGPT(sampleTweets, template);

            const callArgs = mockOpenAI.chat.completions.create.mock.calls[0][0];
            expect(callArgs.messages[1].content).toContain('tech_expert');
            expect(callArgs.messages[1].content).toContain('合計3件');
            expect(callArgs.temperature).toBe(0.7);
            expect(callArgs.max_tokens).toBe(1000);
        });

        it('スペースありのプレースホルダーも処理する', async () => {
            setupSuccessfulChatGPTMock();
            
            const template = {
                prompt: '分析対象: {{ tweets }} ({{ tweet_count }} 件)',
                temperature: 0.5,
                maxTokens: 500
            };

            await analyzer.callChatGPT(sampleTweets, template);

            const callArgs = mockOpenAI.chat.completions.create.mock.calls[0][0];
            expect(callArgs.messages[1].content).toContain('tech_expert');
            expect(callArgs.messages[1].content).toContain('(3 件)');
        });

        it('APIエラーレスポンスを適切に処理する', async () => {
            const apiError = new Error('API Error');
            apiError.response = {
                status: 429,
                data: { error: { message: 'Rate limit exceeded' } }
            };
            setupChatGPTError(apiError);

            const template = sampleTemplates[0];

            await expect(
                analyzer.callChatGPT(sampleTweets, template)
            ).rejects.toThrow();
        });
    });

    describe('parseAnalysisResult', () => {
        it('感情分析結果を正しくパースする', () => {
            const rawResponse = `
全体的な感情傾向: ポジティブ

ポジティブ: 70%
ネガティブ: 10%
ニュートラル: 20%

要約: AI技術への期待感が高い
            `;

            const result = analyzer.parseAnalysisResult(rawResponse, 'sentiment');

            expect(result.category).toBe('sentiment');
            expect(result.sentiment.overallSentiment).toBe('ポジティブ');
            expect(result.sentiment.distribution.positive).toBe(70);
            expect(result.sentiment.summary).toBe('AI技術への期待感が高い');
        });

        it('トレンド分析結果を正しくパースする', () => {
            const rawResponse = `
主要トレンド:
- AI技術の進歩
- 機械学習の応用
- 自然言語処理

要約: テクノロジートレンドが活発
            `;

            const result = analyzer.parseAnalysisResult(rawResponse, 'trend');

            expect(result.category).toBe('trend');
            expect(result.trends.mainTrends).toContain('AI技術の進歩');
            expect(result.trends.summary).toBe('テクノロジートレンドが活発');
        });

        it('不正な形式でもエラーにならない', () => {
            const invalidResponse = 'これは不正な形式の応答です';

            const result = analyzer.parseAnalysisResult(invalidResponse, 'sentiment');

            expect(result.category).toBe('sentiment');
            expect(result.summary).toBeDefined();
        });
    });

    describe('saveAnalysisAsCSV', () => {
        it('CSV形式でファイルを保存する', async () => {
            const fs = require('fs').promises;
            
            const analysisResult = {
                category: 'sentiment',
                sentiment: {
                    overallSentiment: 'ポジティブ',
                    distribution: { positive: 70, negative: 10, neutral: 20 }
                },
                summary: 'AI技術への期待感が高い'
            };

            const csvPath = await analyzer.saveAnalysisAsCSV(
                'test-analysis-id',
                { name: 'Test List' },
                sampleTweets,
                analysisResult
            );

            expect(csvPath).toContain('analysis-test-analysis-id.csv');
            expect(fs.mkdir).toHaveBeenCalled();
            expect(fs.writeFile).toHaveBeenCalled();
            
            const writeCall = fs.writeFile.mock.calls[0];
            const csvContent = writeCall[1];
            expect(csvContent).toContain('tweet_id,author_name,tweet_text');
            expect(csvContent).toContain('tech_expert');
            expect(csvContent).toContain('Analysis Summary');
        });
    });

    describe('updateAnalysisRecord', () => {
        it('分析レコードを正しく更新する', async () => {
            setupSuccessfulFirestoreMocks();
            
            await analyzer.updateAnalysisRecord('test-analysis-id', {
                status: 'completed',
                summary: 'テスト完了',
                tokensUsed: 500
            });

            expect(mockFirebaseClient.getDocs).toHaveBeenCalled();
            expect(mockFirebaseClient.updateDoc).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    status: 'completed',
                    summary: 'テスト完了',
                    tokensUsed: 500
                })
            );
        });

        it('存在しない分析IDでもエラーにならない', async () => {
            // 空の検索結果
            mockFirebaseClient.getDocs.mockResolvedValue(
                mockFirestoreSnapshot([])
            );

            await expect(
                analyzer.updateAnalysisRecord('non-existent-id', { status: 'completed' })
            ).resolves.not.toThrow();
        });
    });

    describe('markTweetsAsAnalyzed', () => {
        it('ツイートに分析済みフラグを設定する', async () => {
            const mockBatch = {
                update: jest.fn(),
                commit: jest.fn().mockResolvedValue()
            };
            mockFirebaseClient.writeBatch.mockReturnValue(mockBatch);

            const tweetsWithDocId = sampleTweets.map(tweet => ({
                ...tweet,
                docId: `doc-${tweet.tweetId}`
            }));

            await analyzer.markTweetsAsAnalyzed(tweetsWithDocId, 'test-analysis-id');

            expect(mockBatch.update).toHaveBeenCalledTimes(3);
            expect(mockBatch.commit).toHaveBeenCalledTimes(1);
        });
    });

    describe('incrementTemplateUsage', () => {
        it('テンプレートの使用回数を増やす', async () => {
            const { mockFirestoreDoc } = require('../fixtures/sampleData');
            
            const templateData = {
                usage: { totalRuns: 5 }
            };
            mockFirebaseClient.getDoc.mockResolvedValue(
                mockFirestoreDoc(templateData)
            );

            await analyzer.incrementTemplateUsage('template-test');

            expect(mockFirebaseClient.updateDoc).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    usage: expect.objectContaining({
                        totalRuns: 6
                    })
                })
            );
        });

        it('使用回数が未設定の場合は1から開始', async () => {
            const { mockFirestoreDoc } = require('../fixtures/sampleData');
            
            const templateData = {}; // usage フィールドなし
            mockFirebaseClient.getDoc.mockResolvedValue(
                mockFirestoreDoc(templateData)
            );

            await analyzer.incrementTemplateUsage('template-test');

            expect(mockFirebaseClient.updateDoc).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    usage: expect.objectContaining({
                        totalRuns: 1
                    })
                })
            );
        });
    });
});