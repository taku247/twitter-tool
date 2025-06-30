const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const { OpenAI } = require('openai');
const WebSocket = require('ws');
const http = require('http');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc, query, orderBy, limit, getDocs, deleteDoc, doc, where, writeBatch, setDoc, getDoc, updateDoc } = require('firebase/firestore');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // リクエストサイズ制限を50MBに拡大
app.use(express.static(path.join(__dirname, 'public')));

// APIキーの確認
if (!process.env.TWITTER_API_KEY) {
    console.error('Error: TWITTER_API_KEY is not set in .env file');
    process.exit(1);
}

// Firebase 初期化
const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    measurementId: process.env.FIREBASE_MEASUREMENT_ID
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp); // デフォルトデータベースを使用
console.log('Firebase Firestore initialized with default database');

// タイムゾーン設定確認
console.log('🕐 Server timezone info:', {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    offset: new Date().getTimezoneOffset(),
    currentTime: new Date().toISOString(),
    environment: process.env.VERCEL_ENV || 'local'
});

// OpenAI クライアントの初期化
let openai = null;
if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });
    console.log('OpenAI API configured');
} else {
    console.warn('Warning: OPENAI_API_KEY is not set. Summary features will be disabled.');
}

// APIプロキシエンドポイント - 検索
app.post('/api/twitter/search', async (req, res) => {
    try {
        const { query, sortType = 'Top' } = req.body;
        
        if (!query) {
            return res.status(400).json({ error: 'Query parameter is required' });
        }

        const url = 'https://api.twitterapi.io/twitter/tweet/advanced_search';
        
        console.log(`Searching with query: "${query}", sortType: "${sortType}"`);
        
        // 古い順の場合はLatestで取得して後でソート
        const apiSortType = sortType === 'Oldest' ? 'Latest' : sortType;
        
        const response = await axios.get(url, {
            params: { 
                query,
                queryType: apiSortType  // 'Latest' or 'Top'
            },
            headers: {
                'X-API-Key': process.env.TWITTER_API_KEY,
                'Content-Type': 'application/json'
            }
        });
        
        let responseData = response.data;
        
        // 古い順の場合は、tweets配列を逆順にソート
        if (sortType === 'Oldest' && responseData.tweets && Array.isArray(responseData.tweets)) {
            console.log('DEBUG: First tweet before sorting:', JSON.stringify(responseData.tweets[0], null, 2));
            
            responseData.tweets = responseData.tweets.sort((a, b) => {
                // 複数の日付フィールドを試行
                const dateA = new Date(a.created_at || a.createdAt || a.date || a.timestamp || 0);
                const dateB = new Date(b.created_at || b.createdAt || b.date || b.timestamp || 0);
                
                console.log(`DEBUG: Comparing ${dateA.toISOString()} vs ${dateB.toISOString()}`);
                return dateA - dateB; // 古い順（昇順）
            });
            
            console.log(`Sorted ${responseData.tweets.length} tweets in oldest-first order`);
            console.log('DEBUG: First tweet after sorting:', responseData.tweets[0]?.created_at || responseData.tweets[0]?.createdAt || responseData.tweets[0]?.date);
            console.log('DEBUG: Last tweet after sorting:', responseData.tweets[responseData.tweets.length-1]?.created_at || responseData.tweets[responseData.tweets.length-1]?.createdAt || responseData.tweets[responseData.tweets.length-1]?.date);
        }
        
        res.json(responseData);
    } catch (error) {
        console.error('API Error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.response?.data || { message: error.message }
        });
    }
});

// APIプロキシエンドポイント - リスト（全ページ取得）
app.post('/api/twitter/list', async (req, res) => {
    try {
        const { listId, sinceTime, untilTime, includeReplies } = req.body;
        
        if (!listId) {
            return res.status(400).json({ error: 'List ID parameter is required' });
        }

        // TwitterAPI.ioの公式リストエンドポイント
        const url = 'https://api.twitterapi.io/twitter/list/tweets';
        
        const baseParams = { listId: listId };
        
        // 期間フィルターの追加
        if (sinceTime) {
            baseParams.sinceTime = Math.floor(sinceTime); // Unix timestamp in seconds
        }
        if (untilTime) {
            baseParams.untilTime = Math.floor(untilTime); // Unix timestamp in seconds
        }
        
        // リプライ含有設定
        if (typeof includeReplies === 'boolean') {
            baseParams.includeReplies = includeReplies;
        }
        
        console.log('List API Request - fetching all pages with params:', baseParams);
        
        // 全ページのツイートを収集
        let allTweets = [];
        let cursor = ''; // 初回は空文字
        let pageCount = 0;
        const maxPages = 50; // 安全のための上限（1000ツイート）
        
        while (pageCount < maxPages) {
            try {
                const params = { ...baseParams };
                if (cursor) {
                    params.cursor = cursor;
                }
                
                console.log(`Fetching page ${pageCount + 1}, cursor: ${cursor || 'initial'}`);
                
                const response = await axios.get(url, {
                    params,
                    headers: {
                        'X-API-Key': process.env.TWITTER_API_KEY,
                        'Content-Type': 'application/json'
                    }
                });
                
                const data = response.data;
                
                // レスポンス構造をデバッグ出力（必要に応じてコメントアウト）
                // console.log(`Page ${pageCount + 1} response:`, JSON.stringify(data, null, 2));
                
                // ツイートを配列に追加
                if (data.tweets && Array.isArray(data.tweets)) {
                    allTweets = allTweets.concat(data.tweets);
                    console.log(`Page ${pageCount + 1}: ${data.tweets.length} tweets, total: ${allTweets.length}`);
                } else {
                    console.log(`Page ${pageCount + 1}: No tweets array found in response`);
                }
                
                // 次のページのカーソルをチェック（修正版）
                console.log(`Current cursor: "${cursor}", Next cursor: "${data.next_cursor}", Has next: ${data.has_next_page}`);
                if (data.has_next_page && data.next_cursor && data.next_cursor !== cursor) {
                    cursor = data.next_cursor;
                    pageCount++;
                    console.log(`Moving to next page with cursor: ${cursor}`);
                } else {
                    // 次ページがない場合は終了
                    console.log('No more pages available');
                    console.log(`Has next page: ${data.has_next_page}, Next cursor exists: ${!!data.next_cursor}`);
                    break;
                }
                
                // ページが少ない場合は終了
                if (!data.tweets || data.tweets.length === 0) {
                    console.log('No tweets in current page, stopping');
                    break;
                }
                
            } catch (pageError) {
                console.error(`Error fetching page ${pageCount + 1}:`, pageError.message);
                break;
            }
        }
        
        if (pageCount >= maxPages) {
            console.warn(`Reached maximum page limit (${maxPages}), stopping pagination`);
        }
        
        // 結果を返す
        const result = {
            tweets: allTweets,
            totalTweets: allTweets.length,
            pagesRetrieved: pageCount + 1,
            note: pageCount >= maxPages ? 'Maximum page limit reached' : 'All available pages retrieved'
        };
        
        console.log(`List API Complete: ${result.totalTweets} tweets from ${result.pagesRetrieved} pages`);
        res.json(result);
        
    } catch (error) {
        console.error('List API Error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.response?.data || { 
                message: error.message,
                note: 'List endpoint may not be available or require different parameters. Please check TwitterAPI.io documentation.'
            }
        });
    }
});

// APIプロキシエンドポイント - 単一ツイート取得
app.post('/api/twitter/tweet', async (req, res) => {
    try {
        const { tweetId, tweetUrl } = req.body;
        
        if (!tweetId) {
            return res.status(400).json({ error: 'Tweet ID parameter is required' });
        }

        console.log(`Fetching tweet: ${tweetId}`);
        
        // TwitterAPI.ioの正しいエンドポイントを試行
        const possibleEndpoints = [
            'https://api.twitterapi.io/twitter/tweet/by_id',
            'https://api.twitterapi.io/twitter/tweet/get',
            'https://api.twitterapi.io/twitter/tweet/single',
            'https://api.twitterapi.io/twitter/tweet'
        ];
        
        let response = null;
        let lastError = null;
        
        for (const url of possibleEndpoints) {
            try {
                console.log(`Trying endpoint: ${url}`);
                
                // パラメータ名も複数パターンを試行
                const paramVariations = [
                    { tweetId },
                    { id: tweetId },
                    { tweet_id: tweetId },
                    { status_id: tweetId }
                ];
                
                for (const params of paramVariations) {
                    try {
                        response = await axios.get(url, {
                            params,
                            headers: {
                                'X-API-Key': process.env.TWITTER_API_KEY,
                                'Content-Type': 'application/json'
                            }
                        });
                        
                        if (response.status === 200) {
                            console.log(`Success with endpoint: ${url}, params:`, params);
                            break;
                        }
                    } catch (paramError) {
                        console.log(`Failed with params:`, params, paramError.response?.status);
                        continue;
                    }
                }
                
                if (response && response.status === 200) {
                    break;
                }
                
            } catch (error) {
                console.log(`Failed endpoint ${url}:`, error.response?.status || error.message);
                lastError = error;
                continue;
            }
        }
        
        if (!response || response.status !== 200) {
            // 単一ツイート取得が失敗した場合、検索エンドポイントで試行
            console.log('Trying search endpoint as fallback...');
            try {
                const searchResponse = await axios.get('https://api.twitterapi.io/twitter/tweet/advanced_search', {
                    params: { 
                        query: `url:twitter.com/*/status/${tweetId} OR url:x.com/*/status/${tweetId}` 
                    },
                    headers: {
                        'X-API-Key': process.env.TWITTER_API_KEY,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (searchResponse.data && searchResponse.data.tweets && searchResponse.data.tweets.length > 0) {
                    console.log('Found tweet via search endpoint');
                    res.json({ tweet: searchResponse.data.tweets[0] });
                    return;
                }
            } catch (searchError) {
                console.log('Search fallback also failed:', searchError.response?.status);
            }
            
            // ユーザー名ベースの検索も試行（URLが提供されている場合）
            if (tweetUrl) {
                try {
                    const userMatch = tweetUrl.match(/(?:twitter\.com|x\.com)\/([^\/]+)\/status/);
                    if (userMatch && userMatch[1]) {
                        const username = userMatch[1];
                        console.log(`Trying user-based search for @${username}`);
                        
                        const userSearchResponse = await axios.get('https://api.twitterapi.io/twitter/tweet/advanced_search', {
                            params: { 
                                query: `from:${username}`,
                                count: 50  // 最近の50件を取得
                            },
                            headers: {
                                'X-API-Key': process.env.TWITTER_API_KEY,
                                'Content-Type': 'application/json'
                            }
                        });
                        
                        if (userSearchResponse.data && userSearchResponse.data.tweets) {
                            // ツイートIDでマッチするものを探す
                            const matchingTweet = userSearchResponse.data.tweets.find(tweet => 
                                tweet.id === tweetId || tweet.id_str === tweetId
                            );
                            
                            if (matchingTweet) {
                                console.log('Found tweet via user search');
                                res.json({ tweet: matchingTweet });
                                return;
                            }
                        }
                    }
                } catch (userSearchError) {
                    console.log('User search fallback also failed:', userSearchError.response?.status);
                }
            }
            
            throw lastError || new Error('All endpoints and fallback methods failed');
        }
        
        console.log(`Tweet fetched successfully: ${tweetId}`);
        res.json(response.data);
        
    } catch (error) {
        console.error('Tweet API Error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.response?.data || { 
                message: error.message,
                note: 'Tweet may be deleted, private, or the ID may be incorrect.'
            }
        });
    }
});

// APIプロキシエンドポイント - OpenAI接続テスト
app.post('/api/openai/test', async (req, res) => {
    try {
        if (!openai) {
            return res.status(503).json({ 
                error: 'OpenAI API is not configured. Please set OPENAI_API_KEY in .env file.' 
            });
        }

        const { message } = req.body;
        const testMessage = message || "Hello! This is a connection test.";

        console.log('Testing OpenAI API connection...');
        
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system", 
                    content: "You are a helpful assistant that provides detailed analysis."
                },
                {
                    role: "user", 
                    content: testMessage
                }
            ],
            max_tokens: 4000,
            temperature: 0.7
        });

        const response = completion.choices[0].message.content;
        
        res.json({
            success: true,
            message: 'OpenAI API connection successful',
            request: testMessage,
            response: response,
            model: completion.model,
            usage: completion.usage
        });

    } catch (error) {
        console.error('OpenAI API Error:', error.message);
        res.status(500).json({
            success: false,
            error: { 
                message: error.message,
                type: error.type || 'unknown'
            }
        });
    }
});

// APIプロキシエンドポイント - ツイート要約
app.post('/api/twitter/summarize', async (req, res) => {
    try {
        if (!openai) {
            return res.status(503).json({ 
                error: 'OpenAI API is not configured. Please set OPENAI_API_KEY in .env file.' 
            });
        }

        const { tweets, summaryType = 'brief' } = req.body;
        
        if (!tweets || !Array.isArray(tweets)) {
            return res.status(400).json({ error: 'Tweets array is required' });
        }

        if (tweets.length === 0) {
            return res.status(400).json({ error: 'No tweets to summarize' });
        }

        console.log(`Summarizing ${tweets.length} tweets with type: ${summaryType}`);
        
        // ツイートの構造をデバッグ出力
        console.log('First tweet structure:', JSON.stringify(tweets[0], null, 2));

        // ツイートテキストを抽出・整形
        const tweetTexts = tweets.map((tweet, index) => {
            const text = tweet.text || tweet.content || JSON.stringify(tweet);
            const author = tweet.user?.screen_name || tweet.author || 'Unknown';
            const date = tweet.created_at || tweet.date || '';
            return `${index + 1}. @${author} (${date}): ${text}`;
        }).join('\n\n');
        
        console.log(`Tweet texts length: ${tweetTexts.length} characters`);

        // 要約タイプに応じたプロンプト設定
        let systemPrompt = '';
        let userPrompt = '';

        switch (summaryType) {
            case 'brief':
                systemPrompt = 'ツイート内容を簡潔に要約してください。';
                userPrompt = `以下のツイートを分析し、完全な要約を提供してください：\n1. 主要なトピック\n2. 感情分析\n3. 注目すべき意見\n4. 全体的な要約\n\n${tweetTexts}`;
                break;
            case 'detailed':
                systemPrompt = 'あなたは詳細な分析を得意とする情報アナリストです。ツイートの内容を詳しく分析してください。';
                userPrompt = `以下のツイートを詳細に分析し、以下の観点で要約してください：\n1. 主要なトピック\n2. 重要な発言・意見\n3. 全体的な傾向\n4. 注目すべき情報\n\n${tweetTexts}`;
                break;
            case 'trends':
                systemPrompt = 'あなたはトレンド分析の専門家です。ツイートからトレンドや傾向を抽出してください。';
                userPrompt = `以下のツイートからトレンドや傾向を分析してください：\n1. 話題になっているトピック\n2. 意見の傾向\n3. 時系列での変化\n4. 将来への示唆\n\n${tweetTexts}`;
                break;
            case 'sentiment':
                systemPrompt = 'あなたは感情分析の専門家です。ツイートの感情や反応を分析してください。';
                userPrompt = `以下のツイートの感情や反応を分析してください：\n1. 全体的な感情（ポジティブ/ネガティブ/ニュートラル）\n2. 主要な感情の種類\n3. 感情の強度\n4. 感情の分布\n\n${tweetTexts}`;
                break;
            default:
                systemPrompt = 'あなたは優秀な情報要約アシスタントです。';
                userPrompt = `以下のツイートを要約してください。\n\n${tweetTexts}`;
        }

        // OpenAI APIで要約生成
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: systemPrompt
                },
                {
                    role: "user",
                    content: userPrompt
                }
            ],
            max_tokens: 8000,
            temperature: 0.3
        });

        const summary = completion.choices[0].message.content;
        
        // デバッグ情報を出力
        console.log('OpenAI Response Details:');
        console.log('- Model:', completion.model);
        console.log('- Usage:', JSON.stringify(completion.usage, null, 2));
        console.log('- Finish reason:', completion.choices[0].finish_reason);
        console.log('- Response length:', summary?.length || 0);
        console.log('- Response preview:', summary?.substring(0, 200) + '...');

        // 結果を返す
        const result = {
            success: true,
            summary: summary,
            summaryType: summaryType,
            tweetCount: tweets.length,
            tokensUsed: completion.usage,
            model: completion.model,
            finishReason: completion.choices[0].finish_reason
        };

        console.log(`Summary complete: ${summaryType} summary for ${tweets.length} tweets`);
        res.json(result);

    } catch (error) {
        console.error('Summarize API Error:', error.message);
        res.status(500).json({
            success: false,
            error: { 
                message: error.message,
                type: error.type || 'unknown'
            }
        });
    }
});

