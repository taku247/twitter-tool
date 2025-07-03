# Twitter Analytics Tool - テストスイート

このプロジェクトの包括的なテストスイートです。バグ防止とコード品質の担保を目的としています。

## 📁 ディレクトリ構造

```
tests/
├── unit/                    # ユニットテスト
│   ├── chatgpt-analyzer.test.js
│   └── twitter-worker.test.js
├── integration/             # 統合テスト
│   └── api-endpoints.test.js
├── e2e/                     # E2Eテスト
│   └── analysis-workflow.test.js
├── fixtures/                # テストデータ
│   └── sampleData.js
├── mocks/                   # モック
│   ├── firebase.js
│   └── apis.js
├── setup.js                 # テスト環境設定
└── README.md               # このファイル
```

## 🚀 実行方法

### 全てのテストを実行
```bash
npm test
```

### 特定のテストスイートを実行
```bash
# ユニットテストのみ
npm run test:unit

# 統合テストのみ
npm run test:integration

# E2Eテストのみ
npm run test:e2e
```

### 特定のテストファイルを実行
```bash
npx jest tests/unit/chatgpt-analyzer.test.js
```

### カバレッジレポート付きで実行
```bash
npm run test:coverage
```

### ウォッチモードで実行（開発時）
```bash
npm run test:watch
```

## 🧪 テストの種類

### 1. ユニットテスト (`unit/`)
個別のクラスや関数の動作をテストします。

#### ChatGPTAnalyzer (`chatgpt-analyzer.test.js`)
- ✅ 正常な分析実行
- ✅ ツイート取得と前処理
- ✅ OpenAI API呼び出し
- ✅ 結果の解析とCSV出力
- ✅ エラーハンドリング
- ✅ Firestore操作

#### TwitterWorker (`twitter-worker.test.js`)
- ✅ ジョブ処理（scheduled_processing, manual_analysis）
- ✅ Twitter API連携
- ✅ ツイート保存
- ✅ 分析条件判定
- ✅ Discord通知
- ✅ ログ記録

### 2. 統合テスト (`integration/`)
複数のコンポーネントの連携をテストします。

#### API Endpoints (`api-endpoints.test.js`)
- ✅ リスト管理API（GET, PUT）
- ✅ 分析実行API（POST）
- ✅ 分析結果API（GET）
- ✅ テンプレート管理API（GET, POST, PUT）
- ✅ デバッグAPI
- ✅ Railway Worker連携
- ✅ エラーハンドリング

### 3. E2Eテスト (`e2e/`)
ユーザーの実際の操作フローをテストします。

#### Analysis Workflow (`analysis-workflow.test.js`)
- ✅ テンプレート作成から分析実行まで
- ✅ リスト設定と手動分析
- ✅ 分析結果表示とフィルタリング
- ✅ リアルタイム更新
- ✅ エラーハンドリング
- ✅ レスポンシブデザイン

## 🛠️ テスト環境設定

### 環境変数
テスト実行時は `.env.test` ファイルの環境変数が使用されます：

```bash
# .env.test
NODE_ENV=test
TWITTER_API_KEY=test-twitter-key
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/test
OPENAI_API_KEY=test-openai-key
RAILWAY_WORKER_URL=http://localhost:3001
```

### モック設定
外部API呼び出しはすべてモックされており、実際のAPIに影響しません：

- ✅ Firebase/Firestore
- ✅ OpenAI API
- ✅ Twitter API
- ✅ Discord Webhook
- ✅ Railway Worker API

## 📊 テストカバレッジ

現在のカバレッジ目標：
- **Statements**: > 80%
- **Branches**: > 75%
- **Functions**: > 85%
- **Lines**: > 80%

カバレッジレポートの確認：
```bash
npm run test:coverage
open coverage/lcov-report/index.html
```

## 🏗️ テストの追加方法

### 新しいユニットテストの追加
1. `tests/unit/` ディレクトリに新しいファイルを作成
2. 必要なモックを `tests/mocks/` から import
3. サンプルデータを `tests/fixtures/sampleData.js` から利用
4. テストケースを記述

```javascript
const MyClass = require('../../src/MyClass');
const { mockFirebaseClient, resetFirebaseMocks } = require('../mocks/firebase');

describe('MyClass', () => {
    beforeEach(() => {
        resetFirebaseMocks();
    });

    it('should do something', async () => {
        // テストケース
    });
});
```

### 新しい統合テストの追加
1. `tests/integration/` ディレクトリに新しいファイルを作成
2. `supertest` を使用してHTTPリクエストをテスト
3. 複数のコンポーネントの連携を確認

### 新しいE2Eテストの追加
1. `tests/e2e/` ディレクトリに新しいファイルを作成
2. `puppeteer` を使用してブラウザ操作をシミュレート
3. ユーザーの実際の操作フローを再現

## 🐛 トラブルシューティング

### よくある問題

#### テストがタイムアウトする
```javascript
// Jest設定でタイムアウトを延長
jest.setTimeout(30000);

// または個別のテストで
it('long running test', async () => {
    // テスト内容
}, 30000);
```

#### Firestoreモックがうまく動かない
```javascript
// モックのリセットを確認
beforeEach(() => {
    resetFirebaseMocks();
});
```

#### E2Eテストでページが読み込まれない
```javascript
// 要素の出現を待機
await page.waitForSelector('#targetElement', { timeout: 10000 });
```

### デバッグ方法

#### 詳細なログ出力
```bash
DEBUG=* npm test
```

#### 特定のテストのみ実行
```javascript
// it.only() または describe.only() を使用
it.only('this test only', () => {
    // テスト内容
});
```

#### E2Eテストのヘッドフル実行
```javascript
// puppeteer設定でheadless: falseに変更
browser = await puppeteer.launch({ headless: false });
```

## 📝 テストのベストプラクティス

### 1. テストケースの構造
- **Arrange**: テストデータとモックの準備
- **Act**: 実際の処理の実行
- **Assert**: 結果の検証

### 2. テスト名の付け方
```javascript
// ❌ 悪い例
it('should work', () => {});

// ✅ 良い例
it('should return error when required parameter is missing', () => {});
```

### 3. モックの適切な使用
```javascript
// ❌ 実際のAPIを呼び出す
const result = await actualAPI.call();

// ✅ モックを使用
mockAPI.call.mockResolvedValue(expectedResult);
const result = await myFunction();
```

### 4. テストデータの管理
```javascript
// ❌ テスト内でハードコード
const testData = { id: '123', name: 'test' };

// ✅ fixtures を使用
const { sampleData } = require('../fixtures/sampleData');
```

## 🔧 CI/CD での実行

### GitHub Actions での実行例
```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm install
      - run: npm run test:coverage
      - run: npm run test:e2e
```

## 📈 継続的改善

テストスイートは継続的に改善していきます：

1. **新機能追加時**: 対応するテストケースを必ず追加
2. **バグ修正時**: バグを再現するテストケースを追加
3. **リファクタリング時**: テストが引き続きパスすることを確認
4. **定期レビュー**: テストカバレッジとテスト品質の見直し

## 🤝 貢献方法

テストの改善に貢献する場合：

1. 新しいテストケースの提案
2. テストカバレッジの向上
3. テスト実行時間の短縮
4. モックの改善
5. ドキュメントの更新

---

このテストスイートにより、Twitter Analytics Toolの品質と信頼性を継続的に向上させていきます。