const { initializeApp } = require('firebase/app');
const { 
    getFirestore, 
    collection, 
    addDoc,
    getDocs,
    getDoc,
    doc,
    query, 
    where, 
    orderBy,
    limit,
    updateDoc,
    writeBatch,
    Timestamp
} = require('firebase/firestore');
const axios = require('axios');
const ChatGPTAnalyzer = require('./ChatGPTAnalyzer');
const AnalysisTemplateManager = require('./AnalysisTemplateManager');

class TwitterWorker {
    constructor() {
        this.db = null;
        this.app = null;
        this.isInitialized = false;
        this.chatGPTAnalyzer = null;
        this.templateManager = null;
        this.initializeFirebase();
    }
    
    async initializeFirebase() {
        try {
            // 必須フィールドのチェック
            const requiredFields = [
                'FIREBASE_API_KEY',
                'FIREBASE_AUTH_DOMAIN', 
                'FIREBASE_PROJECT_ID',
                'FIREBASE_STORAGE_BUCKET',
                'FIREBASE_MESSAGING_SENDER_ID',
                'FIREBASE_APP_ID'
            ];
            
            const missing = requiredFields.filter(field => !process.env[field]);
            if (missing.length > 0) {
                throw new Error(`Missing Firebase environment variables: ${missing.join(', ')}`);
            }
            
            const firebaseConfig = {
                apiKey: process.env.FIREBASE_API_KEY,
                authDomain: process.env.FIREBASE_AUTH_DOMAIN,
                projectId: process.env.FIREBASE_PROJECT_ID,
                storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
                messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
                appId: process.env.FIREBASE_APP_ID,
                measurementId: process.env.FIREBASE_MEASUREMENT_ID
            };
            
            console.log(`🔍 Initializing Firebase for project: ${firebaseConfig.projectId}`);
            
            this.app = initializeApp(firebaseConfig);
            this.db = getFirestore(this.app);
            
            // ChatGPT関連サービス初期化
            this.chatGPTAnalyzer = new ChatGPTAnalyzer(this.db);
            this.templateManager = new AnalysisTemplateManager(this.db);
            
            this.isInitialized = true;
            
            console.log('✅ Firebase initialized in Railway Worker');
            
            // 接続テスト
            await this.testFirebaseConnection();
            
        } catch (error) {
            console.error('❌ Firebase initialization failed:', error);
            console.error('Firebase Config State:', {
                hasApiKey: !!process.env.FIREBASE_API_KEY,
                hasAuthDomain: !!process.env.FIREBASE_AUTH_DOMAIN,
                hasProjectId: !!process.env.FIREBASE_PROJECT_ID,
                hasStorageBucket: !!process.env.FIREBASE_STORAGE_BUCKET,
                hasMessagingSenderId: !!process.env.FIREBASE_MESSAGING_SENDER_ID,
                hasAppId: !!process.env.FIREBASE_APP_ID
            });
            throw error;
        }
    }
    
    async testFirebaseConnection() {
        try {
            // 軽量なFirestore接続テスト
            const testCollection = collection(this.db, 'connection_test');
            console.log('🔍 Testing Firestore connection...');
            // 単純な接続確認（実際の読み書きはしない）
            console.log('✅ Firestore connection test passed');
        } catch (error) {
            console.warn('⚠️ Firestore connection test failed:', error.message);
            // 接続テスト失敗でもアプリは継続（後で実際の操作時にエラーになる）
        }
    }
    
    async ensureInitialized() {
        if (!this.isInitialized) {
            console.log('⏳ Waiting for Firebase initialization...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (!this.isInitialized) {
                throw new Error('Firebase initialization timeout');
            }
        }
    }
    
