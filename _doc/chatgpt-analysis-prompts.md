# ChatGPT分析プロンプト設計書

## 📝 プロンプト設計方針

### 基本原則
1. **簡潔性**: 結果は読みやすく、要点を絞る
2. **一貫性**: 分析タイプごとに統一されたフォーマット
3. **実用性**: ビジネス価値のある洞察を提供
4. **日本語対応**: 日本語ツイートに最適化
5. **構造化**: パースしやすい構造化された出力

### 出力形式
- **テキスト形式**: Markdown形式で人間が読みやすく
- **JSON形式**: プログラム処理用の構造化データ
- **ハイブリッド**: Markdown + JSON埋め込み

---

## 🎯 分析タイプ別プロンプト

### 1. daily_summary (日次要約)

#### 目的
1日分のツイートから主要なトピックと傾向を抽出し、簡潔に要約する

#### プロンプト設計
```javascript
const DAILY_SUMMARY_PROMPT = {
    system: `あなたはTwitterデータの分析専門家です。与えられたツイートから重要な情報を抽出し、ビジネスに役立つ洞察を提供してください。
    
出力は必ず以下の構造に従ってください：
- 簡潔で読みやすい日本語
- 具体的な事例の引用
- 客観的で偏りのない分析`,

    template: `以下の{count}件のツイートから、本日の主要トピックと重要な傾向を分析してください。

## 分析対象
- 期間: {dateRange}
- ツイート数: {count}件
- リスト: {listName}

## 出力形式
### 📊 主要トピック（上位3つ）
1. **[トピック名]**: [2-3行の説明]
2. **[トピック名]**: [2-3行の説明]  
3. **[トピック名]**: [2-3行の説明]

### 🔥 注目ツイート
> [最も重要/影響力のあるツイートを1つ引用]
> 投稿者: @[username]

### 📈 傾向分析
- **全体の傾向**: [ポジティブ/ニュートラル/ネガティブな傾向]
- **議論の活発度**: [高/中/低]
- **新しい話題**: [新規に出現したトピックの有無]

### 💡 注目すべき点
[ビジネスや技術トレンドとして重要な洞察を1-2行]

---
## ツイートデータ
{tweets}`
};
```

#### 出力例
```markdown
### 📊 主要トピック（上位3つ）
1. **AIガバナンス**: 企業でのAI導入時の倫理指針やガバナンス体制に関する議論が活発化。特に金融業界での事例が多数共有された。
2. **LLM最適化**: 大規模言語モデルの推論コスト削減手法について、量子化やプルーニング技術の実装事例が注目を集めた。
3. **オープンソースAI**: Meta社のLlama3系モデルのファインチューニング事例と、商用利用時の注意点について活発な意見交換。

### 🔥 注目ツイート
> "我々の金融機関では、AI意思決定の説明可能性を重視し、全てのモデル判定に対してリスクスコアと根拠を併記する仕組みを導入しました。規制対応だけでなく、顧客信頼の向上にもつながっています。"
> 投稿者: @fintech_expert

### 📈 傾向分析
- **全体の傾向**: ポジティブ（技術進歩への期待感が強い）
- **議論の活発度**: 高（リプライやRTが平均の1.5倍）
- **新しい話題**: AI規制法案の具体的な実装ガイドラインについて

### 💡 注目すべき点
企業でのAI導入が「実験段階」から「本格運用・ガバナンス段階」に移行している。コンプライアンス対応がビジネス要件として明確に定義されつつある。
```

### 2. sentiment_trend (感情分析)

#### 目的
ツイートの感情的傾向を定量分析し、ポジティブ/ニュートラル/ネガティブの分布と主要な感情を特定

#### プロンプト設計
```javascript
const SENTIMENT_TREND_PROMPT = {
    system: `あなたは感情分析の専門家です。日本語ツイートから正確な感情を読み取り、定量的な分析を行ってください。
    
分析の注意点：
- 皮肉や暗示的な表現も考慮
- 文脈を重視した感情判定
- 日本語特有の表現（敬語、曖昧表現）への配慮`,

    template: `以下の{count}件のツイートの感情分析を行い、結果をJSON形式で出力してください。

## 分析要件
- 各ツイートを個別に感情分析
- 全体的な感情分布を算出
- 主要な感情キーワードを抽出
- 感情変化の傾向を分析

## 出力形式
感情分析結果を以下のJSON形式で出力してください：

