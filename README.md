# Twitter Analytics Dashboard

TwitterAPI.io を使用したリアルタイム Twitter 分析ダッシュボード。将来的な ChatGPT 要約機能付き。

chatGPT(OpenAI): https://platform.openai.com/settings/organization/usage

## 機能

-   **検索機能**
    -   Twitter 高度検索（キーワード、日付、ユーザー指定など）
    -   Twitter リストのツイート取得
-   **UI**
    -   モダンなダークテーマダッシュボード
    -   レスポンシブデザイン
-   **API 統合**
    -   TwitterAPI.io（サードパーティ Twitter API）
    -   OpenAI ChatGPT API（要約機能用、準備済み）

## セットアップ

### 1. 依存関係のインストール

```bash
yarn install
```

### 2. 環境変数の設定

`.env.example`をコピーして`.env`ファイルを作成：

```bash
cp .env.example .env
```

`.env`ファイルに以下を設定：

```
# TwitterAPI.io Configuration
TWITTER_API_KEY=your_twitter_api_key_here

# OpenAI Configuration (要約機能用、オプション)
OPENAI_API_KEY=your_openai_api_key_here

# Server Configuration
PORT=3000
```

### 3. サーバー起動

#### 本番モード

```bash
yarn start
```

#### 開発モード（ホットリロード）

```bash
yarn dev
```

### 4. アクセス

ブラウザで `http://localhost:3000` にアクセス

## API エンドポイント

### Twitter 検索

-   `POST /api/twitter/search` - キーワード検索
-   `POST /api/twitter/list` - リスト検索

### 要約機能（準備済み、未実装）

-   `POST /api/twitter/summarize` - ツイート要約

### ユーティリティ

-   `GET /api/health` - ヘルスチェック

## 必要な API キー

### TwitterAPI.io

1. [TwitterAPI.io](https://twitterapi.io) でアカウント作成
2. $1 の無料クレジット付与
3. API キーを取得

### OpenAI（オプション）

1. [OpenAI Platform](https://platform.openai.com/) でアカウント作成
2. API キーを生成
3. 要約機能で使用予定

## プロジェクト構成

```
twitter-tool/
├── server.js              # Express サーバー
├── public/
│   └── index.html         # フロントエンド
├── package.json           # 依存関係
├── .env.example          # 環境変数テンプレート
├── .gitignore            # Git除外設定
├── twitterapi_research.md # API調査資料
└── README.md             # このファイル
```

## 技術スタック

-   **Backend**: Node.js, Express
-   **Frontend**: HTML, CSS, JavaScript (Vanilla)
-   **APIs**: TwitterAPI.io, OpenAI ChatGPT
-   **Package Manager**: Yarn

## 料金

-   **TwitterAPI.io**: $0.15/1,000 ツイート
-   **OpenAI**: 使用量に応じた従量課金

## 注意事項

-   TwitterAPI.io はサードパーティサービスです
-   OpenAI API キーは要約機能の実装時まで必須ではありません
-   API キーは`.env`ファイルで管理し、Git にコミットしないでください
