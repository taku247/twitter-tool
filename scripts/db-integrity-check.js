#!/usr/bin/env node

const axios = require('axios');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, query, where, limit } = require('firebase/firestore');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Firebase設定（環境変数から取得）
const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    measurementId: process.env.FIREBASE_MEASUREMENT_ID
};

// Firebase初期化
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

class DatabaseIntegrityChecker {
    constructor() {
        this.TWITTER_API_KEY = process.env.TWITTER_API_KEY;
        this.API_BASE_URL = 'https://api.twitterapi.io';
        this.results = {
            checkDate: new Date().toISOString(),
            tasks: [],
            summary: {
                totalTasks: 0,
                totalDbTweets: 0,
                totalApiTweets: 0,
                missingTweets: 0,
                duplicateTweets: 0,
                errors: []
            }
        };
    }

    async checkAllTasks() {
        console.log('🔍 データベース整合性チェック開始...\n');
        
        try {
            // アクティブなcron_tasksを取得
            const tasksSnapshot = await getDocs(
                query(collection(db, 'cron_tasks'), 
                      where('taskType', '==', 'twitter_list'),
                      where('active', '==', true))
            );
            
            this.results.summary.totalTasks = tasksSnapshot.size;
            console.log(`📋 アクティブなタスク数: ${tasksSnapshot.size}\n`);
            
            for (const taskDoc of tasksSnapshot.docs) {
                const taskData = taskDoc.data();
                await this.checkTask(taskData);
            }
            
            this.generateReport();
            
        } catch (error) {
            console.error('❌ チェック中にエラーが発生しました:', error);
            this.results.summary.errors.push(error.message);
        }
    }
    
