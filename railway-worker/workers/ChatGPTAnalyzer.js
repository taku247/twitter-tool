const { 
    getFirestore, 
    collection, 
    addDoc, 
    getDoc, 
    getDocs, 
    updateDoc, 
    doc, 
    query, 
    where, 
    orderBy, 
    limit, 
    Timestamp,
    writeBatch,
    arrayUnion 
} = require('firebase/firestore');
// Node.js 18以降は内蔵fetchを使用
const fs = require('fs').promises;
const path = require('path');

/**
 * ChatGPT分析エンジン
 */
class ChatGPTAnalyzer {
    constructor(db) {
        this.db = db;
        this.openaiApiKey = process.env.OPENAI_API_KEY;
        this.reportsDir = process.env.REPORTS_DIR || './reports';
    }

    /**
     * 分析を実行
     */
    async analyze(listId, listData, templateId, options = {}) {
        const startTime = Date.now();
        const analysisId = `analysis-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
        
        try {
            console.log(`🤖 Starting ChatGPT analysis for list: ${listData.name}`);
            
            // 1. 分析レコード作成（処理中）
            const analysisDoc = await this.createAnalysisRecord(analysisId, listId, templateId, 'processing');
            
            // 2. 分析対象ツイート取得
            const tweets = await this.getAnalysisTargetTweets(listId, listData.analysis || {});
            
            if (!tweets || tweets.length === 0) {
                throw new Error('No tweets available for analysis');
            }
            
            // 3. テンプレート取得
            const template = await this.getTemplate(templateId);
            
            // 4. ChatGPT API呼び出し
            const apiResult = await this.callChatGPT(tweets, template);
            
            // 5. 結果解析
            const parsedResult = this.parseAnalysisResult(apiResult.rawResponse, template.category);
            
            // 6. CSV生成・保存
            const csvPath = await this.saveAnalysisAsCSV(analysisId, listData, tweets, parsedResult);
            
            // 7. 分析レコード更新（完了）
            await this.updateAnalysisRecord(analysisId, {
                status: 'completed',
                input: {
                    tweetCount: tweets.length,
                    dateRange: {
                        from: tweets[tweets.length - 1].createdAt,
                        to: tweets[0].createdAt
                    },
                    tweetIds: tweets.map(t => t.tweetId)
                },
                output: {
                    rawResponse: apiResult.rawResponse,
                    parsedData: parsedResult,
                    tokensUsed: apiResult.tokensUsed,
                    model: apiResult.model,
                    temperature: template.temperature
                },
                summary: parsedResult.summary || this.generateSummary(parsedResult),
                csvFilePath: csvPath,
                completedAt: Timestamp.now(),
                processingTime: Math.round((Date.now() - startTime) / 1000)
            });
            
            // 8. ツイートに分析済みフラグ設定
            await this.markTweetsAsAnalyzed(tweets, analysisId);
            
            // 9. テンプレート使用回数更新
            await this.incrementTemplateUsage(templateId);
            
            console.log(`✅ Analysis completed: ${analysisId}`);
            
            return {
                analysisId,
                summary: parsedResult.summary,
                csvPath,
                tweetCount: tweets.length,
                tokensUsed: apiResult.tokensUsed
            };
            
        } catch (error) {
            console.error(`❌ Analysis failed: ${error.message}`);
            
            // エラー時の分析レコード更新
            await this.updateAnalysisRecord(analysisId, {
                status: 'error',
                error: error.message,
                completedAt: Timestamp.now(),
                processingTime: Math.round((Date.now() - startTime) / 1000)
            });
            
            throw error;
        }
    }

    /**
     * 分析対象ツイート取得
     */
    async getAnalysisTargetTweets(listId, analysisConfig) {
        const minTweets = analysisConfig.minTweets || 5;
        const maxTweets = analysisConfig.maxTweets || 50;
        
        // 未分析のツイートを優先的に取得
        let tweetsQuery = query(
            collection(this.db, 'collected_tweets'),
            where('sourceId', '==', listId),
            orderBy('createdAt', 'desc'),
            limit(maxTweets * 2) // 余裕を持って取得
        );
        
        const snapshot = await getDocs(tweetsQuery);
        
        // 未分析ツイートをフィルタリング
        const unanalyzedTweets = [];
        const analyzedTweets = [];
        
        snapshot.docs.forEach(doc => {
            const tweet = { docId: doc.id, ...doc.data() };
            if (!tweet.analysis?.analyzed) {
                unanalyzedTweets.push(tweet);
            } else {
                analyzedTweets.push(tweet);
            }
        });
        
        // 未分析ツイートを優先、不足分は分析済みから補充
        let targetTweets = unanalyzedTweets.slice(0, maxTweets);
        
        if (targetTweets.length < minTweets && analyzedTweets.length > 0) {
            const additionalNeeded = Math.min(minTweets - targetTweets.length, analyzedTweets.length);
            targetTweets = targetTweets.concat(analyzedTweets.slice(0, additionalNeeded));
        }
        
        if (targetTweets.length < minTweets) {
            console.log(`⚠️ Not enough tweets: ${targetTweets.length} < ${minTweets}`);
            return null;
        }
        
        return targetTweets.slice(0, maxTweets);
    }

    /**
     * テンプレート取得
     */
    async getTemplate(templateId) {
        const templateDoc = await getDoc(doc(this.db, 'analysis_templates', templateId));
        
        if (!templateDoc.exists()) {
            throw new Error(`Template not found: ${templateId}`);
        }
        
        return {
            id: templateDoc.id,
            ...templateDoc.data()
        };
    }

    /**
     * ChatGPT API呼び出し
     */
    async callChatGPT(tweets, template) {
        // ツイートテキストの準備
        const tweetTexts = tweets.map((t, index) => 
            `[${index + 1}] @${t.authorName} (${new Date(t.createdAt).toLocaleString('ja-JP')}): ${t.text}`
        ).join('\n\n');
        
        // プロンプト生成
        const prompt = template.prompt
            .replace('{{tweets}}', tweetTexts)
            .replace('{{tweet_count}}', tweets.length.toString());
        
        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.openaiApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'gpt-4',
                    messages: [
                        {
                            role: 'system',
                            content: 'あなたはTwitterデータの分析専門家です。正確で洞察に富んだ分析を提供してください。'
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    max_tokens: template.maxTokens || 2000,
                    temperature: template.temperature || 0.7
                })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(`OpenAI API error: ${error.error?.message || 'Unknown error'}`);
            }
            
            const data = await response.json();
            
            return {
                rawResponse: data.choices[0].message.content,
                tokensUsed: data.usage.total_tokens,
                model: data.model
            };
            
        } catch (error) {
            console.error('ChatGPT API call failed:', error);
            throw error;
        }
    }

    /**
     * 分析結果の解析
     */
    parseAnalysisResult(rawResponse, category) {
        const parsed = {
            rawText: rawResponse,
            category: category
        };
        
        try {
            switch (category) {
                case 'sentiment':
                    parsed.sentiment = this.parseSentimentAnalysis(rawResponse);
                    parsed.summary = parsed.sentiment.summary;
                    break;
                    
                case 'trend':
                    parsed.trends = this.parseTrendAnalysis(rawResponse);
                    parsed.summary = parsed.trends.summary;
                    break;
                    
                case 'summary':
                    parsed.dailySummary = this.parseDailySummary(rawResponse);
                    parsed.summary = parsed.dailySummary.summary;
                    break;
                    
                default:
                    // カスタムテンプレートの場合は要約のみ抽出
                    parsed.summary = this.extractSummary(rawResponse);
            }
        } catch (error) {
            console.error('Failed to parse analysis result:', error);
            parsed.summary = this.extractSummary(rawResponse);
        }
        
        return parsed;
    }

    /**
     * 感情分析の解析
     */
    parseSentimentAnalysis(text) {
        const result = {
            overallSentiment: '',
            distribution: {},
            topics: [],
            notableTweets: [],
            summary: ''
        };
        
        // 全体的な感情傾向
        const sentimentMatch = text.match(/全体的な感情傾向[：:]\s*([^\n]+)/);
        if (sentimentMatch) {
            result.overallSentiment = sentimentMatch[1].trim();
        }
        
        // 感情の内訳
        const positiveMatch = text.match(/ポジティブ[：:]\s*(\d+)%/);
        const negativeMatch = text.match(/ネガティブ[：:]\s*(\d+)%/);
        const neutralMatch = text.match(/ニュートラル[：:]\s*(\d+)%/);
        
        if (positiveMatch) result.distribution.positive = parseInt(positiveMatch[1]);
        if (negativeMatch) result.distribution.negative = parseInt(negativeMatch[1]);
        if (neutralMatch) result.distribution.neutral = parseInt(neutralMatch[1]);
        
        // 要約
        const summaryMatch = text.match(/要約[：:]\s*([^\n]+(?:\n(?!##)[^\n]+)*)/);
        if (summaryMatch) {
            result.summary = summaryMatch[1].trim();
        }
        
        return result;
    }

    /**
     * トレンド分析の解析
     */
    parseTrendAnalysis(text) {
        const result = {
            mainTrends: [],
            influencers: [],
            predictions: '',
            summary: ''
        };
        
        // 主要トレンド抽出
        const trendsMatch = text.match(/主要トレンド[：:]\s*([^#]+)(?=##|$)/s);
        if (trendsMatch) {
            result.mainTrends = trendsMatch[1]
                .split('\n')
                .filter(line => line.trim())
                .map(line => line.replace(/^[\-\*]\s*/, '').trim());
        }
        
        // 要約抽出
        const summaryMatch = text.match(/要約[：:]\s*([^\n]+(?:\n(?!##)[^\n]+)*)/);
        if (summaryMatch) {
            result.summary = summaryMatch[1].trim();
        } else {
            result.summary = result.mainTrends.slice(0, 3).join('、');
        }
        
        return result;
    }

    /**
     * 日次要約の解析
     */
    parseDailySummary(text) {
        const result = {
            highlights: [],
            categories: {},
            statistics: {},
            summary: ''
        };
        
        // ハイライト抽出
        const highlightsMatch = text.match(/本日のハイライト[：:]\s*([^#]+)(?=##|$)/s);
        if (highlightsMatch) {
            result.highlights = highlightsMatch[1]
                .split('\n')
                .filter(line => line.trim())
                .map(line => line.replace(/^[\-\*\d.]\s*/, '').trim());
        }
        
        // 総括抽出
        const summaryMatch = text.match(/総括[：:]\s*([^\n]+(?:\n(?!##)[^\n]+)*)/);
        if (summaryMatch) {
            result.summary = summaryMatch[1].trim();
        }
        
        return result;
    }

    /**
     * 要約の抽出（フォールバック）
     */
    extractSummary(text) {
        // 要約セクションを探す
        const summaryMatch = text.match(/(?:要約|総括|まとめ|Summary)[：:]\s*([^\n]+(?:\n(?!##|\*|[\-\d])[^\n]+)*)/i);
        if (summaryMatch) {
            return summaryMatch[1].trim();
        }
        
        // 最初の段落を要約として使用
        const lines = text.split('\n').filter(line => line.trim());
        return lines.slice(0, 3).join(' ').substring(0, 200) + '...';
    }

    /**
     * CSV保存
     */
    async saveAnalysisAsCSV(analysisId, listData, tweets, parsedResult) {
        // ディレクトリ作成
        const year = new Date().getFullYear();
        const month = String(new Date().getMonth() + 1).padStart(2, '0');
        const dir = path.join(this.reportsDir, year.toString(), month);
        
        try {
            await fs.mkdir(dir, { recursive: true });
        } catch (error) {
            console.error('Failed to create directory:', error);
        }
        
        // CSVヘッダー
        const headers = [
            'tweet_id',
            'author_name',
            'tweet_text',
            'created_at',
            'analysis_category',
            'list_name',
            'analysis_date'
        ];
        
        // 分析カテゴリ別の追加フィールド
        if (parsedResult.category === 'sentiment' && parsedResult.sentiment) {
            headers.push('overall_sentiment', 'positive_score', 'negative_score', 'neutral_score');
        }
        
        // CSVデータ生成
        const rows = [headers.join(',')];
        
        tweets.forEach(tweet => {
            const row = [
                tweet.tweetId,
                tweet.authorName,
                `"${tweet.text.replace(/"/g, '""')}"`, // エスケープ
                new Date(tweet.createdAt).toISOString(),
                parsedResult.category,
                listData.name,
                new Date().toISOString()
            ];
            
            // カテゴリ別データ
            if (parsedResult.category === 'sentiment' && parsedResult.sentiment) {
                row.push(
                    parsedResult.sentiment.overallSentiment,
                    parsedResult.sentiment.distribution.positive || 0,
                    parsedResult.sentiment.distribution.negative || 0,
                    parsedResult.sentiment.distribution.neutral || 0
                );
            }
            
            rows.push(row.join(','));
        });
        
        // 分析結果サマリーを追加
        rows.push('');
        rows.push('--- Analysis Summary ---');
        rows.push(`Summary,"${parsedResult.summary?.replace(/"/g, '""') || 'N/A'}"`);
        
        // ファイル保存
        const filename = `analysis-${analysisId}.csv`;
        const filepath = path.join(dir, filename);
        
        await fs.writeFile(filepath, rows.join('\n'), 'utf8');
        
        return filepath;
    }

    /**
     * 分析レコード作成
     */
    async createAnalysisRecord(analysisId, sourceId, templateId, status) {
        const record = {
            analysisId,
            sourceType: 'twitter_list',
            sourceId,
            templateId,
            status,
            createdAt: Timestamp.now(),
            notifications: {
                discord: { sent: false }
            }
        };
        
        await addDoc(collection(this.db, 'ai_analysis'), record);
        return record;
    }

    /**
     * 分析レコード更新
     */
    async updateAnalysisRecord(analysisId, updates) {
        const q = query(
            collection(this.db, 'ai_analysis'),
            where('analysisId', '==', analysisId),
            limit(1)
        );
        
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            const docRef = snapshot.docs[0].ref;
            await updateDoc(docRef, updates);
        }
    }

    /**
     * ツイートを分析済みとしてマーク
     */
    async markTweetsAsAnalyzed(tweets, analysisId) {
        const batch = writeBatch(this.db);
        
        tweets.forEach(tweet => {
            if (tweet.docId) {
                const tweetRef = doc(this.db, 'collected_tweets', tweet.docId);
                batch.update(tweetRef, {
                    'analysis.analyzed': true,
                    'analysis.analysisIds': arrayUnion(analysisId),
                    'analysis.lastAnalyzed': Timestamp.now()
                });
            }
        });
        
        await batch.commit();
        console.log(`✅ Marked ${tweets.length} tweets as analyzed`);
    }

    /**
     * テンプレート使用回数を増やす
     */
    async incrementTemplateUsage(templateId) {
        const templateRef = doc(this.db, 'analysis_templates', templateId);
        const templateDoc = await getDoc(templateRef);
        
        if (templateDoc.exists()) {
            const currentUsage = templateDoc.data().usage || { totalRuns: 0 };
            await updateDoc(templateRef, {
                usage: {
                    totalRuns: currentUsage.totalRuns + 1,
                    lastUsed: Timestamp.now()
                }
            });
        }
    }

    /**
     * サマリー生成（フォールバック）
     */
    generateSummary(parsedResult) {
        if (parsedResult.summary) return parsedResult.summary;
        
        const parts = [];
        
        if (parsedResult.sentiment) {
            parts.push(`感情: ${parsedResult.sentiment.overallSentiment}`);
        }
        
        if (parsedResult.trends && parsedResult.trends.mainTrends.length > 0) {
            parts.push(`トレンド: ${parsedResult.trends.mainTrends.slice(0, 3).join('、')}`);
        }
        
        if (parsedResult.dailySummary && parsedResult.dailySummary.highlights.length > 0) {
            parts.push(`ハイライト: ${parsedResult.dailySummary.highlights[0]}`);
        }
        
        return parts.join(' / ') || '分析完了';
    }
}

module.exports = ChatGPTAnalyzer;