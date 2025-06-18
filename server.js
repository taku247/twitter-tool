const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const { OpenAI } = require('openai');
const WebSocket = require('ws');
const http = require('http');
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

// WebSocketサーバーを作成
const wss = new WebSocket.Server({ server });

// Twitter WebSocket接続管理
let twitterWs = null;
let currentMonitoringUsername = null;
let connectedClients = new Set();

// WebSocket接続ハンドラー
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
                await startTwitterMonitoring(data.username);
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

// 全てのクライアントにメッセージをブロードキャスト
function broadcastToClients(message) {
    const messageStr = JSON.stringify(message);
    connectedClients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(messageStr);
        }
    });
}

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
            interval_seconds: Math.max(100, intervalSeconds) // 最小100秒
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
            interval_seconds: Math.max(100, intervalSeconds),
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

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log('API Key is configured:', !!process.env.TWITTER_API_KEY);
    console.log('WebSocket server is ready');
    console.log('🚀 Hybrid monitoring system (WebSocket + High-frequency Polling) is ready');
});