    async checkTask(taskData) {
        console.log(`\n🔍 タスク「${taskData.name}」をチェック中...`);
        console.log(`  - タスクID: ${taskData.taskId}`);
        console.log(`  - 頻度: ${taskData.frequency}分`);
        console.log(`  - 最終実行: ${taskData.lastExecuted || 'なし'}`);
        
        const taskResult = {
            taskId: taskData.taskId,
            taskName: taskData.name,
            listId: taskData.config?.relatedTableId,
            dbTweets: [],
            apiTweets: [],
            missing: [],
            duplicates: [],
            timeRange: {}
        };
        
        try {
            // 1. DBからツイート取得
            const dbTweets = await this.getDbTweets(taskData);
            taskResult.dbTweets = dbTweets;
            this.results.summary.totalDbTweets += dbTweets.length;
            
            console.log(`  ✅ DB保存済みツイート: ${dbTweets.length}件`);
            
            if (dbTweets.length === 0) {
                console.log('  ⚠️  DBにツイートがありません');
                this.results.tasks.push(taskResult);
                return;
            }
            
            // 2. 時間範囲を特定
            const timeRange = this.getTimeRange(dbTweets);
            taskResult.timeRange = timeRange;
            console.log(`  📅 時間範囲: ${new Date(timeRange.earliest).toLocaleString('ja-JP')} 〜 ${new Date(timeRange.latest).toLocaleString('ja-JP')}`);
            
            // 2.1 時間範囲の詳細分析
            const rangeHours = (new Date(timeRange.latest) - new Date(timeRange.earliest)) / (1000 * 60 * 60);
            console.log(`  🔍 時間範囲詳細:`);
            console.log(`     - 期間: ${rangeHours.toFixed(1)}時間`);
            console.log(`     - 1時間あたり平均: ${(dbTweets.length / rangeHours).toFixed(1)}件`);
            
            // 2.2 重複チェック（事前確認）
            const uniqueIds = new Set(dbTweets.map(t => t.id));
            const duplicateCount = dbTweets.length - uniqueIds.size;
            if (duplicateCount > 0) {
                console.log(`  ⚠️  DB内重複発見: ${duplicateCount}件の重複があります`);
            }
            
            // 2.3 時間別分布を確認
            const hourlyDistribution = {};
            dbTweets.forEach(tweet => {
                const hour = new Date(tweet.createdAt).getHours();
                hourlyDistribution[hour] = (hourlyDistribution[hour] || 0) + 1;
            });
            const topHours = Object.entries(hourlyDistribution)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 3);
            console.log(`  📊 時間別分布 (上位3時間):`);
            topHours.forEach(([hour, count]) => {
                console.log(`     - ${hour}時台: ${count}件`);
            });
            
            // 3. TwitterリストIDを取得
            const twitterListId = await this.getTwitterListId(taskData.config?.relatedTableId);
            if (!twitterListId) {
                console.log('  ❌ TwitterリストIDが見つかりません');
                this.results.tasks.push(taskResult);
                return;
            }
            
            // 4. APIから同期間のツイート取得
            const apiTweets = await this.getApiTweets(twitterListId, timeRange);
            taskResult.apiTweets = apiTweets;
            this.results.summary.totalApiTweets += apiTweets.length;
            
            console.log(`  ✅ API取得ツイート: ${apiTweets.length}件`);
            
            // 5. 比較分析
            const comparison = this.compareTweets(dbTweets, apiTweets);
            taskResult.missing = comparison.missing;
            taskResult.duplicates = comparison.duplicates;
            
            this.results.summary.missingTweets += comparison.missing.length;
            this.results.summary.duplicateTweets += comparison.duplicates.length;
            
            console.log(`  📊 比較結果:`);
            console.log(`     - 欠落ツイート: ${comparison.missing.length}件`);
            console.log(`     - 重複ツイート: ${comparison.duplicates.length}件`);
            
            // 詳細分析
            console.log(`  🔍 詳細分析:`);
            console.log(`     - DB内ユニークID数: ${new Set(dbTweets.map(t => t.id)).size}件`);
            console.log(`     - API内ユニークID数: ${new Set(apiTweets.map(t => t.id)).size}件`);
            console.log(`     - 共通ID数: ${apiTweets.filter(t => new Set(dbTweets.map(d => d.id)).has(t.id)).length}件`);
            
            if (comparison.missing.length > 0) {
                console.log(`  ⚠️  欠落ツイート例:`);
                comparison.missing.slice(0, 3).forEach(tweet => {
                    console.log(`     - ID: ${tweet.id} (${new Date(tweet.createdAt).toLocaleString('ja-JP')})`);
                    console.log(`       "@${tweet.authorName}: ${tweet.text.substring(0, 50)}..."`);
                });
            }
            
            if (comparison.duplicates.length > 0) {
                console.log(`  ⚠️  重複ツイート例:`);
                comparison.duplicates.slice(0, 3).forEach(dup => {
                    console.log(`     - ID: ${dup.tweetId} (${dup.count}回重複)`);
                });
            }
            
        } catch (error) {
            console.error(`  ❌ エラー: ${error.message}`);
            taskResult.error = error.message;
        }
        
