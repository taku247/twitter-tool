// テスト用のサンプルデータ

// ヘルパー関数
const mockTimestamp = (date = new Date()) => ({
    toDate: () => date,
    seconds: Math.floor(date.getTime() / 1000),
    nanoseconds: 0
});

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

const sampleTweets = [
    {
        id: '1234567890123456789',
        tweetId: '1234567890123456789',
        text: 'AI技術の進歩が素晴らしい！機械学習の新しい手法について議論しています。',
        authorName: 'tech_expert',
        authorId: 'author1',
        createdAt: '2025-01-01T10:00:00Z',
        collectedAt: new Date('2025-01-01T10:05:00Z'),
        sourceType: 'twitter_list',
        sourceId: 'list-test-123',
        data: {
            user: { screen_name: 'tech_expert', id: 'author1' },
            created_at: '2025-01-01T10:00:00Z'
        }
    },
    {
        id: '1234567890123456790',
        tweetId: '1234567890123456790',
        text: 'ChatGPTの新機能が発表されました。自然言語処理の分野での革新が続いています。',
        authorName: 'ai_researcher',
        authorId: 'author2',
        createdAt: '2025-01-01T11:00:00Z',
        collectedAt: new Date('2025-01-01T11:05:00Z'),
        sourceType: 'twitter_list',
        sourceId: 'list-test-123',
        data: {
            user: { screen_name: 'ai_researcher', id: 'author2' },
            created_at: '2025-01-01T11:00:00Z'
        }
    },
    {
        id: '1234567890123456791',
        tweetId: '1234567890123456791',
        text: 'プライバシーとAIの関係について心配しています。規制が必要かもしれません。',
        authorName: 'privacy_advocate',
        authorId: 'author3',
        createdAt: '2025-01-01T12:00:00Z',
        collectedAt: new Date('2025-01-01T12:05:00Z'),
        sourceType: 'twitter_list',
        sourceId: 'list-test-123',
        data: {
            user: { screen_name: 'privacy_advocate', id: 'author3' },
            created_at: '2025-01-01T12:00:00Z'
        }
    }
];

const sampleTemplates = [
    {
        id: 'template-sentiment',
        name: '感情分析テンプレート',
        category: 'sentiment',
        prompt: '以下のツイートの感情分析を行ってください。\n\n{{ tweets }}\n\n結果をJSON形式で出力してください。',
        temperature: 0.3,
        maxTokens: 1000,
        active: true,
        description: 'ツイートの感情傾向を分析します',
        createdAt: mockTimestamp(),
        updatedAt: mockTimestamp(),
        usage: {
            totalRuns: 5,
            lastUsed: mockTimestamp()
        }
    },
    {
        id: 'template-summary',
        name: '日次要約テンプレート',
        category: 'summary',
        prompt: '以下の{{ tweet_count }}件のツイートから本日の主要トピックを抽出してください。\n\n{{ tweets }}',
        temperature: 0.7,
        maxTokens: 1500,
        active: true,
        description: '1日のツイートを要約します',
        createdAt: mockTimestamp(),
        updatedAt: mockTimestamp(),
        usage: {
            totalRuns: 3,
            lastUsed: mockTimestamp()
        }
    }
];

const sampleTwitterLists = [
    {
        id: 'list-doc-123',
        listId: 'list-123',
        twitterListId: '1655624922645901338',
        name: 'AI Tech List',
        description: 'AI技術関連のエキスパート',
        memberCount: 50,
        active: true,
        frequency: 60,
        lastExecuted: mockTimestamp(),
        lastTweetId: '1234567890123456789',
        tweetCount: 150,
        createdAt: mockTimestamp(),
        updatedAt: mockTimestamp(),
        analysis: {
            enabled: true,
            templateId: 'template-sentiment',
            frequency: 'daily',
            minTweets: 5,
            maxTweets: 50,
            lastAnalyzed: mockTimestamp()
        }
    }
];

const sampleAnalysisResults = [
    {
        id: 'analysis-123',
        analysisId: 'analysis-1735689600000-test123',
        status: 'completed',
        sourceType: 'twitter_list',
        sourceId: 'list-doc-123',
        templateId: 'template-sentiment',
        listName: 'AI Tech List',
        templateName: '感情分析テンプレート',
        tweetCount: 3,
        tokensUsed: 450,
        summary: 'AI技術への期待感が強い一方で、プライバシーへの懸念も見られる',
        processingTime: 15000,
        createdAt: mockTimestamp(),
        completedAt: mockTimestamp(),
        input: {
            tweetCount: 3,
            tweetIds: ['1234567890123456789', '1234567890123456790', '1234567890123456791'],
            dateRange: {
                from: '2025-01-01T10:00:00Z',
                to: '2025-01-01T12:00:00Z'
            }
        },
        output: {
            rawResponse: '{"sentiment_distribution": {"positive": 0.67, "neutral": 0.0, "negative": 0.33}, "key_emotions": ["期待", "心配"], "sentiment_summary": "AI技術への期待感が強い"}',
            parsedData: {
                sentiment: {
                    overallSentiment: 'やや前向き',
                    distribution: { positive: 0.67, neutral: 0.0, negative: 0.33 },
                    topics: ['AI技術', 'プライバシー'],
                    summary: 'AI技術への期待感が強い一方で、プライバシーへの懸念も見られる'
                }
            },
            tokensUsed: 450,
            model: 'gpt-4',
            temperature: 0.3
        },
        csvFilePath: './reports/2025/01/analysis-test123.csv',
        notifications: {
            discord: { sent: false }
        }
    }
];

const sampleCronTasks = [
    {
        id: 'task-123',
        name: 'AI Tech List Collection',
        active: true,
        frequency: 60,
        lastExecuted: mockTimestamp(),
        config: {
            relatedTableId: 'list-doc-123',
            type: 'twitter_list'
        },
        createdAt: mockTimestamp(),
        updatedAt: mockTimestamp()
    }
];

const mockChatGPTResponse = {
    choices: [{
        message: {
            content: '{"sentiment_distribution": {"positive": 0.67, "neutral": 0.0, "negative": 0.33}, "key_emotions": ["期待", "心配"], "sentiment_summary": "AI技術への期待感が強い一方で、プライバシーへの懸念も見られる"}'
        }
    }],
    usage: {
        total_tokens: 450,
        prompt_tokens: 300,
        completion_tokens: 150
    },
    model: 'gpt-4'
};

const mockTwitterAPIResponse = {
    tweets: [
        {
            id: '1234567890123456789',
            text: 'AI技術の進歩が素晴らしい！',
            created_at: '2025-01-01T10:00:00Z',
            author: {
                id: 'author1',
                username: 'tech_expert'
            }
        },
        {
            id: '1234567890123456790',
            text: 'ChatGPTの新機能が発表されました。',
            created_at: '2025-01-01T11:00:00Z',
            author: {
                id: 'author2',
                username: 'ai_researcher'
            }
        }
    ]
};

module.exports = {
    sampleTweets,
    sampleTemplates,
    sampleTwitterLists,
    sampleAnalysisResults,
    sampleCronTasks,
    mockChatGPTResponse,
    mockTwitterAPIResponse,
    mockTimestamp,
    mockFirestoreDoc,
    mockFirestoreSnapshot
};