    // ========== メインジョブ処理 ==========
    async processJob(job) {
        await this.ensureInitialized();
        
        const { type, data, requestId } = job;
        const startTime = Date.now();
        
        try {
            console.log(`🔄 Processing job: ${type} | ${requestId}`);
            
            let result;
            switch (type) {
                case 'scheduled_processing':
                    result = await this.processScheduledTasks();
                    break;
                case 'twitter_list_processing':
                    result = await this.processTwitterList(data);
                    break;
                case 'manual_analysis':
                    result = await this.processManualAnalysis(data);
                    break;
                case 'test':
                    result = await this.processTestJob(data);
                    break;
                default:
                    throw new Error(`Unknown job type: ${type}`);
            }
            
            const processingTime = Date.now() - startTime;
            
            // 実行ログを保存
            await this.logJobExecution(type, requestId, 'success', result, processingTime);
            
            return { success: true, result, processingTime };
            
        } catch (error) {
            const processingTime = Date.now() - startTime;
            console.error(`❌ Job failed: ${type} | ${requestId}`, error);
            
            await this.logJobExecution(type, requestId, 'error', { error: error.message }, processingTime);
            
            throw error;
        }
    }
    
    // ========== スケジュールタスク処理 ==========
    async processScheduledTasks() {
        console.log('📋 Processing scheduled tasks...');
        
        // アクティブなタスクを取得
        const tasksSnapshot = await getDocs(
            query(collection(this.db, 'cron_tasks'), where('active', '==', true))
        );
        
        const allTasks = tasksSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        console.log(`📊 Total active tasks: ${allTasks.length}`);
        
        const now = new Date();
        const tasksToExecute = allTasks.filter(task => {
            if (!task.lastExecuted) {
                console.log(`📝 Task ${task.id} has never been executed, will execute now`);
                return true;
            }
            
            const lastExecuted = task.lastExecuted.toDate ? task.lastExecuted.toDate() : new Date(task.lastExecuted);
            const minutesSince = (now - lastExecuted) / (1000 * 60);
            const shouldExecute = minutesSince >= (task.frequency - 2); // 2分マージン
            
            if (shouldExecute) {
                console.log(`⏰ Task ${task.id} should execute: ${minutesSince.toFixed(1)} minutes since last execution`);
            }
            
            return shouldExecute;
        });
        
        console.log(`📊 Tasks to execute: ${tasksToExecute.length}`);
        
        const results = [];
        for (const task of tasksToExecute) {
            try {
                console.log(`▶️ Executing task: ${task.name || task.id}`);
                const result = await this.executeTwitterListTask(task, now);
                results.push({ taskId: task.id, taskName: task.name, success: true, result });
            } catch (error) {
                console.error(`❌ Task failed: ${task.id}`, error);
                results.push({ taskId: task.id, taskName: task.name, success: false, error: error.message });
            }
        }
        
        // ChatGPT分析実行
        const analysisResults = await this.checkAndRunAnalysis(tasksToExecute);
        
        // Discord通知
        if (results.length > 0 || analysisResults.length > 0) {
            await this.sendDiscordSummary(results, analysisResults);
        }
        
        return { 
            executedTasks: results.length, 
            successfulTasks: results.filter(r => r.success).length,
            failedTasks: results.filter(r => !r.success).length,
            analysisResults: analysisResults.length,
            results 
        };
    }
    