        this.results.tasks.push(taskResult);
    }
    
    async getDbTweets(taskData) {
        const tweets = [];
        // インデックス不要のシンプルなクエリに変更
        const tweetsSnapshot = await getDocs(
            query(collection(db, 'collected_tweets'),
                  where('taskId', '==', taskData.taskId))
        );
        
        tweetsSnapshot.forEach(doc => {
            const data = doc.data();
            tweets.push({
                id: data.tweetId,
                text: data.text,
                createdAt: data.createdAt,
                authorName: data.authorName
            });
        });
        
        return tweets;
    }
    
    getTimeRange(tweets) {
        const timestamps = tweets.map(t => new Date(t.createdAt).getTime());
        return {
            earliest: new Date(Math.min(...timestamps)).toISOString(),
            latest: new Date(Math.max(...timestamps)).toISOString()
        };
    }
    
    async getTwitterListId(listId) {
        if (!listId) return null;
        
        const listDoc = await getDocs(
            query(collection(db, 'twitter_lists'),
                  where('listId', '==', listId),
                  limit(1))
        );
        
        if (listDoc.empty) return null;
        return listDoc.docs[0].data().twitterListId;
    }
    
    async getApiTweets(twitterListId, timeRange) {
        const tweets = [];
        let cursor = null;
        let hasMore = true;
        let pageCount = 0;
        const MAX_PAGES = 5; // テスト用に5ページに制限
        
        console.log(`  🔄 APIからツイート取得中...`);
        console.log(`     - リストID: ${twitterListId}`);
        console.log(`     - 期間: ${new Date(timeRange.earliest).toLocaleString('ja-JP')} 〜 ${new Date(timeRange.latest).toLocaleString('ja-JP')}`);
        
        // 最初は時間範囲なしで最新ツイートを取得（TwitterAPI.ioの仕様確認）
        while (hasMore && pageCount < MAX_PAGES) {
            try {
                pageCount++;
                const params = {
                    listId: twitterListId, // TwitterAPI.ioの正しいパラメータ名
                };
                
                if (cursor) params.cursor = cursor;
                
                // 詳細ログは10ページごとのみ
                if (pageCount % 10 === 1) {
                    console.log(`     - ページ ${pageCount}/${MAX_PAGES}: params =`, JSON.stringify(params));
                }
                
                const response = await axios.get(`${this.API_BASE_URL}/twitter/list/tweets`, {
                    headers: {
                        'x-api-key': this.TWITTER_API_KEY
                    },
                    params: params
                });
                
                const data = response.data;
                
                // TwitterAPI.ioの実際の構造に対応
                if (data.tweets && Array.isArray(data.tweets)) {
                    if (pageCount % 10 === 1) {
                        console.log(`     - 取得ツイート数: ${data.tweets.length}件`);
                    }
                    
                    data.tweets.forEach(tweet => {
                        // より包括的なフィールド対応
                        const tweetData = {
                            id: tweet.id || tweet.tweet_id || tweet.id_str,
                            text: tweet.text || tweet.full_text || tweet.content,
                            createdAt: tweet.created_at || tweet.createdAt || tweet.published_at,
                            authorName: tweet.user?.username || tweet.user?.screen_name || 
                                      tweet.author?.username || tweet.author?.screen_name || 
                                      tweet.username || 'unknown'
                        };
                        
                        // 時間範囲フィルタリング（クライアントサイドで実行）
                        if (tweetData.createdAt) {
                            const tweetTime = new Date(tweetData.createdAt);
                            const rangeStart = new Date(timeRange.earliest);
                            const rangeEnd = new Date(timeRange.latest);
                            
                            if (tweetTime >= rangeStart && tweetTime <= rangeEnd) {
                                tweets.push(tweetData);
                            }
                        } else {
                            // 時刻不明の場合は含める
                            tweets.push(tweetData);
                        }
                    });
                } else {
                    console.log(`     - データなし: ${JSON.stringify(data)}`);
                }
                
                // カーソル確認
                cursor = data.next_cursor || data.cursor || data.next_token;
                hasMore = !!cursor && data.tweets?.length > 0;
                
                if (pageCount % 10 === 1) {
                    console.log(`     - hasMore: ${hasMore}`);
                }
                
                // Rate limit対策
                if (hasMore) {
                    // 進捗表示を効率化（10ページごとに詳細表示）
                    if (pageCount % 10 === 0) {
                        console.log(`     - 進捗: ${pageCount}ページ完了、累計${tweets.length}件取得`);
                    }
                    await new Promise(resolve => setTimeout(resolve, 1000)); // 1秒に短縮
                }
                
            } catch (error) {
                console.error(`     ❌ API取得エラー (ページ ${pageCount}): ${error.message}`);
                if (error.response) {
                    console.error(`     - ステータス: ${error.response.status}`);
                    console.error(`     - レスポンス: ${JSON.stringify(error.response.data)}`);
                }
                break;
            }
        }
        
        console.log(`  ✅ 最終結果: ${tweets.length}件のツイートを時間範囲内で取得`);
        return tweets;
    }
    
    compareTweets(dbTweets, apiTweets) {
        const dbIds = new Set(dbTweets.map(t => t.id));
        
        // APIにあってDBにないツイート（欠落）
        const missing = apiTweets.filter(t => !dbIds.has(t.id));
        
        // 重複チェック
        const duplicates = [];
        const idCounts = {};
        dbTweets.forEach(t => {
            idCounts[t.id] = (idCounts[t.id] || 0) + 1;
        });
        
        Object.entries(idCounts).forEach(([id, count]) => {
            if (count > 1) {
                duplicates.push({
                    tweetId: id,
                    count: count
                });
            }
        });
        
        return { missing, duplicates };
    }
    
    generateReport() {
        console.log('\n' + '='.repeat(80));
        console.log('📊 整合性チェックレポート');
        console.log('='.repeat(80));
        console.log(`実行日時: ${this.results.checkDate}`);
        console.log(`\n【サマリー】`);
        console.log(`- チェックしたタスク数: ${this.results.summary.totalTasks}`);
        console.log(`- DB保存済みツイート総数: ${this.results.summary.totalDbTweets}`);
        console.log(`- API取得ツイート総数: ${this.results.summary.totalApiTweets}`);
        console.log(`- 欠落ツイート総数: ${this.results.summary.missingTweets}`);
        console.log(`- 重複ツイート総数: ${this.results.summary.duplicateTweets}`);
        
        if (this.results.summary.errors.length > 0) {
            console.log(`\n【エラー】`);
            this.results.summary.errors.forEach(error => {
                console.log(`- ${error}`);
            });
        }
        
        console.log(`\n【詳細】`);
        this.results.tasks.forEach(task => {
            console.log(`\n📌 ${task.taskName}`);
            console.log(`   タスクID: ${task.taskId}`);
            
            if (task.error) {
                console.log(`   ❌ エラー: ${task.error}`);
                return;
            }
            
            console.log(`   DB保存数: ${task.dbTweets.length}件`);
            console.log(`   API取得数: ${task.apiTweets.length}件`);
            
            if (task.missing.length > 0) {
                console.log(`   ⚠️  欠落ツイート: ${task.missing.length}件`);
                task.missing.slice(0, 3).forEach(tweet => {
                    console.log(`      - ID: ${tweet.id} (@${tweet.authorName})`);
                    console.log(`        "${tweet.text.substring(0, 50)}..."`);
                });
                if (task.missing.length > 3) {
                    console.log(`      ... 他 ${task.missing.length - 3}件`);
                }
            }
            
            if (task.duplicates.length > 0) {
                console.log(`   ⚠️  重複ツイート: ${task.duplicates.length}件`);
                task.duplicates.slice(0, 3).forEach(dup => {
                    console.log(`      - ID: ${dup.tweetId} (${dup.count}回重複)`);
                });
            }
        });
        
        console.log('\n' + '='.repeat(80));
        
        // JSON形式でも保存（専用フォルダに）
        const fs = require('fs');
        const path = require('path');
        
        const reportsDir = './reports';
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportPath = path.join(reportsDir, `integrity-report-${timestamp}.json`);
        fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
        console.log(`\n📄 詳細レポートを保存しました: ${reportPath}`);
    }
}

// 実行
if (require.main === module) {
    const checker = new DatabaseIntegrityChecker();
    checker.checkAllTasks().then(() => {
        console.log('\n✅ チェック完了');
        process.exit(0);
    }).catch(error => {
        console.error('\n❌ エラー:', error);
        process.exit(1);
    });
}

module.exports = DatabaseIntegrityChecker;