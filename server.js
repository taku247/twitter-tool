const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const { OpenAI } = require('openai');
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

// HTMLファイルを提供
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log('API Key is configured:', !!process.env.TWITTER_API_KEY);
});