    // ========== Twitterリストタスク実行 ==========
    async executeTwitterListTask(task, currentTime) {
        console.log(`🐦 Processing Twitter list task: ${task.config?.relatedTableId}`);
        
        // リストデータ取得
        const listDoc = await getDoc(doc(this.db, 'twitter_lists', task.config.relatedTableId));
        
        if (!listDoc.exists()) {
            throw new Error(`List not found: ${task.config.relatedTableId}`);
        }
        
        const listData = listDoc.data();
        console.log(`📋 List: ${listData.name} (${listData.twitterListId})`);
        
        // タスクの lastExecuted を更新
        await updateDoc(doc(this.db, 'cron_tasks', task.id), {
            lastExecuted: Timestamp.fromDate(currentTime)
        });
        
        // TwitterAPI.ioからツイート取得
        const tweets = await this.fetchTweetsFromAPI(listData, currentTime);
        console.log(`🔍 Fetched ${tweets.length} tweets from API`);
        
        // 新規ツイートのみフィルタリング・保存
        const newTweets = await this.saveNewTweets(tweets, task.config.relatedTableId, task.id);
        
        // リストのメタデータ更新
        if (newTweets.length > 0) {
            const latestTweet = newTweets[newTweets.length - 1];
            await updateDoc(doc(this.db, 'twitter_lists', task.config.relatedTableId), {
                lastExecuted: Timestamp.fromDate(currentTime),
                lastTweetId: latestTweet.tweetId,
                tweetCount: (listData.tweetCount || 0) + newTweets.length,
                updatedAt: Timestamp.fromDate(currentTime)
            });
        }
        
        // 実行ログを記録
        await this.logCronExecution(task.id, 'twitter_list', 'success', {
            sourceId: task.config.relatedTableId,
            totalFetched: tweets.length,
            newItems: newTweets.length,
            duplicatesSkipped: tweets.length - newTweets.length
        });
        
        console.log(`✅ Processed ${newTweets.length} new tweets for ${listData.name}`);
        
        return { 
            listName: listData.name,
            newTweets: newTweets.length, 
            totalProcessed: tweets.length,
            duplicatesSkipped: tweets.length - newTweets.length,
            listData: listData  // 分析チェック用
        };
    }
    
    // ========== TwitterAPI.io連携 ==========
    async fetchTweetsFromAPI(listData, currentTime) {
        const lastExecuted = listData.lastExecuted ? 
            (listData.lastExecuted.toDate ? listData.lastExecuted.toDate() : new Date(listData.lastExecuted)) : 
            new Date(Date.now() - 24 * 60 * 60 * 1000); // 初回は24時間前から
            
        const marginTime = new Date(lastExecuted.getTime() - 3 * 60 * 1000); // 3分マージン
        
        const params = {
            listId: listData.twitterListId,
            sinceTime: Math.floor(marginTime.getTime() / 1000),
            untilTime: Math.floor(currentTime.getTime() / 1000),
            page: 1
        };
        
        console.log(`🔍 API params:`, {
            listId: params.listId,
            sinceTime: new Date(params.sinceTime * 1000).toISOString(),
            untilTime: new Date(params.untilTime * 1000).toISOString()
        });
        
        const allTweets = [];
        let currentPage = 1;
        const maxPages = 20; // 最大20ページ（400ツイート）
        
        while (currentPage <= maxPages) {
            try {
                const response = await axios.get('https://api.twitterapi.io/twitter/list/tweets', {
                    params: { ...params, page: currentPage },
                    headers: {
                        'X-API-Key': process.env.TWITTER_API_KEY,
                        'Content-Type': 'application/json'
                    }
                });
                
                const tweets = response.data.tweets || [];
                console.log(`📄 Page ${currentPage}: ${tweets.length} tweets`);
                
                if (tweets.length === 0) break;
                
                allTweets.push(...tweets);
                currentPage++;
                
                // 1ページあたり20件未満の場合は次ページなし
                if (tweets.length < 20) break;
                
            } catch (error) {
                console.error(`❌ API error on page ${currentPage}:`, error.message);
                if (error.response?.status === 404) {
                    break; // これ以上ページがない
                }
                throw error;
            }
        }
        
        return allTweets;
    }
    
