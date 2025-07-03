# 手動分析機能実装ドキュメント

## 📋 概要

### 目的
リスト管理画面から即座にChatGPT分析を実行できる手動分析機能の実装

### 主要機能
- ワンクリックでの分析実行
- リアルタイムでの分析状況表示
- ChatGPTの完全な返信確認
- CSV形式での結果ダウンロード
- 分析履歴の管理

---

## 🏗️ アーキテクチャ設計

### データフロー
```
[ブラウザ] → [Vercel API] → [Railway Worker] → [ChatGPT API]
     ↓              ↓              ↓              ↓
[UI更新] ← [Firestore] ← [結果保存] ← [分析結果]
```

### コンポーネント構成
```
┌─────────────────────────────────────────────────────────┐
│ フロントエンド (list-manager.html)                      │
├─────────────────────────────────────────────────────────┤
│ ├─ 分析設定UI (テンプレート選択)                       │
│ ├─ 手動実行ボタン                                     │
│ ├─ 分析状況表示                                       │
│ └─ 結果表示 (analysis-results.html)                   │
└─────────────────────────────────────────────────────────┘
                           │
┌─────────────────────────────────────────────────────────┐
│ Vercel API (/api/analysis/execute/:listId)             │
├─────────────────────────────────────────────────────────┤
│ ├─ リクエスト検証                                     │
│ ├─ Railway Worker呼び出し                             │
│ └─ 即座レスポンス                                     │
└─────────────────────────────────────────────────────────┘
                           │
┌─────────────────────────────────────────────────────────┐
│ Railway Worker (/api/worker/execute)                   │
├─────────────────────────────────────────────────────────┤
│ ├─ TwitterWorker.processManualAnalysis()              │
│ ├─ ChatGPTAnalyzer.analyze()                          │
│ ├─ TemplateManager.get()                              │
│ └─ 結果保存 (ai_analysis コレクション)                │
└─────────────────────────────────────────────────────────┘
                           │
┌─────────────────────────────────────────────────────────┐
│ Firestore Database                                     │
├─────────────────────────────────────────────────────────┤
│ ├─ ai_analysis (分析結果)                             │
│ ├─ analysis_templates (テンプレート)                  │
│ ├─ twitter_lists (リスト設定)                        │
│ └─ collected_tweets (ツイートデータ)                  │
└─────────────────────────────────────────────────────────┘
```

---

## 🔧 実装詳細

### 1. フロントエンド実装

#### HTML構造 (list-manager.html)
```html
<div class="analysis-settings" id="analysisSettings-${list.id}">
    <h4>🤖 ChatGPT分析設定</h4>
    
    <!-- テンプレート選択 -->
    <div class="setting-group">
        <label>分析テンプレート:</label>
        <select id="templateSelect-${list.id}" class="template-select">
            <option value="">選択してください</option>
            <!-- 動的に生成 -->
        </select>
    </div>
    
    <!-- 手動実行ボタン -->
    <div class="setting-group">
        <button onclick="executeManualAnalysis('${list.id}')" 
                class="btn btn-ai" 
                id="manualAnalysisBtn-${list.id}">
            🤖 手動分析実行
        </button>
    </div>
    
    <!-- 分析状況表示 -->
    <div class="analysis-status" id="analysisStatus-${list.id}" style="display: none;">
        <div class="status-indicator">
            <span class="spinner"></span>
            <span id="statusText-${list.id}">分析を実行中...</span>
        </div>
    </div>
</div>
```

