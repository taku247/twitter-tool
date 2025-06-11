# TwitterAPI.io 調査結果

## サービス概要
- **サービスタイプ**: サードパーティTwitter APIサービス
- **ベースURL**: `https://api.twitterapi.io`
- **主な特徴**: Twitter開発者認証不要でTwitterデータにアクセス可能

## 主要機能
- リアルタイムデータアクセス
- レスポンス時間: 約800ms
- 処理能力: 1,000+クエリ/秒
- WebhookとWebSocket対応
- 稼働率: 99.99%保証
- 24/7サポート

## 認証方法
- **方式**: `X-API-Key`ヘッダーによるAPIキー認証
- **Twitter OAuth不要** - これが主要な売り
- **無料枠**: サインアップ時に$1の無料クレジット付与

## 料金体系
- **従量課金制**: 1,000ツイートあたり$0.15
- **最小課金単位**: $0.00015/リクエスト
- **月額コミットメント不要**
- Twitter公式APIと比較してコスト効率が良い（96%安い）

## 確認済みAPIエンドポイント

### 1. ツイート高度検索
**エンドポイント**: `GET https://api.twitterapi.io/twitter/tweet/advanced_search`

**ヘッダー**:
```
X-API-Key: YOUR_API_KEY
```

**パラメータ**:
- `query`: 検索クエリ（Twitter検索演算子対応）
  - 例: `"from:elonmusk since:2025-03-01_00:02:01_UTC"`

**使用例**:
```python
import requests

url = "https://api.twitterapi.io/twitter/tweet/advanced_search"
headers = {"X-API-Key": "YOUR_API_KEY"}
params = {"query": "from:elonmusk since:2025-03-01_00:02:01_UTC"}

response = requests.request("GET", url, headers=headers, params=params)
print(response.text)
```

### 2. リスト関連エンドポイント

#### リストのツイート取得
**エンドポイント**: `GET https://api.twitterapi.io/twitter/list/tweets`

**パラメータ**:
- `listId`: TwitterリストのID（必須）※キャメルケースに注意
- `sinceTime`: 開始時刻（Unix timestamp秒）※オプション
- `untilTime`: 終了時刻（Unix timestamp秒）※オプション
- `includeReplies`: リプライを含むか（boolean、デフォルト: true）※オプション
- `cursor`: ページネーション用カーソル（string、初回は空文字）※オプション

**特徴**:
- 1ページあたり20ツイートを返す（固定）
- ツイート時間の降順でソート
- 期間フィルター対応
- ページネーションはcursor対応

**使用例**:
```python
url = "https://api.twitterapi.io/twitter/list/tweets"
headers = {"X-API-Key": "YOUR_API_KEY"}
params = {
    "listId": "1660530806564204549",
    "sinceTime": 1704067200,  # 2024-01-01 00:00:00 UTC
    "untilTime": 1704153600,  # 2024-01-02 00:00:00 UTC
    "includeReplies": False
}

response = requests.request("GET", url, headers=headers, params=params)
```

#### リストのフォロワー取得
**エンドポイント**: `GET https://api.twitterapi.io/twitter/list/followers`

**パラメータ**:
- `listId`: TwitterリストのID（必須）※キャメルケースに注意

**特徴**:
- 1ページあたり20フォロワーを返す

#### リストのメンバー取得
**エンドポイント**: `GET https://api.twitterapi.io/twitter/list/members`

**パラメータ**:
- `listId`: TwitterリストのID（必須）※キャメルケースに注意

**特徴**:
- 1ページあたり20メンバーを返す

### 3. 利用可能なデータカテゴリ

#### ユーザーデータ:
- プロフィール情報
- ユーザーのツイート
- フォロワー
- フォロー中リスト

#### ツイートデータ:
- ツイート詳細検索
- リプライ
- 引用ツイート
- リツイートユーザー

#### リストデータ:
- リストのツイート
- リストのフォロワー
- リストのメンバー

## レート制限
- **高処理能力**: 1,000+クエリ/秒
- **具体的な制限**: 公開資料では詳細不明、サインアップ後のドキュメントで確認が必要

## 重要な注意事項

1. **サードパーティサービス**: Twitter公式APIではない
2. **データ完全性の保証なし**: サードパーティサービスのため、全てのTwitterデータにアクセスできない可能性
3. **利用規約**: TwitterAPI.ioとTwitter両方の利用規約確認が必要
4. **信頼性**: 99.99%稼働率を謳うが、インフラとTwitterポリシーに依存

## 不明な情報
公開ドキュメントへのアクセス制限により、以下の詳細は要サインアップ:
- 完全なエンドポイント一覧
- 各エンドポイントの詳細パラメータ仕様
- レスポンス形式の例
- エラーハンドリングとステータスコード
- Webhook設定詳細
- WebSocket接続仕様

## 活用可能なサイト例
- **仮想通貨トレンド分析サイト** - リアルタイムでTwitter上の暗号通貨関連言及を追跡
- **ソーシャルメディア分析ダッシュボード** - ブランドや製品の評判モニタリング
- **市場調査ツール** - 消費者の意見や感情分析
- **ニュース集約サービス** - トレンドトピックの自動収集と分析
- **インフルエンサー分析ツール** - フォロワー動向とエンゲージメント追跡

## 推奨事項
完全なAPIドキュメントを入手するには:
1. twitterapi.ioでアカウント作成
2. 完全なドキュメントポータルにアクセス
3. 全エンドポイントとパラメータのAPIリファレンスガイドを確認

このサービスは合法的に見えるが、サードパーティによるTwitterデータアクセスに関するTwitter利用規約のグレーエリアで動作している。

## ChatGPT API統合（準備済み）

### セットアップ
このプロジェクトは将来的なツイート要約機能のためにOpenAI ChatGPT APIを使用する準備が整っています。

### 必要な設定
1. OpenAI APIキーを`.env`ファイルに設定：
   ```
   OPENAI_API_KEY=your_openai_api_key_here
   ```

2. 依存関係はすでにインストール済み：
   - `openai@^5.1.1`

### 要約エンドポイント（未実装）
**エンドポイント**: `POST /api/twitter/summarize`

**パラメータ**:
- `tweets`: ツイート配列（必須）
- `summaryType`: 要約タイプ（オプション）
  - `brief`: 簡潔な要約
  - `detailed`: 詳細な要約
  - `trends`: トレンド分析
  - `sentiment`: 感情分析

**将来の実装計画**:
1. ツイートテキストの抽出・整形
2. OpenAI ChatGPT APIへの送信
3. 要約タイプに応じたプロンプト最適化
4. レスポンスの構造化

**ヘルスチェック**:
`/api/health`エンドポイントでOpenAI APIの設定状況を確認可能：
```json
{
  "status": "OK",
  "services": {
    "twitter": true,
    "openai": true
  }
}
```