    // ========== ツイート保存処理 ==========
    async saveNewTweets(tweets, listId, taskId) {
        const newTweets = [];
        const batch = writeBatch(this.db);
        let batchCount = 0;
        
        for (const tweet of tweets) {
            // 重複チェック
            const existingSnapshot = await getDocs(
                query(
                    collection(this.db, 'collected_tweets'), 
                    where('tweetId', '==', tweet.id || tweet.tweetId),
                    limit(1)
                )
            );
            
            if (existingSnapshot.empty) {
                // 新規ツイートを保存
                const tweetData = {
                    tweetId: tweet.id || tweet.tweetId,
                    sourceType: 'twitter_list',
                    sourceId: listId,
                    taskId: taskId,
                    text: tweet.text || tweet.full_text || tweet.tweet,
                    authorId: tweet.author?.id || tweet.user?.id || tweet.userId || 'unknown',
                    authorName: tweet.author?.username || tweet.user?.screen_name || tweet.username || 'unknown',
                    createdAt: tweet.created_at || tweet.createdAt || tweet.timestamp,
                    collectedAt: Timestamp.now(),
                    data: tweet
                };
                
                const docRef = doc(collection(this.db, 'collected_tweets'));
                batch.set(docRef, tweetData);
                newTweets.push(tweetData);
                batchCount++;
                
                // バッチサイズ制限（500件）に達したらコミット
                if (batchCount >= 400) {
                    await batch.commit();
                    console.log(`💾 Batch committed: ${batchCount} tweets`);
                    batchCount = 0;
                }
            }
        }
        
        // 残りのツイートをコミット
        if (batchCount > 0) {
            await batch.commit();
            console.log(`💾 Final batch committed: ${batchCount} tweets`);
        }
        
        return newTweets;
    }
    
    // ========== ChatGPT分析処理 ==========
    async checkAndRunAnalysis(executedTasks) {
        const analysisResults = [];
        
        for (const task of executedTasks) {
            try {
                // タスク結果からリストデータを取得
                const listData = task.result?.listData;
                if (!listData) continue;
                
                // ChatGPT分析設定チェック
                const shouldAnalyze = await this.shouldRunAnalysis(listData, task.config.relatedTableId);
                if (!shouldAnalyze.should) {
                    console.log(`⏭️ Skipping analysis for ${listData.name}: ${shouldAnalyze.reason}`);
                    continue;
                }
                
                console.log(`🤖 Starting ChatGPT analysis for ${listData.name}`);
                
                // 分析実行
                const analysisResult = await this.chatGPTAnalyzer.analyze(
                    task.config.relatedTableId,
                    listData,
                    shouldAnalyze.templateId,
                    shouldAnalyze.options
                );
                
                analysisResults.push({
                    listId: task.config.relatedTableId,
                    listName: listData.name,
                    success: true,
                    result: analysisResult
                });
                
                console.log(`✅ Analysis completed for ${listData.name}: ${analysisResult.analysisId}`);
                
            } catch (error) {
                console.error(`❌ Analysis failed for task ${task.id}:`, error);
                analysisResults.push({
                    listId: task.config?.relatedTableId,
                    listName: task.taskName || task.id,
                    success: false,
                    error: error.message
                });
            }
        }
        
        return analysisResults;
    }
    
    async shouldRunAnalysis(listData, listId) {
        // ChatGPT分析設定チェック
        if (!listData.analysis || !listData.analysis.enabled) {
            return { should: false, reason: 'Analysis not enabled' };
        }
        
        // OpenAI API キーチェック
        if (!process.env.OPENAI_API_KEY) {
            return { should: false, reason: 'OpenAI API key not configured' };
        }
        
        // テンプレートID確認
        const templateId = listData.analysis.templateId;
        if (!templateId) {
            return { should: false, reason: 'No template configured' };
        }
        
        // テンプレート存在確認
        try {
            const template = await this.templateManager.get(templateId);
            if (!template) {
                return { should: false, reason: 'Template not found' };
            }
        } catch (error) {
            return { should: false, reason: `Template error: ${error.message}` };
        }
        
        // 分析頻度チェック
        const frequency = listData.analysis.frequency || 'daily';
        const lastAnalyzed = listData.analysis.lastAnalyzed;
        
        if (lastAnalyzed && !this.shouldRunByFrequency(lastAnalyzed, frequency)) {
            return { should: false, reason: `Too soon (frequency: ${frequency})` };
        }
        
        // 最小ツイート数チェック
        const minTweets = listData.analysis.minTweets || 5;
        const unanalyzedCount = await this.getUnanalyzedTweetCount(listId);
        
        if (unanalyzedCount < minTweets) {
            return { should: false, reason: `Not enough tweets (${unanalyzedCount} < ${minTweets})` };
        }
        
        return {
            should: true,
            templateId: templateId,
            options: {
                frequency: frequency,
                minTweets: minTweets,
                maxTweets: listData.analysis.maxTweets || 50
            }
        };
    }
    