#### JavaScript実装 (list-manager.js)
```javascript
// 手動分析実行
async function executeManualAnalysis(listId) {
    const templateSelect = document.getElementById(`templateSelect-${listId}`);
    const templateId = templateSelect.value;
    
    if (!templateId) {
        showToast('テンプレートを選択してください', 'warning');
        return;
    }
    
    const btn = document.getElementById(`manualAnalysisBtn-${listId}`);
    const statusDiv = document.getElementById(`analysisStatus-${listId}`);
    const statusText = document.getElementById(`statusText-${listId}`);
    
    try {
        // UI状態変更
        btn.disabled = true;
        btn.textContent = '🔄 実行中...';
        statusDiv.style.display = 'block';
        statusText.textContent = '分析を開始しています...';
        
        // API呼び出し
        const response = await fetch(`/api/analysis/execute/${listId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                templateId: templateId
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            statusText.textContent = 'Railway Workerで分析中...';
            showToast('🤖 分析を開始しました。結果は1-2分後に表示されます。', 'success');
            
            // 30秒後にポーリング開始
            setTimeout(() => {
                pollAnalysisStatus(listId, result.jobId);
            }, 30000);
        } else {
            throw new Error(result.error || '分析の開始に失敗しました');
        }
        
    } catch (error) {
        console.error('Manual analysis error:', error);
        showToast(`❌ エラー: ${error.message}`, 'error');
        
        // UI状態リセット
        btn.disabled = false;
        btn.textContent = '🤖 手動分析実行';
        statusDiv.style.display = 'none';
    }
}