// APIプロキシエンドポイント - ユーザー情報取得
app.post('/api/twitter/user-info', async (req, res) => {
    try {
        const { username } = req.body;
        
        if (!username) {
            return res.status(400).json({ error: 'Username parameter is required' });
        }

        console.log(`Fetching user info for: ${username}`);
        
        // TwitterAPI.ioでユーザー情報を取得（検索エンドポイントを使用）
        const searchResponse = await axios.get('https://api.twitterapi.io/twitter/tweet/advanced_search', {
            params: { 
                query: `from:${username}`,
                count: 1  // 最新の1件だけ取得してユーザー情報を確認
            },
            headers: {
                'X-API-Key': process.env.TWITTER_API_KEY,
                'Content-Type': 'application/json'
            }
        });
        
        if (searchResponse.data && searchResponse.data.tweets && searchResponse.data.tweets.length > 0) {
            const userInfo = searchResponse.data.tweets[0].author;
            console.log(`User found: @${userInfo.userName}`);
            res.json({ 
                success: true,
                user: {
                    id: userInfo.id,
                    username: userInfo.userName,
                    name: userInfo.name,
                    profile_image_url: userInfo.profilePicture,
                    followers_count: userInfo.followers,
                    following_count: userInfo.following,
                    verified: userInfo.isVerified || false
                }
            });
        } else {
            console.log(`User not found: ${username}`);
            res.status(404).json({ 
                success: false,
                error: 'User not found or has no recent tweets' 
            });
        }
        
    } catch (error) {
        console.error('User Info API Error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data || { 
                message: error.message,
                note: 'User may not exist or account may be private.'
            }
        });
    }
});

// APIプロキシエンドポイント - ユーザーのツイート取得
app.post('/api/twitter/user-tweets', async (req, res) => {
    try {
        const { username, count = 20 } = req.body;
        
        if (!username) {
            return res.status(400).json({ error: 'Username parameter is required' });
        }

        console.log(`Fetching tweets for user: ${username}`);
        
        // TwitterAPI.ioでユーザーのツイートを取得
        const response = await axios.get('https://api.twitterapi.io/twitter/tweet/advanced_search', {
            params: { 
                query: `from:${username}`,
                count: count
            },
            headers: {
                'X-API-Key': process.env.TWITTER_API_KEY,
                'Content-Type': 'application/json'
            }
        });
        
        console.log(`Found ${response.data.tweets?.length || 0} tweets for @${username}`);
        res.json({
            success: true,
            tweets: response.data.tweets || [],
            user: response.data.tweets?.[0]?.author || null,
            count: response.data.tweets?.length || 0
        });
        
    } catch (error) {
        console.error('User Tweets API Error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data || { 
                message: error.message,
                note: 'Unable to fetch user tweets. User may not exist or account may be private.'
            }
        });
    }
});

// ヘルスチェックエンドポイント
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        services: {
            twitter: !!process.env.TWITTER_API_KEY,
            openai: !!process.env.OPENAI_API_KEY
        }
    });
});

// TwitterAPI.io Webhook受信エンドポイント
app.post('/webhook/twitter', (req, res) => {
    try {
        console.log('🎯 Webhook received from TwitterAPI.io');
        console.log('Headers:', JSON.stringify(req.headers, null, 2));
        console.log('Body:', JSON.stringify(req.body, null, 2));
        
        const webhookData = req.body;
        
        // Webhookデータの構造を確認
        if (webhookData.tweets && Array.isArray(webhookData.tweets)) {
            console.log(`📢 Webhook: ${webhookData.tweets.length} new tweets received`);
            
            webhookData.tweets.forEach((tweet, index) => {
                console.log(`Tweet ${index + 1}: @${tweet.author?.userName}: ${tweet.text?.substring(0, 100)}...`);
                
                // WebSocketクライアントに転送
                broadcastToClients({
                    type: 'tweet',
                    tweet: tweet,
                    source: 'webhook',
                    timestamp: new Date().toISOString()
                });
            });
        } else if (webhookData.tweet) {
            // 単一ツイートの場合
            console.log(`📢 Webhook: Single tweet from @${webhookData.tweet.author?.userName}`);
            
            broadcastToClients({
                type: 'tweet',
                tweet: webhookData.tweet,
                source: 'webhook',
                timestamp: new Date().toISOString()
            });
        } else {
            console.log('📋 Webhook: Unknown data structure');
            console.log('Data:', webhookData);
            
            // ログとして表示
            broadcastToClients({
                type: 'webhook_data',
                data: webhookData,
                timestamp: new Date().toISOString()
            });
        }
        
        // TwitterAPI.ioに成功レスポンスを返す
        res.status(200).json({ 
            success: true, 
            message: 'Webhook received successfully',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Webhook processing error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Webhook テストエンドポイント
app.post('/webhook/test', (req, res) => {
    console.log('🧪 Test webhook called');
    console.log('Body:', req.body);
    
    broadcastToClients({
        type: 'status',
        message: 'テストWebhookが正常に受信されました',
        data: req.body
    });
    
    res.json({ success: true, message: 'Test webhook received' });
});

// HTMLファイルを提供
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// HTTPサーバーを作成
const server = http.createServer(app);

// WebSocketサーバーを作成（Vercel環境では動作しない）
let wss = null;
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    wss = new WebSocket.Server({ server });
} else {
    console.log('🔄 Running in production/Vercel mode - WebSocket disabled, using polling mode');
}

// Twitter WebSocket接続管理
let twitterWs = null;
let currentMonitoringUsername = null;
let connectedClients = new Set();

// WebSocket接続ハンドラー（ローカル環境のみ）
if (wss) {
    wss.on('connection', (ws) => {
    console.log('New WebSocket client connected');
    connectedClients.add(ws);
    
    // クライアントに接続成功を通知
    ws.send(JSON.stringify({
        type: 'status',
        message: 'WebSocket接続が確立されました'
    }));
    
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            console.log('Received message from client:', data);
            
            if (data.action === 'monitor' && data.username) {
                // Webhookが既に動作しているので、WebSocket接続のみ確立
                console.log(`📡 WebSocket monitoring enabled for: @${data.username}`);
                currentMonitoringUsername = data.username;
                
                ws.send(JSON.stringify({
                    type: 'status',
                    message: `@${data.username} の監視を開始しました (Webhook経由)`
                }));
            }
        } catch (error) {
            console.error('WebSocket message error:', error);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'メッセージの処理中にエラーが発生しました'
            }));
        }
    });
    
    ws.on('close', () => {
        console.log('WebSocket client disconnected');
        connectedClients.delete(ws);
        
        // 最後のクライアントが切断された場合、Twitter監視を停止
        if (connectedClients.size === 0 && twitterWs) {
            stopTwitterMonitoring();
        }
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        connectedClients.delete(ws);
    });
    });
}

// Twitter WebSocket監視を開始 (修正版：フィルタールール事前設定方式)
async function startTwitterMonitoring(username) {
    try {
        if (twitterWs) {
            console.log('Stopping existing Twitter monitoring...');
            twitterWs.close();
            twitterWs = null;
        }
        
        console.log(`🚀 Starting Twitter monitoring for: @${username}`);
        currentMonitoringUsername = username;
        
        // Step 1: 事前にREST APIでフィルタールールを設定
        console.log(`📝 Setting up filter rule via REST API for @${username}...`);
        const ruleSetup = await setupFilterRuleForWebSocket(username);
        
        if (!ruleSetup.success) {
            throw new Error(`Filter rule setup failed: ${ruleSetup.error}`);
        }
        
        console.log(`✅ Filter rule setup completed: ${JSON.stringify(ruleSetup)}`);
        
        // Step 2: WebSocket接続を開始
        const possibleEndpoints = [
            'wss://ws.twitterapi.io/twitter/tweet/websocket',
            'wss://api.twitterapi.io/websocket', 
            'wss://stream.twitterapi.io/twitter/tweet/websocket',
            'wss://ws.twitterapi.io/websocket'
        ];
        
        let connectedSuccessfully = false;
        
        for (const endpoint of possibleEndpoints) {
            if (connectedSuccessfully) break;
            
            try {
                console.log(`🔌 Trying WebSocket endpoint: ${endpoint}`);
                
                // TwitterAPI.io WebSocketに接続
                twitterWs = new WebSocket(endpoint, {
                    headers: {
                        'X-API-Key': process.env.TWITTER_API_KEY,
                        'Authorization': `Bearer ${process.env.TWITTER_API_KEY}`,
                        'User-Agent': 'TwitterMonitor/1.0'
                    }
                });
                
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        reject(new Error('Connection timeout'));
                    }, 10000);
                    
                    twitterWs.on('open', () => {
                        clearTimeout(timeout);
                        console.log(`✅ Successfully connected to TwitterAPI.io WebSocket: ${endpoint}`);
                        connectedSuccessfully = true;
                        
                        // WebSocket接続後はフィルタールール送信不要（事前設定済み）
                        console.log(`📡 Connected and ready to receive tweets for @${username}`);
                        console.log(`⏳ Waiting for tweets based on pre-configured filter rule...`);
                        
                        // クライアントに通知
                        broadcastToClients({
                            type: 'status',
                            message: `@${username} の監視を開始しました (Endpoint: ${endpoint})`,
                            filterRule: ruleSetup.rule
                        });
                        
                        resolve();
                    });
                    
                    twitterWs.on('error', (error) => {
                        clearTimeout(timeout);
                        console.log(`❌ Failed to connect to ${endpoint}:`, error.message);
                        reject(error);
                    });
                });
                
                // 接続成功したらメッセージハンドラーを設定
                twitterWs.on('message', (message) => {
                    try {
                        const data = JSON.parse(message);
                        
                        // 全メッセージを詳細ログ出力
                        console.log('=== TwitterAPI.io WebSocket Message ===');
                        console.log('Raw message:', message.toString());
                        console.log('Parsed data:', JSON.stringify(data, null, 2));
                        console.log('Message type detected:', typeof data);
                        console.log('=======================================');
                        
                        // ルール追加の成功/失敗を確認
                        if (data.action === 'add_rule' || data.type === 'rule_added') {
                            console.log('✅ Rule addition response:', data);
                            broadcastToClients({
                                type: 'rule_status',
                                message: `フィルタールール追加: ${data.success ? '成功' : '失敗'}`,
                                data: data
                            });
                        }
                        
                        // ツイートデータをクライアントに転送
                        if (data.event_type === 'tweet' || data.type === 'tweet') {
                            const tweets = data.tweets || (data.tweet ? [data.tweet] : []);
                            if (tweets.length > 0) {
                                const tweet = tweets[0];
                                console.log(`🐦 New tweet from @${tweet.author?.userName || tweet.user?.screen_name}: ${tweet.text?.substring(0, 100)}...`);
                                
                                broadcastToClients({
                                    type: 'tweet',
                                    tweet: tweet
                                });
                            }
                        } else if (data.event_type === 'ping' || data.type === 'ping') {
                            console.log('📡 Received ping from TwitterAPI.io');
                            broadcastToClients({
                                type: 'ping',
                                message: 'TwitterAPI.io接続正常'
                            });
                        } else if (data.error || data.errors) {
                            const errorMsg = data.error || (data.errors && data.errors[0]?.message) || 'Unknown error';
                            console.error('❌ TwitterAPI.io error:', errorMsg);
                            broadcastToClients({
                                type: 'error',
                                message: `TwitterAPI.io エラー: ${errorMsg}`,
                                data: data
                            });
                        } else if (data.status || data.message) {
                            console.log('ℹ️  TwitterAPI.io status:', data.status || data.message);
                            broadcastToClients({
                                type: 'status',
                                message: data.status || data.message,
                                data: data
                            });
                        } else {
                            // 未知のメッセージタイプ
                            console.log('❓ Unknown message type from TwitterAPI.io:', data);
                            broadcastToClients({
                                type: 'unknown',
                                message: 'Unknown message received',
                                data: data
                            });
                        }
                    } catch (error) {
                        console.error('Error parsing TwitterAPI.io message:', error);
                        console.log('Raw message that failed to parse:', message.toString());
                        broadcastToClients({
                            type: 'error',
                            message: `メッセージ解析エラー: ${error.message}`
                        });
                    }
                });
                
                break; // 成功したらループを抜ける
                
            } catch (error) {
                console.log(`Failed to connect to ${endpoint}:`, error.message);
                if (twitterWs) {
                    twitterWs.close();
                    twitterWs = null;
                }
                continue;
            }
        }
        
        if (!connectedSuccessfully) {
            throw new Error('All WebSocket endpoints failed to connect');
        }
        
        twitterWs.on('error', (error) => {
            console.error('TwitterAPI.io WebSocket error:', error);
            broadcastToClients({
                type: 'error',
                message: `Twitter監視エラー: ${error.message}`
            });
        });
        
        twitterWs.on('close', (code, reason) => {
            console.log(`TwitterAPI.io WebSocket closed: ${code} - ${reason}`);
            console.log('Close code meanings:');
            console.log('  1000: Normal closure');
            console.log('  1001: Going away');
            console.log('  1002: Protocol error');
            console.log('  1003: Unsupported data');
            console.log('  1006: Abnormal closure (no close frame)');
            console.log('  1011: Server error');
            
            broadcastToClients({
                type: 'status',
                message: `Twitter監視が停止されました (Code: ${code})`
            });
            
            twitterWs = null;
            currentMonitoringUsername = null;
            
            // 異常終了の場合は再接続を試行
            if (code !== 1000 && connectedClients.size > 0) {
                console.log('Attempting to reconnect in 15 seconds...');
                setTimeout(() => {
                    if (connectedClients.size > 0 && !twitterWs) {
                        startTwitterMonitoring(username);
                    }
                }, 15000);
            }
        });
        
    } catch (error) {
        console.error('Error starting Twitter monitoring:', error);
        broadcastToClients({
            type: 'error',
            message: `監視開始エラー: ${error.message}`
        });
    }
}