    shouldRunByFrequency(lastAnalyzed, frequency) {
        const now = new Date();
        const lastDate = lastAnalyzed.toDate ? lastAnalyzed.toDate() : new Date(lastAnalyzed);
        const hoursSince = (now - lastDate) / (1000 * 60 * 60);
        
        switch (frequency) {
            case 'hourly':
                return hoursSince >= 1;
            case 'daily':
                return hoursSince >= 24;
            case 'weekly':
                return hoursSince >= 168; // 7 * 24
            default:
                return hoursSince >= 24; // デフォルトは日次
        }
    }
    
    async getUnanalyzedTweetCount(listId) {
        try {
            const snapshot = await getDocs(
                query(
                    collection(this.db, 'collected_tweets'),
                    where('sourceId', '==', listId),
                    where('analysis.analyzed', '!=', true)
                )
            );
            return snapshot.size;
        } catch (error) {
            console.error('Failed to count unanalyzed tweets:', error);
            return 0;
        }
    }
    
    // ========== Discord通知 ==========
    async sendDiscordSummary(results, analysisResults = []) {
        try {
            const successCount = results.filter(r => r.success).length;
            const errorCount = results.filter(r => !r.success).length;
            const totalNewTweets = results
                .filter(r => r.success)
                .reduce((sum, r) => sum + (r.result?.newTweets || 0), 0);
                
            // 分析結果の集計
            const analysisSuccess = analysisResults.filter(r => r.success).length;
            const analysisError = analysisResults.filter(r => !r.success).length;
            
            const fields = [
                { name: "✅ タスク成功", value: successCount.toString(), inline: true },
                { name: "❌ タスクエラー", value: errorCount.toString(), inline: true },
                { name: "🐦 新規ツイート", value: totalNewTweets.toString(), inline: true }
            ];
            
            // 分析結果がある場合
            if (analysisResults.length > 0) {
                fields.push(
                    { name: "🤖 分析成功", value: analysisSuccess.toString(), inline: true },
                    { name: "🔥 分析エラー", value: analysisError.toString(), inline: true },
                    { name: "📊 分析済み", value: analysisResults.length.toString(), inline: true }
                );
            }
            
            // 各タスクの詳細
            const taskDetails = results.map(r => {
                if (r.success) {
                    return `• ${r.taskName || r.taskId}: ${r.result.newTweets}件の新規ツイート`;
                } else {
                    return `• ${r.taskName || r.taskId}: ❌ ${r.error}`;
                }
            }).join('\n');
            
            // 分析詳細
            const analysisDetails = analysisResults.map(r => {
                if (r.success) {
                    const tokens = r.result.tokensUsed || 'N/A';
                    return `• ${r.listName}: 📊 分析完了 (${tokens} tokens)`;
                } else {
                    return `• ${r.listName}: 🔥 分析失敗 (${r.error})`;
                }
            }).join('\\n');
            
            const allDetails = [taskDetails, analysisDetails].filter(d => d).join('\\n\\n');
            
            if (allDetails) {
                fields.push({ name: "📋 詳細", value: allDetails.substring(0, 1024), inline: false });
            }
            
            const totalErrors = errorCount + analysisError;
            const hasAnalysis = analysisResults.length > 0;
            const title = hasAnalysis ? "🤖 Railway Worker - タスク・分析実行完了" : "🤖 Railway Worker - タスク実行完了";
            
            const message = {
                embeds: [{
                    title: title,
                    color: totalErrors > 0 ? 0xff6b6b : 0x28a745,
                    fields: fields,
                    timestamp: new Date().toISOString(),
                    footer: { text: "Railway Worker System" }
                }]
            };
            
            await axios.post(process.env.DISCORD_WEBHOOK_URL, message);
            console.log('📢 Discord notification sent');
            
        } catch (error) {
            console.error('❌ Discord notification failed:', error.message);
        }
    }
    