// 分析状況ポーリング
async function pollAnalysisStatus(listId, jobId) {
    const statusText = document.getElementById(`statusText-${listId}`);
    const statusDiv = document.getElementById(`analysisStatus-${listId}`);
    const btn = document.getElementById(`manualAnalysisBtn-${listId}`);
    
    try {
        // 分析結果をFirestoreから確認（最新の分析結果を取得）
        const recentAnalysis = await checkRecentAnalysis(listId);
        
        if (recentAnalysis && isRecent(recentAnalysis.createdAt)) {
            // 分析完了
            statusText.textContent = '✅ 分析が完了しました！';
            showToast('✅ AI分析が完了しました！結果ページで確認できます。', 'success');
            
            setTimeout(() => {
                statusDiv.style.display = 'none';
                btn.disabled = false;
                btn.textContent = '🤖 手動分析実行';
            }, 3000);
            
            // 分析結果ページへのリンク表示（オプション）
            showAnalysisResultLink(recentAnalysis.id);
        } else {
            // まだ処理中、再度ポーリング
            setTimeout(() => {
                pollAnalysisStatus(listId, jobId);
            }, 15000);
        }
        
    } catch (error) {
        console.error('Polling error:', error);
        statusText.textContent = '❌ 状況確認でエラーが発生しました';
    }
}
```

### 2. バックエンド実装

#### Vercel API (server.js)
```javascript
// 手動分析実行エンドポイント
app.post('/api/analysis/execute/:listId', async (req, res) => {
    try {
        const { listId } = req.params;
        const { templateId } = req.body;
        
        console.log(`🤖 Manual analysis request for list: ${listId}, template: ${templateId}`);
        
        if (!listId || !templateId) {
            return res.status(400).json({
                success: false,
                error: 'listId and templateId are required'
            });
        }
        
        // Railway Worker URL確認
        if (!process.env.RAILWAY_WORKER_URL || !process.env.WORKER_SECRET) {
            console.error('❌ Railway Worker configuration missing');
            return await executeLocalAnalysis(listId, templateId, res);
        }
        
        // Railway Workerにジョブ送信
        const jobId = `list-manual-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
        
        try {
            const workerResponse = await fetch(`${process.env.RAILWAY_WORKER_URL}/api/worker/execute`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.WORKER_SECRET}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    type: 'manual_analysis',
                    data: {
                        listId: listId,
                        templateId: templateId,
                        requestedBy: 'manual',
                        requestedAt: new Date().toISOString()
                    },
                    requestId: jobId
                }),
                signal: AbortSignal.timeout(10000) // 10秒タイムアウト
            });
            
            if (workerResponse.ok) {
                const workerResult = await workerResponse.json();
                console.log('✅ Railway worker accepted job:', workerResult);
                
                res.json({
                    success: true,
                    jobId: jobId,
                    message: 'Analysis job submitted to Railway Worker',
                    workerResponse: workerResult
                });
            } else {
                throw new Error(`Railway Worker error: ${workerResponse.status}`);
            }
            
        } catch (fetchError) {
            console.error('❌ Railway Worker request failed:', fetchError.message);
            // フォールバック実行
            return await executeLocalAnalysis(listId, templateId, res);
        }
        
    } catch (error) {
        console.error('❌ Manual analysis execution error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
});
```

#### Railway Worker実装 (TwitterWorker.js)
```javascript
// 手動分析処理
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
            processingTime: Date.now() - startTime  // ミリ秒単位で保存
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
```

### 3. ChatGPTAnalyzer実装

#### プロンプト処理の修正
```javascript
// プロンプト生成（スペースありなしの両方に対応）
const prompt = template.prompt
    .replace(/\{\{\s*tweets\s*\}\}/g, tweetTexts)
    .replace(/\{\{\s*tweet_count\s*\}\}/g, tweets.length.toString());
```

#### 分析レコード更新
```javascript
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
```

---

## 💾 データベース設計

### ai_analysis コレクション
```javascript
{
  // 基本情報
  analysisId: "analysis-1751509364035-kw3hdg5q",
  status: "completed",
  sourceType: "twitter_list",
  sourceId: "list-1751126677056-ifnqreddr",
  templateId: "ycStGpqhEPsBJaIr2xJr",
  
  // 表示用フィールド（手動分析で追加）
  listName: "Fixed Database Test List",
  templateName: "test",
  tweetCount: 5,
  tokensUsed: 778,
  summary: "分析結果の要約...",
  processingTime: 15234,  // ミリ秒
  
  // 分析結果詳細
  input: {
    tweetCount: 5,
    tweetIds: ["1745678901234567890", ...],
    dateRange: {
      from: "Tue Jul 01 23:08:13 +0000 2025",
      to: "Tue Jul 01 23:12:51 +0000 2025"
    }
  },
  
  output: {
    rawResponse: "ChatGPTからの完全な返信...",
    parsedData: { /* パースされたデータ */ },
    tokensUsed: 778,
    model: "gpt-4-0613",
    temperature: 0.7
  },
  
  // メタデータ
  csvFilePath: "./reports/2025/07/analysis-xxx.csv",
  createdAt: Timestamp,
  completedAt: Timestamp,
  notifications: {
    discord: { sent: false }
  }
}
```

---

## 🔧 バグ修正履歴

### 1. 分析結果表示問題
**問題**: "Unknown List", "Unknown Template", 0値の表示
**原因**: TwitterリストIDとFirestoreドキュメントIDの不一致
**解決策**: 
- API処理でTwitterリストIDからFirestoreドキュメントを検索
- 手動分析後に表示用フィールドを更新

### 2. テンプレートプレースホルダー問題
**問題**: `{{ tweets }}`（スペースあり）が置換されない
**原因**: コードでは`{{tweets}}`（スペースなし）を検索
**解決策**: 正規表現でスペースの有無に対応

### 3. 処理時間表示問題
**問題**: 処理時間が「0s」と表示
**原因**: 秒単位で保存、ミリ秒単位で期待
**解決策**: ミリ秒単位で統一

---

## 📊 パフォーマンス考慮

### レスポンス時間最適化
- Vercel APIは即座にレスポンス（10秒以内）
- 重い処理はRailway Workerにオフロード
- フロントエンドはポーリングで状況確認

### リソース使用量
- 1回の分析: 約500-1000トークン
- 処理時間: 10-30秒
- メモリ使用量: 50-100MB

### エラーハンドリング
- Railway Worker接続失敗時のローカル実行フォールバック
- タイムアウト設定（Vercel: 10秒、Railway: 無制限）
- ユーザーフレンドリーなエラーメッセージ

---

## 🚀 今後の拡張予定

### 追加機能候補
1. **バッチ分析**: 複数リストの一括分析
2. **スケジュール分析**: 定期的な自動分析
3. **分析結果比較**: 時系列での変化追跡
4. **カスタムプロンプト**: ユーザー定義分析
5. **高度なフィルタリング**: 条件指定での分析

### UI/UX改善
1. **進捗表示の詳細化**: 処理ステップの可視化
2. **結果プレビュー**: 完了前の部分結果表示
3. **分析設定の保存**: よく使う設定の記憶
4. **通知機能**: 完了時のブラウザ通知

---

*このドキュメントは実装の完成を記録し、今後の保守・拡張の参考資料として作成されました。*