\`\`\`json
{
  "sentiment_distribution": {
    "positive": 0.0,
    "neutral": 0.0,
    "negative": 0.0
  },
  "key_emotions": [
    "emotion1", "emotion2", "emotion3"
  ],
  "emotional_keywords": {
    "positive": ["キーワード1", "キーワード2"],
    "negative": ["キーワード1", "キーワード2"]
  },
  "sentiment_summary": "全体的な感情傾向の説明",
  "notable_patterns": [
    "感情パターン1の説明",
    "感情パターン2の説明"
  ]
}
\`\`\`

---
## ツイートデータ
{tweets}`
};
```

#### 出力例
```json
{
  "sentiment_distribution": {
    "positive": 0.65,
    "neutral": 0.25,
    "negative": 0.10
  },
  "key_emotions": [
    "期待感", "興奮", "不安"
  ],
  "emotional_keywords": {
    "positive": ["素晴らしい", "期待", "革新的", "効率化"],
    "negative": ["心配", "リスク", "課題", "懸念"]
  },
  "sentiment_summary": "全体的にポジティブな傾向。AI技術への期待感が強い一方で、導入時のリスクに対する慎重な意見も見られる。",
  "notable_patterns": [
    "技術系の投稿者ほどポジティブな傾向",
    "規制や倫理に関する話題ではニュートラル〜ネガティブ",
    "具体的な成果事例の共有時に強いポジティブ反応"
  ]
}
```

### 3. topic_analysis (トピック分析)

#### 目的
ツイートから重要なテクノロジートレンドを抽出し、重要度とビジネスインパクトでランキング

#### プロンプト設計
```javascript
const TOPIC_ANALYSIS_PROMPT = {
    system: `あなたはテクノロジートレンドの分析専門家です。ツイートデータから重要な技術トレンドを特定し、ビジネスへの影響度を評価してください。
    
分析観点：
- 技術の成熟度
- 市場への影響度
- 議論の活発さ
- 実用化の可能性`,

    template: `以下の{count}件のツイートからテクノロジートレンドを分析し、重要度順にランキングしてください。

## 分析対象
- 期間: {dateRange}
- ツイート数: {count}件
- 分析観点: 技術トレンド、市場影響、実用性

## 出力形式
### 🏆 重要トレンドランキング

#### 1位: [技術/トレンド名]
- **言及数**: X件
- **重要度**: ⭐⭐⭐⭐⭐
- **ビジネスインパクト**: [高/中/低]
- **概要**: [2-3行の説明]
- **代表的な議論**: "[具体的な投稿の引用]"

#### 2位: [技術/トレンド名]
- **言及数**: X件  
- **重要度**: ⭐⭐⭐⭐
- **ビジネスインパクト**: [高/中/低]
- **概要**: [2-3行の説明]
- **代表的な議論**: "[具体的な投稿の引用]"

#### 3位: [技術/トレンド名]
- **言及数**: X件
- **重要度**: ⭐⭐⭐
- **ビジネスインパクト**: [高/中/低] 
- **概要**: [2-3行の説明]
- **代表的な議論**: "[具体的な投稿の引用]"

### 📊 トレンド相関分析
- **関連性の高い技術組み合わせ**: [技術A × 技術B]
- **新興トレンド**: [初出現または急上昇した話題]
- **衰退トレンド**: [言及が減少した話題]

### 🔮 今後の注目点
[今後1-3ヶ月で重要になりそうな技術動向]

---
## ツイートデータ  
{tweets}`
};
```

### 4. user_insights (ユーザー分析)

#### 目的
影響力のあるユーザーや重要な発言者を特定し、コミュニティ内での話題形成パターンを分析

#### プロンプト設計
```javascript
const USER_INSIGHTS_PROMPT = {
    system: `あなたはソーシャルネットワーク分析の専門家です。ツイートデータから影響力のあるユーザーと重要な発言を特定してください。
    
分析観点：
- エンゲージメント（RT、いいね、リプライ）
- 発言の専門性・信頼性
- コミュニティへの影響力
- 情報の初出性`,

    template: `以下の{count}件のツイートから、影響力のあるユーザーと重要な発言を分析してください。

## 分析対象
- 期間: {dateRange}
- ユーザー数: {userCount}名
- ツイート数: {count}件

## 出力形式
### 👑 影響力のあるユーザー（上位5名）

#### 1. @[username]
- **専門分野**: [分野名]
- **影響力スコア**: [高/中/低]
- **投稿特徴**: [投稿内容の特徴]
- **代表的発言**: "[重要な投稿の引用]"
- **エンゲージメント**: [RTやいいねの傾向]

### 💎 注目すべき発言

#### 最も拡散された投稿
> "[投稿内容]"
> 投稿者: @[username] | RT: X回 | いいね: X回

#### 最も議論を呼んだ投稿  
> "[投稿内容]"
> 投稿者: @[username] | リプライ: X回

#### 最も専門性の高い投稿
> "[投稿内容]"  
> 投稿者: @[username] | 専門性指標: [根拠]

### 🌊 話題形成パターン
- **情報発信源**: [どのようなユーザーが新しい話題を発信するか]
- **拡散パターン**: [どのように話題が広がるか]
- **議論の深度**: [表面的 vs 専門的な議論の割合]

### 🎯 コミュニティ特性
[このリストのコミュニティの特徴と傾向]

---
## ツイートデータ
{tweets}`
};
```

### 5. keyword_extraction (キーワード抽出)

#### 目的
ツイートから重要なキーワードを抽出し、頻出度と重要度で分析

#### プロンプト設計
```javascript
const KEYWORD_EXTRACTION_PROMPT = {
    system: `あなたはテキストマイニングの専門家です。日本語ツイートから意味のあるキーワードを抽出し、その重要度を評価してください。
    
抽出基準：
- 技術用語・専門用語を優先
- 固有名詞（製品名、企業名、人名）
- トレンドキーワード
- 感情を表すキーワード`,

    template: `以下の{count}件のツイートから重要なキーワードを抽出し、分析してください。

## 分析対象
- 期間: {dateRange}
- ツイート数: {count}件
- 対象言語: 日本語

## 出力形式
### 🔥 重要キーワードランキング

#### 技術・製品関連（上位10位）
| 順位 | キーワード | 出現数 | 重要度 | カテゴリ |
|------|------------|--------|--------|----------|
| 1 | [キーワード1] | X回 | ⭐⭐⭐⭐⭐ | [技術/製品/サービス] |
| 2 | [キーワード2] | X回 | ⭐⭐⭐⭐ | [技術/製品/サービス] |

#### 企業・組織関連（上位5位）
| 順位 | キーワード | 出現数 | 関連トピック |
|------|------------|--------|--------------|
| 1 | [企業名1] | X回 | [関連する技術/発表] |

#### 新出現キーワード
- **[キーワード]**: [初出現の文脈と重要性]
- **[キーワード]**: [初出現の文脈と重要性]

### 📊 キーワード関連性分析
#### よく一緒に使われるキーワード組み合わせ
- **[キーワードA] × [キーワードB]**: [関連性の説明]
- **[キーワードC] × [キーワードD]**: [関連性の説明]

### 🔄 時系列変化
- **上昇トレンド**: [急激に言及が増えたキーワード]
- **下降トレンド**: [言及が減ったキーワード]
- **安定トレンド**: [継続的に言及されているキーワード]

### 💡 洞察
[キーワード分析から読み取れる業界動向や注目ポイント]

---
## ツイートデータ
{tweets}`
};
```

---

## 🛠️ プロンプト実装設計

### プロンプトテンプレートシステム
```javascript
class PromptTemplateEngine {
    constructor() {
        this.templates = {
            daily_summary: DAILY_SUMMARY_PROMPT,
            sentiment_trend: SENTIMENT_TREND_PROMPT,
            topic_analysis: TOPIC_ANALYSIS_PROMPT,
            user_insights: USER_INSIGHTS_PROMPT,
            keyword_extraction: KEYWORD_EXTRACTION_PROMPT
        };
    }
    