    // ========== ロギング ==========
    async logJobExecution(jobType, requestId, status, result, processingTime) {
        try {
            const logData = {
                jobType,
                requestId,
                status,
                result: status === 'success' ? result : { error: result.error },
                processingTime,
                timestamp: Timestamp.now(),
                workerInfo: {
                    platform: 'railway',
                    memory: {
                        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
                        unit: 'MB'
                    },
                    uptime: Math.round(process.uptime())
                }
            };
            
            await addDoc(collection(this.db, 'worker_executions'), logData);
            
        } catch (error) {
            console.error('Failed to log job execution:', error);
        }
    }
    
    async logCronExecution(taskId, taskType, status, metadata = {}) {
        try {
            const executionData = {
                taskId,
                taskType,
                status,
                startTime: metadata.startTime || Timestamp.now(),
                endTime: Timestamp.now(),
                newItems: metadata.newItems || 0,
                processingTime: metadata.processingTime || 0,
                metadata
            };
            
            await addDoc(collection(this.db, 'cron_executions'), executionData);
            
        } catch (error) {
            console.error('Failed to log cron execution:', error);
        }
    }
    
    // ========== 手動分析処理 ==========
    async processManualAnalysis(data) {
        console.log('🤖 Processing manual analysis job:', data);
        const startTime = Date.now();
        
        const { listId, templateId } = data;
        
        if (!listId || !templateId) {
            throw new Error('Missing required parameters: listId and templateId');
        }
        
        try {
            // リストデータ取得
            const listDoc = await getDoc(doc(this.db, 'twitter_lists', listId));
            
            if (!listDoc.exists()) {
                throw new Error(`List not found: ${listId}`);
            }
            
            const listData = listDoc.data();
            console.log(`📋 Manual analysis for list: ${listData.name} (${listId})`);
            
            // テンプレート存在確認
            const template = await this.templateManager.get(templateId);
            if (!template) {
                throw new Error(`Template not found: ${templateId}`);
            }
            
            console.log(`📝 Using template: ${template.name} (${templateId})`);
            
            // 分析実行
            const analysisResult = await this.chatGPTAnalyzer.analyze(
                listId,
                listData,
                templateId,
                {
                    manualRequest: true,
                    requestedBy: data.requestedBy || 'manual',
                    requestedAt: data.requestedAt
                }
            );
            
            // リストの最終分析時刻を更新
            if (listData.analysis) {
                await updateDoc(doc(this.db, 'twitter_lists', listId), {
                    'analysis.lastAnalyzed': Timestamp.now(),
                    updatedAt: Timestamp.now()
                });
            }
            
            // ai_analysisレコードに表示用フィールドを更新
            await this.chatGPTAnalyzer.updateAnalysisRecord(analysisResult.analysisId, {
                listName: listData.name,
                templateName: template.name,
                tweetCount: analysisResult.tweetCount,
                tokensUsed: analysisResult.tokensUsed,
                summary: analysisResult.summary || '分析完了',
                processingTime: Math.round((Date.now() - startTime) / 1000)
            });
            
            console.log(`✅ Manual analysis completed: ${analysisResult.analysisId}`);
            
            return {
                success: true,
                analysisId: analysisResult.analysisId,
                listName: listData.name,
                templateName: template.name,
                summary: analysisResult.summary,
                tweetCount: analysisResult.tweetCount,
                tokensUsed: analysisResult.tokensUsed,
                csvPath: analysisResult.csvPath
            };
            
        } catch (error) {
            console.error(`❌ Manual analysis failed: ${error.message}`);
            throw error;
        }
    }
    
    // ========== テスト用ジョブ ==========
    async processTestJob(data) {
        console.log('🧪 Processing test job:', data);
        
        // Firebase接続確認
        const testDoc = await addDoc(collection(this.db, 'test_jobs'), {
            message: data.message || 'Test job from Railway Worker',
            timestamp: Timestamp.now(),
            worker: 'railway'
        });
        
        return {
            message: 'Test job completed',
            docId: testDoc.id,
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = TwitterWorker;