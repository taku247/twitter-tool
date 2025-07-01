const { getFirestore, collection, addDoc, getDoc, getDocs, updateDoc, deleteDoc, doc, query, where, Timestamp } = require('firebase/firestore');

/**
 * ChatGPT分析テンプレート管理クラス
 */
class AnalysisTemplateManager {
    constructor(db) {
        this.db = db;
        this.collectionName = 'analysis_templates';
    }

    /**
     * デフォルトテンプレートの作成
     */
    async createDefaultTemplates() {
        const defaultTemplates = [
            {
                name: "感情分析",
                category: "sentiment",
                description: "ツイートの感情傾向を分析します",
                prompt: `以下のTwitterリストから収集したツイートを分析して、感情分析を行ってください。

ツイートデータ:
{{tweets}}

以下の形式で回答してください：

## 全体的な感情傾向
[ポジティブ/ネガティブ/ニュートラル/混在 から選択し、その理由を説明]

## 感情の内訳
- ポジティブ: X%
- ネガティブ: Y%
- ニュートラル: Z%

## 主要なトピック
[最大5つまで、頻出する話題を箇条書き]

## 特に注目すべきツイート
[感情的に特徴的なツイートを2-3個、IDと理由付きで記載]

## 要約
[200文字以内で全体の感情傾向と主要トピックを要約]`,
                maxTokens: 2000,
                temperature: 0.7,
                active: true
            },
            {
                name: "トレンド分析",
                category: "trend",
                description: "話題のトピックやトレンドを分析します",
                prompt: `以下のTwitterリストから収集したツイートを分析して、トレンド分析を行ってください。

ツイートデータ:
{{tweets}}

以下の形式で回答してください：

## 主要トレンド
[最も話題になっているトピックを3-5個、重要度順にリスト]

## トレンドの詳細分析
[各トレンドについて、なぜ話題になっているか、どのような文脈で議論されているかを説明]

## 時系列変化
[もし時系列データがある場合、トレンドの変化を記載]

## インフルエンサー
[特に影響力のあるアカウントや、多くリツイートされているツイートを特定]

## 今後の予測
[現在のトレンドから予測される今後の動向]`,
                maxTokens: 2500,
                temperature: 0.8,
                active: true
            },
            {
                name: "日次要約",
                category: "summary",
                description: "1日分のツイートを要約します",
                prompt: `以下のTwitterリストから収集した本日のツイートを要約してください。

ツイートデータ:
{{tweets}}

以下の形式で回答してください：

## 本日のハイライト
[最も重要な出来事や話題を3つまで]

## カテゴリ別要約
### ニュース・情報
[関連するツイートの要約]

### 意見・議論
[主要な意見や議論の要約]

### その他
[上記に分類されない重要な内容]

## 統計情報
- 総ツイート数: {{tweet_count}}
- 最もアクティブな時間帯: [時間帯]
- 最も言及されたキーワード: [上位5個]

## 総括
[150文字以内で本日の全体的な傾向を要約]`,
                maxTokens: 2000,
                temperature: 0.6,
                active: true
            }
        ];

        const results = [];
        for (const template of defaultTemplates) {
            try {
                const docRef = await this.create(template);
                console.log(`✅ Created default template: ${template.name} (${docRef.id})`);
                results.push({ success: true, name: template.name, id: docRef.id });
            } catch (error) {
                console.error(`❌ Failed to create template: ${template.name}`, error);
                results.push({ success: false, name: template.name, error: error.message });
            }
        }

        return results;
    }

    /**
     * テンプレート作成
     */
    async create(templateData) {
        const template = {
            ...templateData,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
            usage: {
                totalRuns: 0,
                lastUsed: null
            }
        };

        const docRef = await addDoc(collection(this.db, this.collectionName), template);
        return docRef;
    }

    /**
     * テンプレート取得
     */
    async get(templateId) {
        const docRef = doc(this.db, this.collectionName, templateId);
        const docSnap = await getDoc(docRef);
        
        if (!docSnap.exists()) {
            throw new Error(`Template not found: ${templateId}`);
        }
        
        return {
            id: docSnap.id,
            ...docSnap.data()
        };
    }

    /**
     * テンプレート一覧取得
     */
    async list(filters = {}) {
        let q = collection(this.db, this.collectionName);
        
        if (filters.category) {
            q = query(q, where('category', '==', filters.category));
        }
        
        if (filters.active !== undefined) {
            q = query(q, where('active', '==', filters.active));
        }
        
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    }

    /**
     * テンプレート更新
     */
    async update(templateId, updates) {
        const docRef = doc(this.db, this.collectionName, templateId);
        
        await updateDoc(docRef, {
            ...updates,
            updatedAt: Timestamp.now()
        });
        
        return await this.get(templateId);
    }

    /**
     * テンプレート削除
     */
    async delete(templateId) {
        const docRef = doc(this.db, this.collectionName, templateId);
        await deleteDoc(docRef);
        return { success: true, templateId };
    }

    /**
     * 使用回数を増やす
     */
    async incrementUsage(templateId) {
        const template = await this.get(templateId);
        
        await this.update(templateId, {
            usage: {
                totalRuns: (template.usage?.totalRuns || 0) + 1,
                lastUsed: Timestamp.now()
            }
        });
    }

    /**
     * テンプレートの検証
     */
    validateTemplate(template) {
        const errors = [];
        
        if (!template.name || template.name.trim().length === 0) {
            errors.push('Template name is required');
        }
        
        if (!template.category || !['sentiment', 'trend', 'summary', 'custom'].includes(template.category)) {
            errors.push('Valid category is required (sentiment, trend, summary, custom)');
        }
        
        if (!template.prompt || template.prompt.trim().length === 0) {
            errors.push('Prompt is required');
        }
        
        if (!template.prompt?.includes('{{tweets}}')) {
            errors.push('Prompt must include {{tweets}} placeholder');
        }
        
        if (template.maxTokens && (template.maxTokens < 100 || template.maxTokens > 4000)) {
            errors.push('maxTokens must be between 100 and 4000');
        }
        
        if (template.temperature && (template.temperature < 0 || template.temperature > 1)) {
            errors.push('temperature must be between 0 and 1');
        }
        
        return errors;
    }
}

module.exports = AnalysisTemplateManager;