// Twitter WebSocket監視を停止
function stopTwitterMonitoring() {
    if (twitterWs) {
        console.log('Stopping Twitter monitoring...');
        
        // ルールを削除
        if (currentMonitoringUsername) {
            const removeRule = {
                query: `from:${currentMonitoringUsername}`,
                action: 'remove_rule'
            };
            twitterWs.send(JSON.stringify(removeRule));
        }
        
        twitterWs.close(1000, 'Monitoring stopped by user');
        twitterWs = null;
        currentMonitoringUsername = null;
        
        broadcastToClients({
            type: 'status',
            message: 'Twitter監視が停止されました'
        });
    }
}

// Firestoreにツイートを保存する関数
async function saveTweetToFirestore(tweet) {
    try {
        const tweetData = {
            ...tweet,
            receivedAt: Date.now(),
            createdAtFirestore: new Date()
        };
        
        const docRef = await addDoc(collection(db, 'realtime-tweets'), tweetData);
        console.log(`🔥 Tweet saved to Firestore with ID: ${docRef.id}`);
        
        // 古いツイートを削除（最新50件のみ保持）
        await cleanupOldTweets();
        
    } catch (error) {
        console.error('❌ Error saving tweet to Firestore:', error);
    }
}

// 古いツイートを削除する関数
async function cleanupOldTweets() {
    try {
        const tweetsRef = collection(db, 'realtime-tweets');
        const q = query(tweetsRef, orderBy('receivedAt', 'desc'));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.size > 50) {
            const batch = writeBatch(db);
            const docsToDelete = querySnapshot.docs.slice(50); // 50件以降を削除
            
            docsToDelete.forEach((doc) => {
                batch.delete(doc.ref);
            });
            
            await batch.commit();
            console.log(`🧹 Deleted ${docsToDelete.length} old tweets from Firestore`);
        }
    } catch (error) {
        console.error('❌ Error cleaning up old tweets:', error);
    }
}

// 全てのクライアントにメッセージをブロードキャスト
async function broadcastToClients(message) {
    const messageStr = JSON.stringify(message);
    console.log(`📡 Broadcasting to ${connectedClients.size} clients:`, message.type || 'unknown');
    
    // Vercel環境では、リアルタイムツイートをFirestoreに保存
    if (message.type === 'tweet' && message.tweet) {
        // メモリバッファにも保存（ローカル環境用）
        recentTweets.unshift({
            ...message.tweet,
            receivedAt: Date.now()
        });
        
        // 最大50件まで保持
        if (recentTweets.length > 50) {
            recentTweets = recentTweets.slice(0, 50);
        }
        
        // Firestoreに永続化（Vercel環境用）
        await saveTweetToFirestore(message.tweet);
        
        console.log(`🐦 Tweet buffered locally (${recentTweets.length} items) and saved to Firestore`);
    }
    
    // WebSocketクライアントがある場合は従来通り送信
    if (connectedClients.size === 0) {
        console.log('⚠️ No WebSocket clients connected, tweet saved to buffer and Firestore for polling');
        return;
    }
    
    connectedClients.forEach((client) => {
        if (client.type === 'sse') {
            // Server-Sent Events クライアント
            try {
                client.res.write(`data: ${messageStr}\n\n`);
                console.log('✅ Message sent to SSE client');
            } catch (error) {
                console.log('❌ SSE client error, removing from connectedClients');
                connectedClients.delete(client);
            }
        } else if (client.readyState === WebSocket.OPEN) {
            // WebSocket クライアント
            client.send(messageStr);
            console.log('✅ Message sent to WebSocket client');
        } else {
            console.log('❌ Client not ready, removing from connectedClients');
            connectedClients.delete(client);
        }
    });
}

// Server-Sent Events エンドポイント（Vercel対応）
app.get('/api/realtime/stream', (req, res) => {
    // SSE用のヘッダーを設定
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // SSEクライアントを接続リストに追加
    const clientId = Date.now() + Math.random();
    const sseClient = { id: clientId, res, type: 'sse' };
    connectedClients.add(sseClient);
    
    console.log(`SSE client connected: ${clientId}`);
    
    // 接続確認メッセージを送信
    res.write(`data: ${JSON.stringify({
        type: 'connection',
        message: 'Server-Sent Events接続が確立されました',
        timestamp: Date.now()
    })}\n\n`);
    
    // ハートビート（30秒間隔）
    const heartbeat = setInterval(() => {
        try {
            res.write(`data: ${JSON.stringify({
                type: 'ping',
                timestamp: Date.now()
            })}\n\n`);
        } catch (error) {
            console.log(`SSE heartbeat failed for client ${clientId}`);
            clearInterval(heartbeat);
            connectedClients.delete(sseClient);
        }
    }, 30000);
    
    // クライアント切断時の処理
    req.on('close', () => {
        console.log(`SSE client disconnected: ${clientId}`);
        clearInterval(heartbeat);
        connectedClients.delete(sseClient);
    });
    
    req.on('error', (error) => {
        console.log(`SSE client error: ${clientId}`, error);
        clearInterval(heartbeat);
        connectedClients.delete(sseClient);
    });
});

// Vercel環境用：ポーリングベースのリアルタイム更新エンドポイント
// 最新ツイートを取得するAPIエンドポイント
app.get('/api/realtime/latest', async (req, res) => {
    try {
        // 環境の検出
        const isVercel = process.env.VERCEL || req.headers.host?.includes('vercel.app');
        
        let latestTweets = [];
        
        if (isVercel) {
            // Vercel環境：Firestoreから取得
            console.log('🔥 Vercel environment detected, fetching tweets from Firestore');
            try {
                const tweetsRef = collection(db, 'realtime-tweets');
                const q = query(tweetsRef, orderBy('receivedAt', 'desc'), limit(10));
                const querySnapshot = await getDocs(q);
                
                latestTweets = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                
                console.log(`📥 Retrieved ${latestTweets.length} tweets from Firestore`);
            } catch (firestoreError) {
                console.error('❌ Firestore error, falling back to memory buffer:', firestoreError);
                latestTweets = recentTweets.slice(0, 10);
            }
        } else {
            // ローカル環境：メモリから取得
            console.log('💻 Local environment detected, using in-memory buffer');
            latestTweets = recentTweets.slice(0, 10);
        }
        
        res.json({
            success: true,
            latestTweets: latestTweets,
            timestamp: Date.now(),
            isMonitoring: !!currentMonitoringUsername,
            monitoringUser: currentMonitoringUsername,
            environment: isVercel ? 'vercel' : 'local',
            source: isVercel ? 'firestore' : 'memory'
        });
        
    } catch (error) {
        console.error('❌ Error fetching latest tweets:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch latest tweets',
            message: error.message
        });
    }
});

// Firestoreのツイート確認用デバッグエンドポイント
app.get('/api/debug/firestore-tweets', async (req, res) => {
    try {
        const tweetsRef = collection(db, 'realtime-tweets');
        const q = query(tweetsRef, orderBy('receivedAt', 'desc'), limit(20));
        const querySnapshot = await getDocs(q);
        
        const tweets = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAtFirestore: doc.data().createdAtFirestore?.toDate()?.toISOString()
        }));
        
        res.json({
            success: true,
            totalCount: querySnapshot.size,
            tweets: tweets,
            timestamp: Date.now()
        });
        
    } catch (error) {
        console.error('❌ Error fetching Firestore tweets:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch Firestore tweets',
            message: error.message
        });
    }
});

// リアルタイムツイート用のバッファ
let recentTweets = [];