    generatePrompt(analysisType, data) {
        const template = this.templates[analysisType];
        if (!template) {
            throw new Error(`Unknown analysis type: ${analysisType}`);
        }
        
        return {
            system: template.system,
            user: this.interpolateTemplate(template.template, data)
        };
    }
    
    interpolateTemplate(template, data) {
        const { tweets, count, dateRange, listName, userCount } = data;
        
        // ツイートデータの整形
        const formattedTweets = tweets.map((tweet, index) => 
            `${index + 1}. @${tweet.authorName}: ${tweet.text}`
        ).join('\n');
        
        // テンプレート変数の置換
        return template
            .replace(/{count}/g, count)
            .replace(/{dateRange}/g, dateRange)
            .replace(/{listName}/g, listName || '不明')
            .replace(/{userCount}/g, userCount || tweets.length)
            .replace(/{tweets}/g, formattedTweets);
    }
}
```

### ChatGPT API呼び出し設定
```javascript
class ChatGPTAnalyzer {
    constructor() {
        this.client = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
        this.promptEngine = new PromptTemplateEngine();
    }
    
    async analyze(analysisType, tweets, options = {}) {
        const promptData = {
            tweets: tweets,
            count: tweets.length,
            dateRange: this.formatDateRange(tweets),
            listName: options.listName,
            userCount: new Set(tweets.map(t => t.authorName)).size
        };
        
        const prompt = this.promptEngine.generatePrompt(analysisType, promptData);
        
        const config = this.getModelConfig(analysisType);
        
        const response = await this.client.chat.completions.create({
            model: config.model,
            messages: [
                { role: "system", content: prompt.system },
                { role: "user", content: prompt.user }
            ],
            max_tokens: config.maxTokens,
            temperature: config.temperature
        });
        
        return {
            analysisType: analysisType,
            result: response.choices[0].message.content,
            tokensUsed: response.usage.total_tokens,
            model: config.model,
            processingTime: Date.now() - startTime
        };
    }
    
