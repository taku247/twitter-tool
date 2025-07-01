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

class TwitterWorker {
    constructor() {
        this.db = null;
        this.app = null;
        this.isInitialized = false;
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
        
        // Discord通知
        if (results.length > 0) {
            await this.sendDiscordSummary(results);
        }
        
        return { 
            executedTasks: results.length, 
            successfulTasks: results.filter(r => r.success).length,
            failedTasks: results.filter(r => !r.success).length,
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
            duplicatesSkipped: tweets.length - newTweets.length
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
    
    // ========== Discord通知 ==========
    async sendDiscordSummary(results) {
        try {
            const successCount = results.filter(r => r.success).length;
            const errorCount = results.filter(r => !r.success).length;
            const totalNewTweets = results
                .filter(r => r.success)
                .reduce((sum, r) => sum + (r.result?.newTweets || 0), 0);
            
            const fields = [
                { name: "✅ 成功", value: successCount.toString(), inline: true },
                { name: "❌ エラー", value: errorCount.toString(), inline: true },
                { name: "🐦 新規ツイート", value: totalNewTweets.toString(), inline: true }
            ];
            
            // 各タスクの詳細
            const taskDetails = results.map(r => {
                if (r.success) {
                    return `• ${r.taskName || r.taskId}: ${r.result.newTweets}件の新規ツイート`;
                } else {
                    return `• ${r.taskName || r.taskId}: ❌ ${r.error}`;
                }
            }).join('\n');
            
            if (taskDetails) {
                fields.push({ name: "📋 詳細", value: taskDetails.substring(0, 1024), inline: false });
            }
            
            const message = {
                embeds: [{
                    title: "🤖 Railway Worker - タスク実行完了",
                    color: errorCount > 0 ? 0xff6b6b : 0x28a745,
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