// WebSocket用フィルタールール事前設定関数
async function setupFilterRuleForWebSocket(username) {
    try {
        console.log(`🔧 Setting up filter rule for WebSocket monitoring: @${username}`);
        
        // TwitterAPI.ioの正確なフィルタールールエンドポイント（ドキュメント準拠）
        const possibleEndpoints = [
            'https://api.twitterapi.io/oapi/tweet_filter/add_rule',
            'https://api.twitterapi.io/oapi/tweet_filter/update_rule',
            'https://api.twitterapi.io/twitter/webhook/filter-rule',
            'https://api.twitterapi.io/webhook/filter-rule'
        ];
        
        let response = null;
        let lastError = null;
        
        for (const url of possibleEndpoints) {
            try {
                console.log(`📡 Trying filter rule setup endpoint: ${url}`);
                
                // TwitterAPI.ioの正確なフォーマットでリクエスト
                const requestData = {
                    query: `from:${username}`,
                    isActive: true, // WebSocket用なので必ずアクティブ
                    pollingInterval: 10, // 10秒間隔で高頻度チェック
                    tag: `websocket_monitor_${username}_${Date.now()}`,
                    webhook: null, // WebSocket用なのでwebhookは不要
                    type: 'websocket' // WebSocketタイプを明示
                };
                
                console.log(`📋 Request data:`, JSON.stringify(requestData, null, 2));
                
                response = await axios.post(url, requestData, {
                    headers: {
                        'X-API-Key': process.env.TWITTER_API_KEY,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (response && response.status === 200) {
                    console.log(`✅ Success with endpoint: ${url}`);
                    console.log(`📊 Response:`, JSON.stringify(response.data, null, 2));
                    break;
                }
                
            } catch (error) {
                console.log(`❌ Failed endpoint ${url}:`, error.response?.status, error.response?.data?.message || error.message);
                lastError = error;
                continue;
            }
        }
        
        if (!response || response.status !== 200) {
            throw lastError || new Error('All filter rule setup endpoints failed');
        }
        
        console.log(`🎉 Filter rule setup successful for @${username}`);
        return {
            success: true,
            username: username,
            rule: response.data,
            endpoint: response.config?.url || 'unknown'
        };
        
    } catch (error) {
        console.error('❌ Filter Rule Setup Error:', error.response?.data || error.message);
        return {
            success: false,
            error: error.response?.data?.message || error.message,
            username: username
        };
    }
}


// REST APIによるフィルタールール管理
app.post('/api/twitter/filter-rule', async (req, res) => {
    try {
        const { username, action = 'add' } = req.body;
        
        if (!username) {
            return res.status(400).json({ error: 'Username parameter is required' });
        }

        console.log(`${action} filter rule for: @${username}`);
        
        // TwitterAPI.ioの正確なフィルタールールエンドポイント（ドキュメント準拠）
        const possibleEndpoints = [
            'https://api.twitterapi.io/oapi/tweet_filter/add_rule',
            'https://api.twitterapi.io/oapi/tweet_filter/update_rule',
            'https://api.twitterapi.io/twitter/webhook/filter-rule',
            'https://api.twitterapi.io/webhook/filter-rule'
        ];
        
        let response = null;
        let lastError = null;
        
        for (const url of possibleEndpoints) {
            try {
                console.log(`Trying filter rule endpoint: ${url}`);
                
                // TwitterAPI.ioの正確なフォーマットでリクエスト
                const requestData = {
                    query: `from:${username}`,
                    isActive: action === 'add',
                    pollingInterval: 60, // 60秒間隔
                    tag: `monitor_${username}_${Date.now()}`
                };
                
                if (action === 'add') {
                    response = await axios.post(url, requestData, {
                        headers: {
                            'X-API-Key': process.env.TWITTER_API_KEY,
                            'Content-Type': 'application/json'
                        }
                    });
                } else if (action === 'remove') {
                    response = await axios.delete(url, {
                        data: requestData,
                        headers: {
                            'X-API-Key': process.env.TWITTER_API_KEY,
                            'Content-Type': 'application/json'
                        }
                    });
                }
                
                if (response && response.status === 200) {
                    console.log(`Success with endpoint: ${url}`);
                    break;
                }
                
            } catch (error) {
                console.log(`Failed endpoint ${url}:`, error.response?.status || error.message);
                lastError = error;
                continue;
            }
        }
        
        if (!response || response.status !== 200) {
            throw lastError || new Error('All filter rule endpoints failed');
        }
        
        console.log(`Filter rule ${action} successful for @${username}`);
        res.json({
            success: true,
            action: action,
            username: username,
            response: response.data
        });
        
    } catch (error) {
        console.error('Filter Rule API Error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data || { 
                message: error.message,
                note: 'Filter rule endpoint may not be available. Using WebSocket-based filtering.'
            }
        });
    }
});

// フィルタールール一覧取得
app.get('/api/twitter/filter-rules', async (req, res) => {
    try {
        console.log('Fetching all filter rules...');
        
        const possibleEndpoints = [
            'https://api.twitterapi.io/twitter/webhook/filter-rule',
            'https://api.twitterapi.io/webhook/filter-rule',
            'https://api.twitterapi.io/twitter/filter-rule',
            'https://api.twitterapi.io/filter-rule'
        ];
        
        let response = null;
        let lastError = null;
        
        for (const url of possibleEndpoints) {
            try {
                console.log(`Trying get rules endpoint: ${url}`);
                
                response = await axios.get(url, {
                    headers: {
                        'X-API-Key': process.env.TWITTER_API_KEY,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (response && response.status === 200) {
                    console.log(`Success with endpoint: ${url}`);
                    break;
                }
                
            } catch (error) {
                console.log(`Failed endpoint ${url}:`, error.response?.status || error.message);
                lastError = error;
                continue;
            }
        }
        
        if (!response || response.status !== 200) {
            throw lastError || new Error('All filter rule endpoints failed');
        }
        
        console.log('Filter rules fetched successfully');
        res.json({
            success: true,
            rules: response.data
        });
        
    } catch (error) {
        console.error('Get Filter Rules API Error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data || { 
                message: error.message,
                note: 'Filter rules endpoint may not be available.'
            }
        });
    }
});

// WebSocket監視ステータス取得
app.get('/api/twitter/websocket/status', (req, res) => {
    res.json({
        isMonitoring: !!twitterWs && twitterWs.readyState === WebSocket.OPEN,
        currentUsername: currentMonitoringUsername,
        connectedClients: connectedClients.size,
        twitterConnectionState: twitterWs ? twitterWs.readyState : 'not connected',
        readyStates: {
            0: 'CONNECTING',
            1: 'OPEN', 
            2: 'CLOSING',
            3: 'CLOSED'
        }
    });
});

// WebSocket診断エンドポイント
app.post('/api/twitter/websocket/diagnose', async (req, res) => {
    try {
        const { username } = req.body;
        
        if (!username) {
            return res.status(400).json({ error: 'Username parameter is required' });
        }
        
        console.log(`🔍 Running comprehensive WebSocket diagnosis for @${username}`);
        
        const diagnosis = {
            timestamp: new Date().toISOString(),
            username: username,
            tests: {}
        };
        
        // Test 1: REST API検索確認
        console.log('📋 Test 1: REST API Search Test');
        try {
            const searchResponse = await axios.get('https://api.twitterapi.io/twitter/tweet/advanced_search', {
                params: { 
                    query: `from:${username}`,
                    count: 3
                },
                headers: {
                    'X-API-Key': process.env.TWITTER_API_KEY,
                    'Content-Type': 'application/json'
                }
            });
            
            diagnosis.tests.restApiSearch = {
                success: true,
                tweetsFound: searchResponse.data.tweets?.length || 0,
                latestTweet: searchResponse.data.tweets?.[0]?.text?.substring(0, 100) || null
            };
            console.log(`✅ REST API Search: Found ${diagnosis.tests.restApiSearch.tweetsFound} tweets`);
        } catch (error) {
            diagnosis.tests.restApiSearch = {
                success: false,
                error: error.response?.data || error.message
            };
            console.log(`❌ REST API Search failed:`, error.message);
        }
        
        // Test 2: フィルタールール設定テスト
        console.log('📋 Test 2: Filter Rule Setup Test');
        const ruleTest = await setupFilterRuleForWebSocket(username);
        diagnosis.tests.filterRuleSetup = ruleTest;
        
        // Test 3: WebSocket接続テスト
        console.log('📋 Test 3: WebSocket Connection Test');
        try {
            const wsEndpoint = 'wss://ws.twitterapi.io/twitter/tweet/websocket';
            const testWs = new WebSocket(wsEndpoint, {
                headers: {
                    'X-API-Key': process.env.TWITTER_API_KEY,
                    'User-Agent': 'TwitterMonitor-Diagnosis/1.0'
                }
            });
            
            const wsTest = await new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    resolve({
                        success: false,
                        error: 'Connection timeout'
                    });
                }, 10000);
                
                testWs.on('open', () => {
                    clearTimeout(timeout);
                    console.log('✅ WebSocket connection successful');
                    testWs.close();
                    resolve({
                        success: true,
                        endpoint: wsEndpoint
                    });
                });
                
                testWs.on('error', (error) => {
                    clearTimeout(timeout);
                    console.log('❌ WebSocket connection failed:', error.message);
                    resolve({
                        success: false,
                        error: error.message
                    });
                });
            });
            
            diagnosis.tests.websocketConnection = wsTest;
        } catch (error) {
            diagnosis.tests.websocketConnection = {
                success: false,
                error: error.message
            };
        }
        
        // 診断結果の評価
        const allTestsPassed = Object.values(diagnosis.tests).every(test => test.success);
        diagnosis.overall = {
            status: allTestsPassed ? 'HEALTHY' : 'ISSUES_DETECTED',
            recommendation: allTestsPassed 
                ? 'WebSocket monitoring should work properly' 
                : 'Issues detected, check individual test results'
        };
        
        console.log(`🏁 Diagnosis complete: ${diagnosis.overall.status}`);
        res.json(diagnosis);
        
    } catch (error) {
        console.error('Diagnosis error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// TwitterAPI.ioの検索エンドポイントでテスト（代替手段）
app.post('/api/twitter/test-user-tweets', async (req, res) => {
    try {
        const { username } = req.body;
        
        if (!username) {
            return res.status(400).json({ error: 'Username parameter is required' });
        }
        
        console.log(`🧪 Testing REST API search for @${username}`);
        
        // REST APIで最新ツイートを取得してテスト
        const response = await axios.get('https://api.twitterapi.io/twitter/tweet/advanced_search', {
            params: { 
                query: `from:${username}`,
                count: 5
            },
            headers: {
                'X-API-Key': process.env.TWITTER_API_KEY,
                'Content-Type': 'application/json'
            }
        });
        
        const tweets = response.data.tweets || [];
        console.log(`Found ${tweets.length} recent tweets for @${username}`);
        
        if (tweets.length > 0) {
            console.log('Latest tweet:', tweets[0].text?.substring(0, 100) + '...');
        }
        
        res.json({
            success: true,
            username: username,
            recentTweets: tweets.length,
            latestTweet: tweets[0] || null,
            message: `@${username} からの最新ツイート ${tweets.length} 件を取得しました`
        });
        
    } catch (error) {
        console.error('User tweets test error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data || { message: error.message }
        });
    }
});

// 高頻度ポーリング代替実装（WebSocketが機能しない場合）
let pollingInterval = null;
let lastTweetId = null;

app.post('/api/twitter/start-polling', async (req, res) => {
    try {
        const { username, intervalSeconds = 30 } = req.body;
        
        if (!username) {
            return res.status(400).json({ error: 'Username parameter is required' });
        }
        
        // 既存のポーリングを停止
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }
        
        console.log(`🔄 Starting high-frequency polling for @${username} every ${intervalSeconds} seconds`);
        currentMonitoringUsername = username;
        lastTweetId = null;
        
        // 初回実行
        await pollUserTweets(username);
        
        // 定期実行開始
        pollingInterval = setInterval(async () => {
            await pollUserTweets(username);
        }, intervalSeconds * 1000);
        
        res.json({
            success: true,
            message: `Polling started for @${username}`,
            intervalSeconds: intervalSeconds,
            status: 'active'
        });
        
    } catch (error) {
        console.error('Polling start error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/twitter/stop-polling', (req, res) => {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
        currentMonitoringUsername = null;
        lastTweetId = null;
        
        console.log('🛑 Polling stopped');
        
        broadcastToClients({
            type: 'status',
            message: 'ポーリング監視が停止されました'
        });
        
        res.json({
            success: true,
            message: 'Polling stopped'
        });
    } else {
        res.json({
            success: true,
            message: 'No active polling to stop'
        });
    }
});

async function pollUserTweets(username) {
    try {
        console.log(`🔍 Polling tweets for @${username}...`);
        
        const response = await axios.get('https://api.twitterapi.io/twitter/tweet/advanced_search', {
            params: { 
                query: `from:${username}`,
                count: 5,
                queryType: 'Latest'
            },
            headers: {
                'X-API-Key': process.env.TWITTER_API_KEY,
                'Content-Type': 'application/json'
            }
        });
        
        const tweets = response.data.tweets || [];
        
        if (tweets.length > 0) {
            const latestTweet = tweets[0];
            const tweetId = latestTweet.id || latestTweet.id_str;
            
            // 新しいツイートかチェック
            if (!lastTweetId || tweetId !== lastTweetId) {
                console.log(`🐦 New tweet detected from @${username}: ${latestTweet.text?.substring(0, 100)}...`);
                
                // WebSocketクライアントに通知
                broadcastToClients({
                    type: 'tweet',
                    source: 'polling',
                    tweet: latestTweet,
                    username: username
                });
                
                lastTweetId = tweetId;
            } else {
                console.log(`📭 No new tweets from @${username}`);
            }
        } else {
            console.log(`❌ No tweets found for @${username}`);
        }
        
    } catch (error) {
        console.error(`Error polling tweets for @${username}:`, error.message);
        broadcastToClients({
            type: 'error',
            message: `ポーリングエラー: ${error.message}`,
            username: username
        });
    }
}

// ハイブリッド監視システム用の変数
let pollingIntervals = new Map(); // username -> intervalId のマッピング
let lastTweetIds = new Map(); // username -> lastTweetId のマッピング
let webhookRules = new Map(); // username -> ruleId のマッピング

// TwitterAPI.io 正式なWebhookフィルタールール追加
app.post('/api/twitter/webhook-rule', async (req, res) => {
    try {
        const { username, intervalSeconds = 100 } = req.body;
        
        if (!username) {
            return res.status(400).json({ error: 'Username parameter is required' });
        }
        
        console.log(`🔧 Adding Webhook Filter Rule for @${username}`);
        
        const endpoint = 'https://api.twitterapi.io/oapi/tweet_filter/add_rule';
        
        const requestBody = {
            tag: `monitor_${username}_${Date.now()}`,
            value: `from:${username}`,
            interval_seconds: intervalSeconds // ユーザー選択の間隔を使用
        };
        
        console.log(`📝 Sending request to ${endpoint}:`, JSON.stringify(requestBody, null, 2));
        
        const response = await axios.post(endpoint, requestBody, {
            headers: {
                'X-API-Key': process.env.TWITTER_API_KEY,
                'Content-Type': 'application/json'
            }
        });
        
        console.log(`✅ Webhook rule added successfully:`, response.data);
        
        // ルールIDを保存
        if (response.data.rule_id) {
            webhookRules.set(username, {
                ruleId: response.data.rule_id,
                tag: requestBody.tag,
                filter: requestBody.value,
                intervalSeconds: requestBody.interval_seconds
            });
        }
        
        // ルールを有効化する必要がある場合のメッセージ
        let activationNote = '';
        if (response.data.msg && response.data.msg.includes('not activated')) {
            activationNote = ' (注意: ルールは作成されましたが、手動での有効化が必要な場合があります)';
            console.log('⚠️ Rule created but not activated. Manual activation may be required.');
        }
        
        res.json({
            success: true,
            username: username,
            ruleId: response.data.rule_id,
            status: response.data.status,
            message: response.data.msg + activationNote,
            tag: requestBody.tag,
            filter: requestBody.value,
            intervalSeconds: requestBody.interval_seconds
        });
        
    } catch (error) {
        console.error('❌ Webhook Filter Rule Error:', error.response?.data || error.message);
        
        // 詳細なエラー情報をログ出力
        if (error.response) {
            console.log('Response status:', error.response.status);
            console.log('Response headers:', error.response.headers);
            console.log('Response data:', error.response.data);
        }
        
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data || { 
                message: error.message,
                details: error.response?.data,
                note: 'Webhook filter rule endpoint failed. Check API key and parameters.'
            }
        });
    }
});

// TwitterAPI.io Webhookルール有効化
app.post('/api/twitter/activate-webhook-rule', async (req, res) => {
    try {
        const { username, ruleId, tag, filter, intervalSeconds = 120 } = req.body;
        
        if (!username || !ruleId) {
            return res.status(400).json({ error: 'Username and ruleId parameters are required' });
        }
        
        console.log(`🔥 Activating Webhook Rule for @${username}, Rule ID: ${ruleId}`);
        
        const endpoint = 'https://api.twitterapi.io/oapi/tweet_filter/update_rule';
        
        const requestBody = {
            rule_id: ruleId,
            tag: tag || `monitor_${username}_${Date.now()}`,
            value: filter || `from:${username}`,
            interval_seconds: intervalSeconds, // ユーザー選択の間隔を使用
            is_effect: 1 // 1 = アクティブ, 0 = 非アクティブ
        };
        
        console.log(`📝 Sending activation request to ${endpoint}:`, JSON.stringify(requestBody, null, 2));
        
        const response = await axios.post(endpoint, requestBody, {
            headers: {
                'X-API-Key': process.env.TWITTER_API_KEY,
                'Content-Type': 'application/json'
            }
        });
        
        console.log(`✅ Webhook rule activated successfully:`, response.data);
        
        // アクティブ化されたルール情報を更新
        if (webhookRules.has(username)) {
            const ruleInfo = webhookRules.get(username);
            ruleInfo.isActive = true;
            ruleInfo.activatedAt = new Date().toISOString();
            webhookRules.set(username, ruleInfo);
        }
        
        res.json({
            success: true,
            username: username,
            ruleId: response.data.rule_id || ruleId,
            status: response.data.status,
            message: response.data.msg || 'ルールが正常に有効化されました',
            isActive: true,
            activatedAt: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Webhook Rule Activation Error:', error.response?.data || error.message);
        
        if (error.response) {
            console.log('Response status:', error.response.status);
            console.log('Response data:', error.response.data);
        }
        
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data || { 
                message: error.message,
                details: error.response?.data,
                note: 'Webhook rule activation failed. Check rule_id and parameters.'
            }
        });
    }
});