    getModelConfig(analysisType) {
        const configs = {
            daily_summary: {
                model: "gpt-4",
                maxTokens: 1000,
                temperature: 0.3
            },
            sentiment_trend: {
                model: "gpt-4",
                maxTokens: 800,
                temperature: 0.1
            },
            topic_analysis: {
                model: "gpt-4",
                maxTokens: 1200,
                temperature: 0.2
            },
            user_insights: {
                model: "gpt-4",
                maxTokens: 1000,
                temperature: 0.3
            },
            keyword_extraction: {
                model: "gpt-4",
                maxTokens: 800,
                temperature: 0.2
            }
        };
        
        return configs[analysisType] || configs.daily_summary;
    }
    
    formatDateRange(tweets) {
        if (tweets.length === 0) return '不明';
        
        const dates = tweets.map(t => new Date(t.createdAt)).sort();
        const start = dates[0].toLocaleDateString('ja-JP');
        const end = dates[dates.length - 1].toLocaleDateString('ja-JP');
        
        return start === end ? start : `${start}〜${end}`;
    }
}
```

---

## 📊 結果パース・保存設計

### 分析結果パーサー
```javascript
class AnalysisResultParser {
    static parseResult(analysisType, rawResult) {
        switch (analysisType) {
            case 'sentiment_trend':
                return this.parseSentimentResult(rawResult);
            case 'daily_summary':
                return this.parseTextResult(rawResult);
            case 'topic_analysis':
                return this.parseTopicResult(rawResult);
            default:
                return { type: 'text', content: rawResult };
        }
    }
    
    static parseSentimentResult(rawResult) {
        try {
            // JSON部分を抽出
            const jsonMatch = rawResult.match(/```json\n([\s\S]*?)\n```/);
            if (jsonMatch) {
                const jsonData = JSON.parse(jsonMatch[1]);
                return {
                    type: 'json',
                    content: rawResult,
                    structured: jsonData
                };
            }
        } catch (error) {
            console.warn('JSON parsing failed, treating as text:', error);
        }
        
        return { type: 'text', content: rawResult };
    }
    
    static parseTextResult(rawResult) {
        // Markdown構造の抽出
        const sections = this.extractMarkdownSections(rawResult);
        return {
            type: 'markdown',
            content: rawResult,
            sections: sections
        };
    }
    
    static extractMarkdownSections(text) {
        const sections = {};
        const lines = text.split('\n');
        let currentSection = null;
        let currentContent = [];
        
        lines.forEach(line => {
            if (line.startsWith('###')) {
                if (currentSection) {
                    sections[currentSection] = currentContent.join('\n');
                }
                currentSection = line.replace('### ', '').replace(/[🔥📊💡📈]/g, '').trim();
                currentContent = [];
            } else {
                currentContent.push(line);
            }
        });
        
        if (currentSection) {
            sections[currentSection] = currentContent.join('\n');
        }
        
        return sections;
    }
}
```

---

## 🎯 プロンプト品質向上

### A/Bテスト設計
```javascript
class PromptABTester {
    constructor() {
        this.variants = {
            daily_summary: {
                'v1': DAILY_SUMMARY_PROMPT,
                'v2': DAILY_SUMMARY_PROMPT_V2,
                'v3': DAILY_SUMMARY_PROMPT_V3
            }
        };
        this.currentVariants = {};
    }
    
    async testVariant(analysisType, tweets, variantName) {
        const prompt = this.variants[analysisType][variantName];
        // 分析実行・結果保存
        const result = await this.runAnalysis(prompt, tweets);
        
        // 品質メトリクス計算
        const metrics = this.calculateQualityMetrics(result);
        
        return { result, metrics, variant: variantName };
    }
    
    calculateQualityMetrics(result) {
        return {
            tokenEfficiency: result.result.length / result.tokensUsed,
            responseTime: result.processingTime,
            structureCompliance: this.checkStructureCompliance(result.result),
            contentRelevance: this.assessContentRelevance(result.result)
        };
    }
}
```

### プロンプト改善ログ
```markdown
## プロンプト改善履歴

### v1.0 (初期版)
- 基本的な分析機能
- 日本語対応

### v1.1 (構造化改善)
- 出力形式の統一
- JSON形式の導入

### v1.2 (品質向上)
- より具体的な指示
- 例示の追加

### v2.0 (専門性強化)
- 業界知識の反映
- 技術用語の精度向上
```

---

*このドキュメントは分析精度向上に応じて継続的に更新されます。*