// 現在のWebhookルール一覧を取得
app.get('/api/twitter/webhook-rules', async (req, res) => {
    try {
        console.log('📋 Fetching current webhook rules...');
        
        const endpoint = 'https://api.twitterapi.io/oapi/tweet_filter/get_rules';
        
        const response = await axios.get(endpoint, {
            headers: {
                'X-API-Key': process.env.TWITTER_API_KEY,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('✅ Webhook rules fetched successfully');
        console.log('Rules data:', JSON.stringify(response.data, null, 2));
        
        res.json({
            success: true,
            rules: response.data.rules || response.data,
            totalCount: response.data.rules ? response.data.rules.length : (Array.isArray(response.data) ? response.data.length : 0),
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Failed to fetch webhook rules:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data || { 
                message: error.message,
                details: 'Failed to fetch webhook rules from TwitterAPI.io'
            }
        });
    }
});

// Webhookルールを削除
app.delete('/api/twitter/webhook-rules/:ruleId', async (req, res) => {
    try {
        const { ruleId } = req.params;
        console.log(`🗑️ Deleting webhook rule: ${ruleId}`);
        
        const endpoint = 'https://api.twitterapi.io/oapi/tweet_filter/delete_rule';
        
        const response = await axios.delete(endpoint, {
            headers: {
                'X-API-Key': process.env.TWITTER_API_KEY,
                'Content-Type': 'application/json'
            },
            data: {
                rule_id: ruleId
            }
        });
        
        console.log('✅ Webhook rule deleted successfully');
        console.log('Delete response:', JSON.stringify(response.data, null, 2));
        
        res.json({
            success: true,
            ruleId: ruleId,
            response: response.data,
            message: 'Webhook rule deleted successfully',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Failed to delete webhook rule:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data || { 
                message: error.message,
                details: 'Failed to delete webhook rule from TwitterAPI.io'
            }
        });
    }
});

// ポーリングベースのリアルタイム監視開始
app.post('/api/twitter/start-polling', async (req, res) => {
    try {
        const { username, intervalSeconds = 30 } = req.body;
        
        if (!username) {
            return res.status(400).json({ error: 'Username parameter is required' });
        }
        
        // 既存のポーリングを停止
        if (pollingIntervals.has(username)) {
            clearInterval(pollingIntervals.get(username));
            console.log(`⏹️ Stopped existing polling for @${username}`);
        }
        
        console.log(`🔄 Starting high-frequency polling for @${username} every ${intervalSeconds} seconds`);
        
        // 初回ツイート取得で基準点を設定
        try {
            const initialResponse = await axios.get('https://api.twitterapi.io/twitter/tweet/advanced_search', {
                params: { 
                    query: `from:${username}`,
                    count: 1
                },
                headers: {
                    'X-API-Key': process.env.TWITTER_API_KEY,
                    'Content-Type': 'application/json'
                }
            });
            
            const initialTweets = initialResponse.data.tweets || [];
            if (initialTweets.length > 0) {
                lastTweetIds.set(username, initialTweets[0].id);
                console.log(`📌 Baseline set for @${username}: ${initialTweets[0].id}`);
                console.log(`📝 Latest tweet: ${initialTweets[0].text?.substring(0, 100)}...`);
            }
        } catch (baselineError) {
            console.warn(`⚠️ Could not set baseline for @${username}:`, baselineError.message);
        }
        
        // ポーリング開始
        const intervalId = setInterval(async () => {
            try {
                await checkForNewTweetsPolling(username);
            } catch (error) {
                console.error(`❌ Polling error for @${username}:`, error.message);
            }
        }, intervalSeconds * 1000);
        
        pollingIntervals.set(username, intervalId);
        
        // WebSocketクライアントに通知
        broadcastToClients({
            type: 'status',
            message: `@${username} のハイブリッド監視を開始しました (ポーリング間隔: ${intervalSeconds}秒)`
        });
        
        res.json({
            success: true,
            username: username,
            intervalSeconds: intervalSeconds,
            method: 'polling',
            message: `ハイブリッド監視が開始されました`
        });
        
    } catch (error) {
        console.error('Polling start error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data || { message: error.message }
        });
    }
});

// ポーリングベースの監視停止
app.post('/api/twitter/stop-polling', async (req, res) => {
    try {
        const { username } = req.body;
        
        if (!username) {
            return res.status(400).json({ error: 'Username parameter is required' });
        }
        
        if (pollingIntervals.has(username)) {
            clearInterval(pollingIntervals.get(username));
            pollingIntervals.delete(username);
            lastTweetIds.delete(username);
            
            console.log(`⏹️ Stopped polling for @${username}`);
            
            broadcastToClients({
                type: 'status',
                message: `@${username} のポーリング監視を停止しました`
            });
            
            res.json({
                success: true,
                message: `@${username} のポーリング監視を停止しました`
            });
        } else {
            res.json({
                success: false,
                message: `@${username} のポーリング監視は実行されていません`
            });
        }
        
    } catch (error) {
        console.error('Polling stop error:', error.message);
        res.status(500).json({
            success: false,
            error: { message: error.message }
        });
    }
});

// 新しいツイートをチェックする関数（ポーリング用）
async function checkForNewTweetsPolling(username) {
    try {
        console.log(`🔍 Checking for new tweets from @${username}...`);
        
        const response = await axios.get('https://api.twitterapi.io/twitter/tweet/advanced_search', {
            params: { 
                query: `from:${username}`,
                count: 5 // 最新5件を取得
            },
            headers: {
                'X-API-Key': process.env.TWITTER_API_KEY,
                'Content-Type': 'application/json'
            }
        });
        
        const tweets = response.data.tweets || [];
        const lastKnownId = lastTweetIds.get(username);
        
        console.log(`📊 Retrieved ${tweets.length} tweets for @${username}, last known ID: ${lastKnownId}`);
        
        // 新しいツイートをフィルタリング
        let newTweets = [];
        if (lastKnownId) {
            for (const tweet of tweets) {
                if (tweet.id === lastKnownId) {
                    console.log(`🛑 Reached known tweet: ${tweet.id}`);
                    break; // 既知の最新ツイートに到達したら停止
                }
                newTweets.push(tweet);
            }
        } else if (tweets.length > 0) {
            // 初回の場合は何もしない（ベースライン設定のみ）
            console.log(`📌 Setting initial baseline: ${tweets[0].id}`);
            lastTweetIds.set(username, tweets[0].id);
            return;
        }
        
        // 新しいツイートがあれば処理
        if (newTweets.length > 0) {
            console.log(`🎉 Found ${newTweets.length} new tweets for @${username}!`);
            
            // 最新のツイートIDを更新
            lastTweetIds.set(username, newTweets[0].id);
            
            // 新しいツイートを時系列順（古い順）で送信
            newTweets.reverse().forEach((tweet, index) => {
                console.log(`📢 New tweet ${index + 1}/${newTweets.length}: @${tweet.author?.userName}: ${tweet.text?.substring(0, 100)}...`);
                
                broadcastToClients({
                    type: 'tweet',
                    tweet: tweet,
                    source: 'polling',
                    timestamp: new Date().toISOString()
                });
            });
        } else {
            console.log(`✅ No new tweets for @${username}`);
        }
        
    } catch (error) {
        console.error(`❌ Error checking tweets for @${username}:`, error.response?.data || error.message);
        broadcastToClients({
            type: 'error',
            message: `ポーリングエラー: ${error.message}`,
            username: username
        });
    }
}

// 全てのポーリングを停止する関数
function stopAllPolling() {
    console.log(`🛑 Stopping all polling (${pollingIntervals.size} active)`);
    pollingIntervals.forEach((intervalId, username) => {
        clearInterval(intervalId);
        console.log(`⏹️ Stopped polling for @${username}`);
    });
    pollingIntervals.clear();
    lastTweetIds.clear();
}

// サーバー終了時にポーリングをクリーンアップ
process.on('SIGINT', () => {
    console.log('🛑 Shutting down server...');
    stopAllPolling();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('🛑 Shutting down server...');
    stopAllPolling();
    process.exit(0);
});

// ===== Twitter List Scheduler API =====

// メモリ内ストレージ（本番環境ではFirestoreを使用）
let registeredLists = new Map();
let listTweets = new Map(); // listId -> tweets array
let listStats = {
    totalLists: 0,
    activeLists: 0,
    totalTweets: 0,
    totalSummaries: 0
};

// リスト登録（Firestore対応版）
app.post('/api/lists/register', async (req, res) => {
    try {
        const { listId, url, frequency, cronExpression, name, active } = req.body;
        
        if (!listId || !url || !frequency || !name) {
            return res.status(400).json({ error: 'Required fields missing' });
        }
        
        // TwitterAPI.ioでリストの存在確認
        try {
            const testResponse = await axios.get(`https://api.twitterapi.io/twitter/list/tweets`, {
                params: { listId: listId, count: 1 },
                headers: { 'X-API-Key': process.env.TWITTER_API_KEY }
            });
            
            if (!testResponse.data || testResponse.data.error) {
                return res.status(400).json({ error: 'TwitterリストIDが見つからないか、アクセスできません' });
            }
        } catch (error) {
            console.error('Twitter list validation error:', error);
            return res.status(400).json({ error: 'TwitterリストIDの確認に失敗しました' });
        }
        
        const now = new Date().toISOString();
        const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const twitterListId = `list-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // 1. twitter_lists テーブルにリスト情報を保存
        const twitterListData = {
            listId: twitterListId,
            twitterListId: listId, // Twitter APIのリストID
            name,
            url,
            lastExecuted: null,
            lastTweetId: null,
            tweetCount: 0,
            createdAt: now,
            updatedAt: now
        };
        
        await setDoc(doc(db, 'twitter_lists', twitterListId), twitterListData);
        
        // 2. cron_tasks テーブルにタスク情報を保存
        const cronTaskData = {
            taskId,
            taskType: 'twitter_list',
            name: `${name} - 定期取得`,
            description: `${name}のツイートを${frequency}分ごとに取得`,
            frequency, // 分単位
            active: active !== false,
            createdAt: now,
            lastExecuted: null,
            nextExecution: null,
            executionCount: 0,
            successCount: 0,
            errorCount: 0,
            lastError: null,
            config: {
                relatedTableId: twitterListId
            }
        };
        
        await setDoc(doc(db, 'cron_tasks', taskId), cronTaskData);
        
        // 後方互換性のため、メモリにも一時的に保存（将来削除予定）
        const legacyListData = {
            listId,
            url,
            frequency,
            cronExpression,
            name,
            active: active !== false,
            createdAt: now,
            lastUpdated: null,
            tweetCount: 0,
            lastTweetId: null
        };
        registeredLists.set(listId, legacyListData);
        listTweets.set(listId, []);
        
        console.log(`✅ New list registered: ${name} (TwitterID: ${listId}, TaskID: ${taskId})`);
        
        res.json({ 
            success: true, 
            taskId,
            twitterListId,
            listData: cronTaskData,
            message: 'リストが正常に登録されました'
        });
        
    } catch (error) {
        console.error('List registration error:', error);
        res.status(500).json({ error: 'リスト登録に失敗しました: ' + error.message });
    }
});

// 登録済みリスト一覧（Firestore対応版）
app.get('/api/lists', async (req, res) => {
    try {
        // Firestoreからcron_tasksを取得
        const tasksSnapshot = await getDocs(
            query(collection(db, 'cron_tasks'), 
                  where('taskType', '==', 'twitter_list'))
        );
        
        const lists = [];
        for (const taskDoc of tasksSnapshot.docs) {
            const taskData = taskDoc.data();
            
            // 関連するtwitter_listsデータを取得
            const twitterListDoc = await getDoc(doc(db, 'twitter_lists', taskData.config.relatedTableId));
            if (twitterListDoc.exists()) {
                const twitterListData = twitterListDoc.data();
                
                // レスポンス用にデータを結合
                lists.push({
                    taskId: taskData.taskId,
                    listId: twitterListData.twitterListId, // TwitterのリストID
                    name: taskData.name,
                    frequency: taskData.frequency,
                    active: taskData.active,
                    createdAt: taskData.createdAt,
                    lastUpdated: twitterListData.lastExecuted,
                    tweetCount: twitterListData.tweetCount || 0,
                    executionCount: taskData.executionCount || 0,
                    successCount: taskData.successCount || 0,
                    errorCount: taskData.errorCount || 0,
                    lastError: taskData.lastError
                });
            }
        }
        
        // 後方互換性のため、メモリからのデータも追加
        const memoryLists = Array.from(registeredLists.values());
        memoryLists.forEach(memoryList => {
            // Firestoreデータと重複していないかチェック
            const exists = lists.some(list => list.listId === memoryList.listId);
            if (!exists) {
                lists.push(memoryList);
            }
        });
        
        res.json(lists);
        
    } catch (error) {
        console.error('Error fetching lists:', error);
        // フォールバック：メモリからのデータを返す
        const lists = Array.from(registeredLists.values());
        res.json(lists);
    }
});

// リスト削除（Firestore対応）
app.delete('/api/lists/:listId', async (req, res) => {
    try {
        const { listId } = req.params;
        
        console.log(`Delete request for listId: ${listId}`);
        
        // TwitterリストIDでFirestoreドキュメントを検索
        const listQuery = query(
            collection(db, 'twitter_lists'),
            where('twitterListId', '==', listId)
        );
        const listSnapshot = await getDocs(listQuery);
        
        if (listSnapshot.empty) {
            console.log(`List not found with twitterListId: ${listId}`);
            return res.status(404).json({ error: 'リストが見つかりません' });
        }
        
        const listDoc = listSnapshot.docs[0];
        const firestoreListId = listDoc.id; // 実際のFirestoreドキュメントID
        
        // 1. cron_taskを削除
        const taskQuery = query(
            collection(db, 'cron_tasks'),
            where('config.relatedTableId', '==', firestoreListId)
        );
        const taskSnapshot = await getDocs(taskQuery);
        const batch = writeBatch(db);
        
        taskSnapshot.forEach(doc => {
            batch.delete(doc.ref);
        });
        
        // 2. twitter_listを削除
        batch.delete(listDoc.ref);
        
        // 3. 関連するcollected_tweetsを削除
        const tweetsQuery = query(
            collection(db, 'collected_tweets'),
            where('sourceId', '==', firestoreListId)
        );
        const tweetsSnapshot = await getDocs(tweetsQuery);
        
        tweetsSnapshot.forEach(tweetDoc => {
            batch.delete(tweetDoc.ref);
        });
        
        // 4. 関連するcron_executionsを削除
        const execQuery = query(
            collection(db, 'cron_executions'),
            where('metadata.sourceId', '==', firestoreListId)
        );
        const execSnapshot = await getDocs(execQuery);
        
        execSnapshot.forEach(execDoc => {
            batch.delete(execDoc.ref);
        });
        
        // バッチ実行
        await batch.commit();
        
        console.log(`List and all related data deleted: ${listId}`);
        res.json({ success: true });
        
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
});

// リスト有効/無効切り替え（Firestore対応）
app.patch('/api/lists/:listId/toggle', async (req, res) => {
    try {
        const { listId } = req.params;
        const { active } = req.body;
        
        console.log(`Toggle request for listId: ${listId}, active: ${active}`);
        
        // TwitterリストIDでFirestoreドキュメントを検索
        const listQuery = query(
            collection(db, 'twitter_lists'),
            where('twitterListId', '==', listId)
        );
        const listSnapshot = await getDocs(listQuery);
        
        if (listSnapshot.empty) {
            console.log(`List not found with twitterListId: ${listId}`);
            return res.status(404).json({ error: 'リストが見つかりません' });
        }
        
        const listDoc = listSnapshot.docs[0];
        const firestoreListId = listDoc.id; // 実際のFirestoreドキュメントID
        
        // 対応するcron_taskを取得
        const taskQuery = query(
            collection(db, 'cron_tasks'),
            where('config.relatedTableId', '==', firestoreListId)
        );
        const taskSnapshot = await getDocs(taskQuery);
        
        if (taskSnapshot.empty) {
            console.log(`Cron task not found for listId: ${listId}`);
            return res.status(404).json({ error: 'タスクが見つかりません' });
        }
        
        // cron_taskのactiveフィールドを更新
        const taskDoc = taskSnapshot.docs[0];
        await updateDoc(taskDoc.ref, {
            active: active,
            updatedAt: new Date().toISOString()
        });
        
        console.log(`List ${listId} ${active ? 'activated' : 'deactivated'}`);
        res.json({ success: true });
        
    } catch (error) {
        console.error('Toggle error:', error);
        res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
});

// 統計情報
app.get('/api/lists/stats', (req, res) => {
    updateStats();
    res.json(listStats);
});

// 統計更新関数
function updateStats() {
    const lists = Array.from(registeredLists.values());
    listStats.totalLists = lists.length;
    listStats.activeLists = lists.filter(list => list.active).length;
    listStats.totalTweets = Array.from(listTweets.values()).reduce((sum, tweets) => sum + tweets.length, 0);
    // totalSummaries は後で実装
}

// ツイート保存・取得エンドポイント
app.get('/api/lists/:listId/tweets', (req, res) => {
    const { listId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    
    if (!listTweets.has(listId)) {
        return res.status(404).json({ error: 'リストが見つかりません' });
    }
    
    const tweets = listTweets.get(listId);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedTweets = tweets.slice(startIndex, endIndex);
    
    res.json({
        tweets: paginatedTweets,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: tweets.length,
            totalPages: Math.ceil(tweets.length / limit)
        }
    });
});

// Firestoreへの保存関数
async function saveListTweetsToFirestore(listId, tweets) {
    try {
        const batch = writeBatch(db);
        
        tweets.forEach(tweet => {
            const docRef = doc(collection(db, 'list-tweets'));
            batch.set(docRef, {
                listId,
                tweetId: tweet.id,
                text: tweet.text,
                author: tweet.author,
                createdAt: tweet.created_at,
                savedAt: new Date(),
                data: tweet
            });
        });
        
        await batch.commit();
        console.log(`Saved ${tweets.length} tweets to Firestore for list ${listId}`);
    } catch (error) {
        console.error('Error saving tweets to Firestore:', error);
    }
}

// Firestoreからの読み込み関数
async function loadListTweetsFromFirestore(listId) {
    try {
        const q = query(
            collection(db, 'list-tweets'),
            where('listId', '==', listId),
            orderBy('createdAt', 'desc')
        );
        
        const querySnapshot = await getDocs(q);
        const tweets = querySnapshot.docs.map(doc => doc.data().data);
        
        return tweets;
    } catch (error) {
        console.error('Error loading tweets from Firestore:', error);
        return [];
    }
}

// 汎用Cron実行エンドポイント（GET/POST両対応）
const cronExecutor = async (req, res) => {
    const executionId = `exec-${Date.now()}`;
    const startTime = new Date();
    
    try {
        // Preview環境でのCron実行を防ぐ
        if (process.env.VERCEL_ENV !== 'production') {
            console.log(`🚫 [${executionId}] Cron execution blocked in ${process.env.VERCEL_ENV} environment`);
            return res.status(200).json({ 
                message: 'Cron jobs are disabled in non-production environments',
                environment: process.env.VERCEL_ENV 
            });
        }
        
        // セキュリティチェック
        const authHeader = req.headers.authorization;
        if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        console.log(`🔄 [${executionId}] Starting universal cron executor`);
        
        // 実行対象タスクを取得（Firestore接続エラー対策付き）
        let allTasks = [];
        try {
            console.log('🔍 Connecting to Firestore to fetch active tasks...');
            const tasksSnapshot = await getDocs(
                query(collection(db, 'cron_tasks'), 
                      where('active', '==', true))
            );
            
            tasksSnapshot.forEach(doc => {
                allTasks.push({id: doc.id, ...doc.data()});
            });
            
            console.log(`✅ Firestore connection successful. Found ${allTasks.length} active tasks`);
            
            if (allTasks.length === 0) {
                console.log('ℹ️  No active tasks found in cron_tasks collection');
                console.log('   - Check if tasks exist with active: true');
                console.log('   - Verify cron_tasks collection exists');
            }
            
        } catch (firestoreError) {
            console.error('❌ Firestore connection failed:', firestoreError.message);
            console.error('   Error code:', firestoreError.code);
            console.error('   Error details:', firestoreError);
            
            // Firestoreエラーの場合は早期リターン
            return res.status(500).json({ 
                error: 'Firestore connection failed',
                details: firestoreError.message,
                executionId: executionId
            });
        }
        
        // 頻度チェックで実行対象を決定
        const now = new Date();
        const tasksToExecute = allTasks.filter(task => {
            console.log(`🔍 Task check: ${task.name}`);
            console.log(`  - lastExecuted: ${task.lastExecuted}`);
            console.log(`  - frequency: ${task.frequency} minutes`);
            console.log(`  - current time: ${now.toISOString()}`);
            
            if (!task.lastExecuted) {
                console.log(`  ✅ First execution (no lastExecuted)`);
                return true;
            }
            
            const lastExecuted = new Date(task.lastExecuted);
            const minutesSince = (now - lastExecuted) / (1000 * 60);
            const shouldExecute = minutesSince >= (task.frequency - 2); // 2分のマージン
            
            console.log(`  - last executed: ${lastExecuted.toISOString()}`);
            console.log(`  - minutes since: ${minutesSince.toFixed(2)}`);
            console.log(`  - should execute: ${shouldExecute ? 'YES' : 'NO'}`);
            
            return shouldExecute;
        });
        
        console.log(`${tasksToExecute.length} tasks ready for execution`);
        
        const results = {
            success: true,
            executionId,
            startTime: startTime.toISOString(),
            totalTasks: allTasks.length,
            executedTasks: tasksToExecute.length,
            results: []
        };
        
        // 各タスクを実行
        for (const task of tasksToExecute) {
            const taskStartTime = new Date();
            try {
                console.log(`Executing task: ${task.name} (${task.taskType})`);
                
                let taskResult;
                switch (task.taskType) {
                    case 'twitter_list':
                        taskResult = await executeTwitterListTask(task, now);
                        break;
                    default:
                        throw new Error(`Unknown task type: ${task.taskType}`);
                }
                
                // タスク実行成功
                await updateDoc(doc(db, 'cron_tasks', task.id), {
                    lastExecuted: now.toISOString(),
                    nextExecution: new Date(now.getTime() + task.frequency * 60000).toISOString(),
                    executionCount: (task.executionCount || 0) + 1,
                    successCount: (task.successCount || 0) + 1,
                    lastError: null
                });
                
                // 実行ログ記録
                await addDoc(collection(db, 'cron_executions'), {
                    executionId,
                    taskId: task.taskId,
                    taskType: task.taskType,
                    startTime: taskStartTime.toISOString(),
                    endTime: new Date().toISOString(),
                    status: 'success',
                    newItems: taskResult.newTweets || 0,
                    processingTime: (new Date() - taskStartTime) / 1000,
                    metadata: {
                        sourceId: task.config?.relatedTableId,
                        totalFetched: taskResult.totalFetched || 0,
                        duplicatesSkipped: taskResult.duplicatesSkipped || 0
                    }
                });
                
                results.results.push({
                    taskId: task.taskId,
                    name: task.name,
                    status: 'success',
                    newItems: taskResult.newTweets || 0,
                    processingTime: (new Date() - taskStartTime) / 1000
                });
                
                console.log(`✅ Task completed: ${task.name} - ${taskResult.newTweets || 0} new items`);
                
            } catch (taskError) {
                console.error(`❌ Task failed: ${task.name} - ${taskError.message}`);
                
                // タスクエラー記録
                await updateDoc(doc(db, 'cron_tasks', task.id), {
                    errorCount: (task.errorCount || 0) + 1,
                    lastError: taskError.message
                });
                
                // エラーログ記録
                await addDoc(collection(db, 'cron_executions'), {
                    executionId,
                    taskId: task.taskId,
                    taskType: task.taskType,
                    startTime: taskStartTime.toISOString(),
                    endTime: new Date().toISOString(),
                    status: 'error',
                    newItems: 0,
                    processingTime: (new Date() - taskStartTime) / 1000,
                    errors: [taskError.message]
                });
                
                results.results.push({
                    taskId: task.taskId,
                    name: task.name,
                    status: 'error',
                    error: taskError.message,
                    processingTime: (new Date() - taskStartTime) / 1000
                });
            }
        }
        
        const endTime = new Date();
        results.endTime = endTime.toISOString();
        results.totalProcessingTime = (endTime - startTime) / 1000;
        
        console.log(`✅ [${executionId}] Execution completed: ${results.executedTasks} tasks executed in ${results.totalProcessingTime}s`);
        
        // Discord通知を送信（非同期、エラーがあっても処理を続行）
        console.log(`📤 [${executionId}] Attempting to send Discord notification...`);
        console.log(`📤 Discord webhook URL configured: ${process.env.DISCORD_WEBHOOK_URL ? 'YES' : 'NO'}`);
        
        sendDiscordNotification(results).then(success => {
            if (success) {
                console.log(`✅ [${executionId}] Discord notification sent successfully`);
            } else {
                console.error(`❌ [${executionId}] Discord notification failed but no exception thrown`);
            }
        }).catch(error => {
            console.error(`❌ [${executionId}] Discord notification failed:`, error.message);
            console.error(`   Error type: ${error.constructor.name}`);
            console.error(`   Error details:`, error.response?.data || error);
            console.error('   This does not affect cron job execution');
            
            // フォールバック: 簡易通知を試行
            console.log(`🔄 [${executionId}] Attempting fallback notification...`);
            sendFallbackNotification(results).catch(fallbackError => {
                console.error(`❌ [${executionId}] Fallback notification also failed:`, fallbackError.message);
            });
        });
        
        res.json(results);
        
    } catch (error) {
        console.error(`❌ [${executionId}] Execution failed:`, error);
        
        const errorResults = {
            success: false,
            executionId,
            startTime: startTime.toISOString(),
            endTime: new Date().toISOString(),
            totalProcessingTime: (new Date() - startTime) / 1000,
            executedTasks: 0,
            results: [{
                taskId: 'system',
                name: 'Cron System',
                status: 'error',
                error: error.message,
                processingTime: (new Date() - startTime) / 1000
            }]
        };
        
        // エラー時もDiscord通知を送信
        console.log(`📤 [${executionId}] Attempting to send Discord error notification...`);
        sendDiscordNotification(errorResults).then(success => {
            console.log(`✅ [${executionId}] Discord error notification completed successfully`);
        }).catch(notifyError => {
            console.error(`❌ [${executionId}] Discord error notification failed:`, notifyError.message);
            console.error('   Original cron error:', error.message);
        });
        
        res.status(500).json(errorResults);
    }
};

// 汎用Discord通知クラス
class DiscordNotifier {
    constructor(webhookUrl = process.env.DISCORD_WEBHOOK_URL) {
        this.webhookUrl = webhookUrl;
        this.defaultUsername = 'Twitter Bot';
        this.defaultAvatarUrl = 'https://cdn.discordapp.com/attachments/1234567890/twitter-icon.png';
    }
    
    // 基本的なメッセージ送信
    async sendMessage(content, options = {}) {
        if (!this.webhookUrl) {
            console.error('❌ Discord webhook URL not configured, skipping notification');
            console.error('   Please set DISCORD_WEBHOOK_URL environment variable');
            return false;
        }
        
        try {
            const payload = {
                content: content,
                username: options.username || this.defaultUsername,
                avatar_url: options.avatarUrl || this.defaultAvatarUrl,
                tts: options.tts || false
            };
            
            console.log('📤 Sending Discord message...');
            const response = await axios.post(this.webhookUrl, payload);
            
            if (response.status === 204) {
                console.log('✅ Discord message sent successfully');
                return true;
            } else {
                console.error(`❌ Discord webhook returned unexpected status: ${response.status}`);
                console.error('   Response:', response.data);
                return false;
            }
        } catch (error) {
            console.error('❌ Discord message send failed:', error.message);
            if (error.response) {
                console.error('   Status:', error.response.status);
                console.error('   Response:', error.response.data);
                console.error('   Headers:', error.response.headers);
            } else if (error.request) {
                console.error('   No response received from Discord');
                console.error('   Request details:', error.request);
            } else {
                console.error('   Error details:', error);
            }
            return false;
        }
    }
    
    // Embedメッセージ送信（リトライ機能付き）
    async sendEmbed(embed, options = {}) {
        if (!this.webhookUrl) {
            console.error('❌ Discord webhook URL not configured, skipping notification');
            console.error('   Please set DISCORD_WEBHOOK_URL environment variable');
            return false;
        }
        
        const maxRetries = 8; // 20→8に削減
        const baseDelay = 2000; // 1秒→2秒に延長
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const payload = {
                    username: options.username || this.defaultUsername,
                    avatar_url: options.avatarUrl || this.defaultAvatarUrl,
                    embeds: Array.isArray(embed) ? embed : [embed]
                };
                
                console.log(`📤 Sending Discord embed message... (attempt ${attempt}/${maxRetries})`);
                console.log('   Webhook URL:', this.webhookUrl.substring(0, 50) + '...');
                console.log('   Embed count:', Array.isArray(embed) ? embed.length : 1);
                console.log('🔍 Payload size:', JSON.stringify(payload).length, 'characters');
                
                // 段階的にタイムアウトを調整: 初回は短く、リトライ時に延長
                let timeoutMs;
                if (attempt <= 3) {
                    timeoutMs = 15000; // 15秒
                } else if (attempt <= 10) {
                    timeoutMs = 30000; // 30秒
                } else {
                    timeoutMs = 45000; // 45秒
                }
                console.log(`⏱️  Timeout: ${timeoutMs/1000}s (attempt ${attempt})`);
                
                const response = await axios.post(this.webhookUrl, payload, {
                    timeout: timeoutMs,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                
                console.log('🔍 Discord API response status:', response.status);
                
                if (response.status === 204) {
                    console.log(`✅ Discord embed sent successfully on attempt ${attempt}`);
                    return true;
                } else {
                    console.error(`❌ Discord webhook returned unexpected status: ${response.status}`);
                    console.error('   Response:', response.data);
                    return false;
                }
            } catch (error) {
                console.error(`❌ Discord embed send failed (attempt ${attempt}/${maxRetries}):`, error.message);
                
                let shouldRetry = false;
                let retryDelay;
                
                // リトライ戦略: 段階的に待機時間を調整
                if (attempt <= 2) {
                    retryDelay = baseDelay; // 2秒固定
                } else if (attempt <= 5) {
                    retryDelay = baseDelay * 2; // 4秒固定
                } else {
                    retryDelay = baseDelay * 3; // 6秒固定
                }
                
                if (error.response) {
                    console.error('   Status:', error.response.status);
                    console.error('   Status Text:', error.response.statusText);
                    console.error('   Response:', error.response.data);
                    
                    if (error.response.status === 429) {
                        // Rate limit - Retry-Afterヘッダーがあれば使用
                        const retryAfter = error.response.headers['retry-after'];
                        if (retryAfter) {
                            retryDelay = Math.min(parseInt(retryAfter) * 1000, 60000); // 最大60秒
                        }
                        console.error(`   💡 Rate limit exceeded. Will retry after ${retryDelay/1000}s`);
                        shouldRetry = true;
                    } else if (error.response.status >= 500) {
                        console.error('   💡 Discord server error. Will retry');
                        shouldRetry = true;
                    } else if (error.response.status === 400 && attempt <= 5) {
                        // 400エラーでも最初の5回は再試行（一時的な問題の可能性）
                        console.error('   💡 Bad request - will retry a few times in case of temporary issue');
                        shouldRetry = true;
                    } else {
                        console.error('   💡 Client error - not retrying');
                    }
                } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
                    console.error('   💡 Request timeout. Will retry with longer timeout');
                    shouldRetry = true;
                } else if (error.request) {
                    console.error('   💡 No response received. Will retry');
                    shouldRetry = true;
                } else {
                    console.error('   💡 Request setup error. Not retrying');
                }
                
                if (attempt < maxRetries && shouldRetry) {
                    console.log(`⏳ Waiting ${retryDelay/1000}s before retry...`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                } else if (!shouldRetry) {
                    console.error('   ❌ Error is not retryable, giving up');
                    return false;
                }
            }
        }
        
        console.error(`❌ All ${maxRetries} attempts failed, giving up`);
        return false;
    }
    
    // 事前定義されたテンプレート
    async sendSuccess(title, description, fields = []) {
        const embed = {
            title: `✅ ${title}`,
            description: description,
            color: 0x00ff88, // 緑色
            fields: fields,
            timestamp: new Date().toISOString()
        };
        return this.sendEmbed(embed);
    }
    
    async sendError(title, error, fields = []) {
        const embed = {
            title: `❌ ${title}`,
            description: error.message || error,
            color: 0xff0044, // 赤色
            fields: fields,
            timestamp: new Date().toISOString()
        };
        return this.sendEmbed(embed);
    }
    
    async sendInfo(title, description, fields = []) {
        const embed = {
            title: `ℹ️ ${title}`,
            description: description,
            color: 0x667eea, // 青色
            fields: fields,
            timestamp: new Date().toISOString()
        };
        return this.sendEmbed(embed);
    }
    
    async sendWarning(title, description, fields = []) {
        const embed = {
            title: `⚠️ ${title}`,
            description: description,
            color: 0xffa500, // オレンジ色
            fields: fields,
            timestamp: new Date().toISOString()
        };
        return this.sendEmbed(embed);
    }
}

// グローバルDiscord通知インスタンス
const discord = new DiscordNotifier();

// 使用例:
// await discord.sendMessage('シンプルなテキストメッセージ');
// await discord.sendSuccess('処理完了', '100件のツイートを処理しました');
// await discord.sendError('エラー発生', new Error('API制限に達しました'));
// await discord.sendInfo('お知らせ', 'メンテナンスは明日10時から');
// await discord.sendWarning('警告', 'ディスク容量が残り少なくなっています');
// 
// カスタムEmbed例:
// await discord.sendEmbed({
//     title: 'カスタムタイトル',
//     description: '詳細な説明',
//     color: 0x00ff00,
//     fields: [
//         { name: 'フィールド1', value: '値1', inline: true },
//         { name: 'フィールド2', value: '値2', inline: true }
//     ],
//     footer: { text: 'フッターテキスト' },
//     image: { url: 'https://example.com/image.png' }
// });

// Cron実行結果用の特殊化された通知関数
async function sendDiscordNotification(results) {
    console.log('🔍 Discord notification function called');
    console.log(`🔍 Webhook URL configured: ${process.env.DISCORD_WEBHOOK_URL ? 'YES (length: ' + process.env.DISCORD_WEBHOOK_URL.length + ')' : 'NO'}`);
    
    if (!process.env.DISCORD_WEBHOOK_URL) {
        console.error('❌ Discord webhook URL not configured, skipping notification');
        console.error('   Please set DISCORD_WEBHOOK_URL environment variable');
        return false;
    }
    
    try {
        console.log('🔍 Building Discord embed message...');
        const { executedTasks, totalProcessingTime, results: taskResults } = results;
        
        // 成功・失敗・新規ツイート数を集計
        const successTasks = taskResults.filter(task => task.status === 'success');
        const errorTasks = taskResults.filter(task => task.status === 'error');
        const totalNewTweets = successTasks.reduce((sum, task) => sum + (task.newItems || 0), 0);
        
        // ステータスに応じた色を設定
        let color;
        let statusIcon;
        if (errorTasks.length > 0) {
            color = 0xff0044; // 赤色（エラーあり）
            statusIcon = '❌';
        } else if (totalNewTweets > 0) {
            color = 0x00ff88; // 緑色（新規ツイートあり）
            statusIcon = '✅';
        } else {
            color = 0x667eea; // 青色（実行完了、新規なし）
            statusIcon = '🔄';
        }
        
        // Discord embed メッセージを構築
        const embed = {
            title: `${statusIcon} Twitter List Bot - Cron実行完了`,
            color: color,
            timestamp: new Date().toISOString(),
            fields: [
                {
                    name: '📊 実行結果',
                    value: `**実行タスク数**: ${executedTasks}件\n**処理時間**: ${totalProcessingTime.toFixed(2)}秒`,
                    inline: true
                },
                {
                    name: '🐦 ツイート収集',
                    value: `**新規取得**: ${totalNewTweets}件\n**成功/失敗**: ${successTasks.length}/${errorTasks.length}`,
                    inline: true
                }
            ]
        };
        
        // タスク詳細を追加
        if (taskResults.length > 0) {
            const taskDetails = taskResults.map(task => {
                const icon = task.status === 'success' ? '✅' : '❌';
                const newItems = task.newItems ? ` (${task.newItems}件)` : '';
                const processingTime = ` ${task.processingTime.toFixed(1)}s`;
                return `${icon} ${task.name}${newItems}${processingTime}`;
            }).join('\n');
            
            embed.fields.push({
                name: '📋 タスク詳細',
                value: taskDetails.length > 1024 ? taskDetails.substring(0, 1020) + '...' : taskDetails,
                inline: false
            });
        }
        
        // エラー詳細があれば追加
        if (errorTasks.length > 0) {
            const errorDetails = errorTasks.map(task => 
                `**${task.name}**: ${task.error}`
            ).join('\n');
            
            embed.fields.push({
                name: '⚠️ エラー詳細',
                value: errorDetails.length > 1024 ? errorDetails.substring(0, 1020) + '...' : errorDetails,
                inline: false
            });
        }
        
        // Discord通知を送信（拡張されたクラスを使用）
        console.log('🔍 Creating Discord notifier instance...');
        const notifier = new DiscordNotifier();
        
        console.log('🔍 Sending Discord embed message...');
        console.log('🔍 Embed data:', JSON.stringify(embed, null, 2));
        
        const success = await notifier.sendEmbed(embed, {
            username: 'Twitter List Bot',
            avatarUrl: 'https://cdn.discordapp.com/attachments/1234567890/twitter-icon.png'
        });
        
        if (success) {
            console.log('✅ Cron Discord notification sent successfully');
            return true;
        } else {
            console.error('❌ Cron Discord notification failed to send');
            return false;
        }
        
    } catch (error) {
        console.error('❌ Failed to send Discord notification in sendDiscordNotification:', error.message);
        console.error('   Error type:', error.constructor.name);
        console.error('   Stack trace:', error.stack);
        if (error.response) {
            console.error('   HTTP Status:', error.response.status);
            console.error('   Response data:', error.response.data);
        }
        return false;
    }
}

// シンプルなフォールバック通知関数
async function sendFallbackNotification(results) {
    if (!process.env.DISCORD_WEBHOOK_URL) {
        console.log('🚫 Fallback: Discord webhook URL not configured');
        return false;
    }
    
    try {
        const { executedTasks, totalProcessingTime, results: taskResults } = results;
        const totalNewTweets = taskResults.reduce((sum, task) => sum + (task.newItems || 0), 0);
        const errorTasks = taskResults.filter(task => task.status === 'error');
        
        const content = `🤖 **Cron実行完了** | タスク: ${executedTasks}件 | 新規ツイート: ${totalNewTweets}件 | 処理時間: ${totalProcessingTime.toFixed(1)}s | エラー: ${errorTasks.length}件`;
        
        const simplePayload = {
            content: content,
            username: 'Twitter Bot'
        };
        
        console.log('📤 Sending fallback notification...');
        const response = await axios.post(process.env.DISCORD_WEBHOOK_URL, simplePayload, {
            timeout: 30000, // 30秒タイムアウト
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.status === 204) {
            console.log('✅ Fallback notification sent successfully');
            return true;
        } else {
            console.error(`❌ Fallback notification failed with status: ${response.status}`);
            return false;
        }
    } catch (error) {
        console.error('❌ Fallback notification error:', error.message);
        return false;
    }
}

// GET エンドポイント（Vercel Cron Jobs用）
app.get('/api/cron/universal-executor', cronExecutor);

// Firebase configuration endpoint
app.get('/api/config/firebase', (req, res) => {
    try {
        const firebaseConfig = {
            apiKey: process.env.FIREBASE_API_KEY,
            authDomain: process.env.FIREBASE_AUTH_DOMAIN,
            projectId: process.env.FIREBASE_PROJECT_ID,
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
            messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
            appId: process.env.FIREBASE_APP_ID,
            measurementId: process.env.FIREBASE_MEASUREMENT_ID
        };

        res.json(firebaseConfig);
    } catch (error) {
        console.error('Error getting Firebase config:', error);
        res.status(500).json({ error: 'Failed to get Firebase configuration' });
    }
});

// Cron実行ログ分析用エンドポイント
app.get('/api/debug/cron-executions', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        
        // 最新の実行ログを取得
        const executionsRef = collection(db, 'cron_executions');
        const q = query(executionsRef, orderBy('startTime', 'desc'), limit(limit));
        const querySnapshot = await getDocs(q);
        
        const executions = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                // タイミング分析用の詳細計算
                startTime: data.startTime,
                endTime: data.endTime,
                processingTimeMs: data.processingTime * 1000,
                timeDiff: data.endTime ? new Date(data.endTime) - new Date(data.startTime) : null
            };
        });
        
        res.json({
            success: true,
            totalCount: querySnapshot.size,
            executions: executions,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error fetching cron executions:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch cron executions',
            message: error.message
        });
    }
});

// Cronタスクの詳細タイミング分析用エンドポイント
app.get('/api/debug/cron-tasks', async (req, res) => {
    try {
        // すべてのcron_tasksを取得
        const tasksRef = collection(db, 'cron_tasks');
        const tasksSnapshot = await getDocs(tasksRef);
        
        const tasks = [];
        const now = new Date();
        
        for (const taskDoc of tasksSnapshot.docs) {
            const taskData = taskDoc.data();
            
            // タイミング計算
            let timingAnalysis = null;
            if (taskData.lastExecuted) {
                const lastExecuted = new Date(taskData.lastExecuted);
                const minutesSince = (now - lastExecuted) / (1000 * 60);
                const shouldExecute = minutesSince >= (taskData.frequency - 0.1);
                
                timingAnalysis = {
                    lastExecuted: lastExecuted.toISOString(),
                    currentTime: now.toISOString(),
                    minutesSince: parseFloat(minutesSince.toFixed(4)),
                    frequency: taskData.frequency,
                    marginAdjustedFrequency: taskData.frequency - 0.1,
                    shouldExecute: shouldExecute,
                    nextExecution: new Date(lastExecuted.getTime() + (taskData.frequency * 60 * 1000)).toISOString()
                };
            }
            
            tasks.push({
                id: taskDoc.id,
                ...taskData,
                timingAnalysis
            });
        }
        
        res.json({
            success: true,
            totalCount: tasksSnapshot.size,
            tasks: tasks,
            timestamp: now.toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error fetching cron tasks:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch cron tasks',
            message: error.message
        });
    }
});

// Discord webhook直接テスト用エンドポイント
app.get('/api/discord/test', async (req, res) => {
    const testResults = {
        timestamp: new Date().toISOString(),
        environment: process.env.VERCEL_ENV || 'local',
        tests: []
    };
    
    console.log('🧪 Starting Discord webhook diagnostics...');
    
    // Test 1: 環境変数確認
    const webhookUrlConfigured = !!process.env.DISCORD_WEBHOOK_URL;
    testResults.tests.push({
        name: 'Environment Variable Check',
        success: webhookUrlConfigured,
        details: webhookUrlConfigured ? 
            `URL length: ${process.env.DISCORD_WEBHOOK_URL.length} chars` : 
            'DISCORD_WEBHOOK_URL not set'
    });
    
    if (!webhookUrlConfigured) {
        return res.json(testResults);
    }
    
    // Test 2: DNS解決テスト
    try {
        const dns = require('dns').promises;
        const dnsResult = await dns.lookup('discord.com');
        testResults.tests.push({
            name: 'DNS Resolution',
            success: true,
            details: `discord.com resolves to ${dnsResult.address} (${dnsResult.family})`
        });
    } catch (dnsError) {
        testResults.tests.push({
            name: 'DNS Resolution',
            success: false,
            details: `DNS error: ${dnsError.message}`
        });
    }
    
    // Test 3: 基本的なHTTP接続テスト
    try {
        console.log('🧪 Testing basic HTTP connectivity...');
        const httpResponse = await axios.get('https://httpbin.org/status/200', {
            timeout: 5000
        });
        testResults.tests.push({
            name: 'Basic HTTP Connectivity',
            success: httpResponse.status === 200,
            details: `httpbin.org responded with ${httpResponse.status}`
        });
    } catch (httpError) {
        testResults.tests.push({
            name: 'Basic HTTP Connectivity',
            success: false,
            details: `HTTP test failed: ${httpError.message}`
        });
    }
    
    // Test 4: Discord URL構造確認
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    const isValidDiscordUrl = webhookUrl.includes('discord.com/api/webhooks/');
    const webhookIdMatch = webhookUrl.match(/webhooks\/(\d+)\/([a-zA-Z0-9_-]+)/);
    
    let urlDetails = isValidDiscordUrl ? 'Valid Discord webhook URL format' : 'URL does not match Discord webhook pattern';
    if (webhookIdMatch) {
        urlDetails += ` | ID: ${webhookIdMatch[1].substring(0, 8)}... | Token length: ${webhookIdMatch[2].length}`;
    }
    
    testResults.tests.push({
        name: 'Discord URL Format',
        success: isValidDiscordUrl,
        details: urlDetails
    });
    
    // Test 5: シンプルなDiscord webhookテスト
    if (isValidDiscordUrl) {
        try {
            console.log('🧪 Testing Discord webhook with simple message...');
            const simplePayload = {
                content: `🧪 Test message from ${testResults.environment} at ${testResults.timestamp}`,
                username: 'Twitter Tool Bot'
            };
            
            const discordResponse = await axios.post(webhookUrl, simplePayload, {
                timeout: 20000, // 20秒タイムアウト
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'TwitterTool/1.0'
                }
            });
            
            testResults.tests.push({
                name: 'Simple Discord Message',
                success: discordResponse.status === 204,
                details: `Discord responded with ${discordResponse.status}`
            });
        } catch (discordError) {
            let errorDetails = `Discord error: ${discordError.message} (${discordError.code || 'unknown'})`;
            
            if (discordError.response) {
                errorDetails += ` | Status: ${discordError.response.status}`;
                if (discordError.response.data) {
                    errorDetails += ` | Response: ${JSON.stringify(discordError.response.data)}`;
                }
            }
            
            testResults.tests.push({
                name: 'Simple Discord Message',
                success: false,
                details: errorDetails
            });
        }
        
        // Test 6: Embedメッセージテスト
        try {
            console.log('🧪 Testing Discord embed message...');
            const embedPayload = {
                embeds: [{
                    title: '🧪 Discord Embed Test',
                    description: `Test from ${testResults.environment}`,
                    color: 0x00ff00,
                    timestamp: new Date().toISOString(),
                    fields: [
                        { name: 'Environment', value: testResults.environment, inline: true },
                        { name: 'Timestamp', value: testResults.timestamp, inline: true }
                    ]
                }],
                username: 'Twitter Tool Bot'
            };
            
            const embedResponse = await axios.post(webhookUrl, embedPayload, {
                timeout: 20000,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'TwitterTool/1.0'
                }
            });
            
            testResults.tests.push({
                name: 'Discord Embed Message',
                success: embedResponse.status === 204,
                details: `Embed message sent successfully (${embedResponse.status})`
            });
        } catch (embedError) {
            let errorDetails = `Embed error: ${embedError.message} (${embedError.code || 'unknown'})`;
            
            if (embedError.response) {
                errorDetails += ` | Status: ${embedError.response.status}`;
                if (embedError.response.data) {
                    errorDetails += ` | Response: ${JSON.stringify(embedError.response.data)}`;
                }
            }
            
            testResults.tests.push({
                name: 'Discord Embed Message',
                success: false,
                details: errorDetails
            });
        }
    }
    
    // Test 7: ネットワーク情報
    try {
        const os = require('os');
        const networkInterfaces = os.networkInterfaces();
        testResults.tests.push({
            name: 'Network Information',
            success: true,
            details: `Available interfaces: ${Object.keys(networkInterfaces).join(', ')}`
        });
    } catch (networkError) {
        testResults.tests.push({
            name: 'Network Information',
            success: false,
            details: `Network info error: ${networkError.message}`
        });
    }
    
    const successCount = testResults.tests.filter(t => t.success).length;
    const totalTests = testResults.tests.length;
    
    console.log(`✅ Discord diagnostics completed: ${successCount}/${totalTests} tests passed`);
    
    res.json({
        ...testResults,
        summary: {
            passed: successCount,
            total: totalTests,
            success: successCount === totalTests
        }
    });
});

// Twitter List タスク実行関数
async function executeTwitterListTask(task, executionTime) {
    // リスト設定を取得
    const listDoc = await getDoc(doc(db, 'twitter_lists', task.config.relatedTableId));
    if (!listDoc.exists()) {
        throw new Error(`Twitter list not found: ${task.config.relatedTableId}`);
    }
    
    const listData = listDoc.data();
    
    // 前回実行時刻の3分前から取得（マージン）
    const lastExecuted = listData.lastExecuted ? new Date(listData.lastExecuted) : new Date(Date.now() - 24 * 60 * 60 * 1000); // 初回は24時間前から
    const marginTime = new Date(lastExecuted.getTime() - 3 * 60 * 1000); // 3分前
    const currentTime = executionTime;
    
    const params = {
        listId: listData.twitterListId,
        sinceTime: Math.floor(marginTime.getTime() / 1000), // Unix timestamp(秒)
        untilTime: Math.floor(currentTime.getTime() / 1000)
    };
    
    console.log(`📋 List ID: ${listData.twitterListId}`);
    console.log(`⏰ Fetching tweets from ${marginTime.toISOString()} to ${currentTime.toISOString()}`);
    console.log(`🔗 API params:`, JSON.stringify(params));
    
    // TwitterAPI.io全件取得（ページネーション対応）
    const allTweets = [];
    let cursor = '';
    let page = 1;
    let hasNextPage = true;
    
    console.log(`🔄 Starting paginated fetch for all tweets...`);
    
    while (hasNextPage) {
        const pageParams = {
            ...params,
            cursor: cursor
        };
        
        console.log(`📄 Fetching page ${page} (cursor: ${cursor || 'initial'})`);
        
        const response = await axios.get('https://api.twitterapi.io/twitter/list/tweets', {
            params: pageParams,
            headers: { 'X-API-Key': process.env.TWITTER_API_KEY }
        });
        
        if (response.status !== 200) {
            console.error(`❌ API returned status ${response.status} on page ${page}`);
            break;
        }
        
        const pageData = response.data;
        const pageTweets = pageData.data || pageData.tweets || [];
        
        console.log(`📊 Page ${page}: ${pageTweets.length} tweets, has_next_page: ${pageData.has_next_page}`);
        
        if (pageTweets.length > 0) {
            allTweets.push(...pageTweets);
        }
        
        // 次のページがあるかチェック
        hasNextPage = pageData.has_next_page === true;
        if (hasNextPage && pageData.next_cursor) {
            cursor = pageData.next_cursor;
            page++;
        } else {
            hasNextPage = false;
        }
        
        // 安全のため最大20ページまで（400件）
        if (page > 20) {
            console.log(`⚠️ Reached maximum page limit (20 pages), stopping pagination`);
            break;
        }
    }
    
    console.log(`✅ Pagination completed: ${page} pages fetched, ${allTweets.length} total tweets`);
    
    const tweets = allTweets;
    
    // デバッグ用：最初の数件のツイート情報をログ出力
    if (tweets.length > 0) {
        console.log(`🔍 First tweet full structure:`, JSON.stringify(tweets[0], null, 2));
        console.log(`🔍 Available date fields:`, {
            created_at: tweets[0].created_at,
            createdAt: tweets[0].createdAt,
            date: tweets[0].date,
            timestamp: tweets[0].timestamp,
            created_time: tweets[0].created_time,
            time: tweets[0].time
        });
        console.log(`🔍 Available author fields:`, {
            author_id: tweets[0].author_id,
            authorId: tweets[0].authorId,
            'user.id': tweets[0].user?.id,
            'user.id_str': tweets[0].user?.id_str,
            'author.id': tweets[0].author?.id,
            'author.username': tweets[0].author?.username,
            'author.screen_name': tweets[0].author?.screen_name,
            'user.screen_name': tweets[0].user?.screen_name,
            'user.username': tweets[0].user?.username
        });
    }
    
    console.log(`🔍 Filter conditions:`, {
        lastTweetId: listData.lastTweetId,
        lastExecuted: lastExecuted.toISOString(),
        marginTime: marginTime.toISOString()
    });
    
    // 前回の最新ツイートID以降のみフィルタ（重複防止）
    const newTweets = tweets.filter(tweet => {
        // 前回の最新ツイートIDより新しいもののみ
        if (listData.lastTweetId && tweet.id <= listData.lastTweetId) {
            console.log(`🚫 Tweet ${tweet.id} filtered out: older than lastTweetId ${listData.lastTweetId}`);
            return false;
        }
        
        // 念のため時間でもフィルタ
        const dateValue = tweet.created_at || tweet.createdAt || tweet.date || tweet.timestamp || tweet.created_time || tweet.time;
        if (!dateValue) {
            console.log(`🚫 Tweet ${tweet.id} filtered out: no valid date field found`);
            return false;
        }
        
        const tweetTime = new Date(dateValue);
        if (isNaN(tweetTime.getTime())) {
            console.log(`🚫 Tweet ${tweet.id} filtered out: invalid date value "${dateValue}"`);
            return false;
        }
        
        if (!(tweetTime > lastExecuted)) {
            console.log(`🚫 Tweet ${tweet.id} filtered out: time ${tweetTime.toISOString()} <= lastExecuted ${lastExecuted.toISOString()}`);
            return false;
        }
        
        console.log(`✅ Tweet ${tweet.id} passed filters: time ${tweetTime.toISOString()}`);
        return true;
    });
    
    console.log(`📊 Filter results: ${tweets.length} → ${newTweets.length} tweets`);
    
    // DB重複チェック（念のため）
    const uniqueTweets = [];
    for (const tweet of newTweets) {
        const existingDoc = await getDocs(
            query(collection(db, 'collected_tweets'), 
                  where('tweetId', '==', tweet.id),
                  where('sourceId', '==', listData.listId))
        );
        
        if (existingDoc.empty) {
            uniqueTweets.push(tweet);
        } else {
            console.log(`Skipping duplicate tweet: ${tweet.id}`);
        }
    }
    
    console.log(`Final unique tweets: ${uniqueTweets.length}`);
    
    // 新しいツイートを保存
    for (const tweet of uniqueTweets) {
        const dateValue = tweet.created_at || tweet.createdAt || tweet.date || tweet.timestamp || tweet.created_time || tweet.time;
        const authorId = tweet.author_id || tweet.authorId || tweet.user?.id || tweet.user?.id_str || tweet.author?.id || 'unknown';
        const authorName = tweet.author?.username || tweet.author?.screen_name || tweet.user?.screen_name || tweet.user?.username || 'unknown';
        
        await addDoc(collection(db, 'collected_tweets'), {
            tweetId: tweet.id,
            sourceType: 'twitter_list',
            sourceId: listData.listId,
            taskId: task.taskId,
            text: tweet.text,
            authorId: authorId,
            authorName: authorName,
            createdAt: dateValue,
            collectedAt: executionTime.toISOString(),
            data: tweet
        });
        
        console.log(`💾 Saved tweet ${tweet.id} by ${authorName} (${authorId})`);
    }
    
    // メタデータ更新
    const updateData = {
        lastExecuted: executionTime.toISOString(),
        tweetCount: (listData.tweetCount || 0) + uniqueTweets.length,
        updatedAt: executionTime.toISOString()
    };
    
    // 最新ツイートIDを更新
    if (uniqueTweets.length > 0) {
        // ツイートIDでソート（降順）して最新を取得
        const sortedTweets = uniqueTweets.sort((a, b) => b.id.localeCompare(a.id));
        updateData.lastTweetId = sortedTweets[0].id;
    }
    
    await updateDoc(doc(db, 'twitter_lists', listData.listId), updateData);
    
    console.log(`List "${listData.name}": ${uniqueTweets.length} new tweets collected`);
    
    return { 
        newTweets: uniqueTweets.length,
        totalFetched: tweets.length,
        pagesRetrieved: page,
        duplicatesSkipped: newTweets.length - uniqueTweets.length,
        alreadyInDB: tweets.length - newTweets.length
    };
}


// リストツイート要約エンドポイント
app.post('/api/lists/:listId/summarize', async (req, res) => {
    try {
        const { listId } = req.params;
        const { summaryType = 'detailed', deleteAfter = false } = req.body;
        
        if (!openai) {
            return res.status(503).json({ error: 'OpenAI API が設定されていません' });
        }
        
        if (!registeredLists.has(listId)) {
            return res.status(404).json({ error: 'リストが見つかりません' });
        }
        
        const list = registeredLists.get(listId);
        const tweets = listTweets.get(listId) || [];
        
        if (tweets.length === 0) {
            return res.status(400).json({ error: 'ツイートが保存されていません' });
        }
        
        console.log(`Generating ${summaryType} summary for list ${list.name} (${tweets.length} tweets)`);
        
        // ツイートテキストを準備
        const tweetTexts = tweets.map((tweet, index) => 
            `${index + 1}. ${tweet.text}`
        ).join('\n\n');
        
        // プロンプトの選択
        let systemPrompt = '';
        let userPrompt = '';
        
        if (summaryType === 'brief') {
            systemPrompt = 'あなたは優秀なコンテンツ要約アシスタントです。与えられたツイートを簡潔に要約してください。';
            userPrompt = `以下の${tweets.length}件のツイートを3-5行で簡潔に要約してください：\n\n${tweetTexts}`;
        } else if (summaryType === 'detailed') {
            systemPrompt = 'あなたは優秀なコンテンツ分析アシスタントです。与えられたツイートを詳細に分析し要約してください。';
            userPrompt = `以下の${tweets.length}件のツイートを詳細に分析し、主要なトピック、トレンド、重要なポイントを含めて要約してください：\n\n${tweetTexts}`;
        } else if (summaryType === 'insights') {
            systemPrompt = 'あなたは優秀なデータアナリストです。与えられたツイートから洞察とトレンドを抽出してください。';
            userPrompt = `以下の${tweets.length}件のツイートから重要な洞察、トレンド、パターンを分析し、ビジネス的な観点も含めて報告してください：\n\n${tweetTexts}`;
        }
        
        // OpenAI APIを呼び出し
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            max_tokens: 1500,
            temperature: 0.7
        });
        
        const summary = completion.choices[0].message.content;
        
        // 要約結果を保存
        const summaryData = {
            listId,
            listName: list.name,
            summaryType,
            summary,
            tweetCount: tweets.length,
            createdAt: new Date().toISOString(),
            tokensUsed: completion.usage
        };
        
        // Firestoreに要約を保存
        try {
            await addDoc(collection(db, 'list-summaries'), summaryData);
            console.log(`Summary saved to Firestore for list ${listId}`);
        } catch (firestoreError) {
            console.error('Failed to save summary to Firestore:', firestoreError);
        }
        
        // 要約後にツイートを削除するオプション
        if (deleteAfter) {
            listTweets.set(listId, []);
            list.tweetCount = 0;
            list.lastTweetId = null;
            registeredLists.set(listId, list);
            
            // Firestoreからも削除
            try {
                const q = query(collection(db, 'list-tweets'), where('listId', '==', listId));
                const querySnapshot = await getDocs(q);
                const batch = writeBatch(db);
                querySnapshot.docs.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
                console.log(`Deleted ${querySnapshot.size} tweets from Firestore for list ${listId}`);
            } catch (deleteError) {
                console.error('Failed to delete tweets from Firestore:', deleteError);
            }
            
            updateStats();
        }
        
        console.log(`✅ Summary generated for list ${list.name} (${summaryType})`);
        res.json({
            success: true,
            summary,
            summaryType,
            tweetCount: tweets.length,
            tokensUsed: completion.usage,
            deleted: deleteAfter
        });
        
    } catch (error) {
        console.error('Summary generation error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message
        });
    }
});

// 要約履歴取得エンドポイント
app.get('/api/lists/:listId/summaries', async (req, res) => {
    try {
        const { listId } = req.params;
        const { limit = 10 } = req.query;
        
        const q = query(
            collection(db, 'list-summaries'),
            where('listId', '==', listId),
            orderBy('createdAt', 'desc'),
            limit(parseInt(limit))
        );
        
        const querySnapshot = await getDocs(q);
        const summaries = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        res.json({ summaries });
        
    } catch (error) {
        console.error('Error fetching summaries:', error);
        res.status(500).json({ error: error.message });
    }
});

// 定期要約用Cronジョブエンドポイント
app.post('/api/cron/summarize-lists', async (req, res) => {
    try {
        // セキュリティチェック
        const authHeader = req.headers.authorization;
        if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        if (!openai) {
            return res.status(503).json({ error: 'OpenAI API が設定されていません' });
        }
        
        console.log('🔄 Starting scheduled summarization for all lists');
        
        const results = {
            success: true,
            processedLists: 0,
            totalSummaries: 0,
            lists: []
        };
        
        // ツイートが保存されているリストのみ処理
        const listsWithTweets = Array.from(registeredLists.values())
            .filter(list => list.active && list.tweetCount > 0);
        
        for (const list of listsWithTweets) {
            try {
                const tweets = listTweets.get(list.listId) || [];
                
                if (tweets.length >= 10) { // 10件以上のツイートがある場合のみ要約
                    console.log(`Generating summary for list: ${list.name} (${tweets.length} tweets)`);
                    
                    // 詳細要約を生成
                    const summaryResponse = await fetch(`${req.protocol}://${req.get('host')}/api/lists/${list.listId}/summarize`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            summaryType: 'detailed',
                            deleteAfter: true // 要約後にツイートを削除
                        })
                    });
                    
                    if (summaryResponse.ok) {
                        results.totalSummaries++;
                        results.lists.push({
                            listId: list.listId,
                            name: list.name,
                            tweetCount: tweets.length,
                            summarized: true
                        });
                    }
                }
                
                results.processedLists++;
                
            } catch (listError) {
                console.error(`Error processing list ${list.listId}:`, listError);
                results.lists.push({
                    listId: list.listId,
                    name: list.name,
                    error: listError.message,
                    summarized: false
                });
            }
        }
        
        console.log(`✅ Summarization cron job completed: ${results.processedLists} lists processed, ${results.totalSummaries} summaries generated`);
        res.json(results);
        
    } catch (error) {
        console.error('Summarization cron job error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message
        });
    }
});

// サーバー起動
if (process.env.VERCEL) {
    // Vercel環境
    module.exports = app;
    console.log('🚀 Running in Vercel serverless mode');
} else {
    // ローカル環境
    server.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
        console.log('API Key is configured:', !!process.env.TWITTER_API_KEY);
        console.log(`📋 List Scheduler: http://localhost:${PORT}/list-scheduler.html`);
        
        if (wss) {
            console.log('WebSocket server is ready (Local development mode)');
            console.log('🚀 Hybrid monitoring system (WebSocket + High-frequency Polling) is ready');
        } else {
            console.log('Server-Sent Events ready (Production/Vercel mode)');
            console.log('🚀 Production monitoring system (SSE + Webhook polling) is ready');
        }
    });
}// Force redeploy #午後
// Environment variables updated #午後
// Force production deploy 1751130453
// Force new production domain 1751137528
