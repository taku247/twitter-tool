# TwitterAPI.io 調査結果

## サービス概要

-   **サービスタイプ**: サードパーティ Twitter API サービス
-   **ベース URL**: `https://api.twitterapi.io`
-   **主な特徴**: Twitter 開発者認証不要で Twitter データにアクセス可能

## 主要機能

-   リアルタイムデータアクセス
-   レスポンス時間: 約 800ms
-   処理能力: 1,000+クエリ/秒
-   Webhook と WebSocket 対応
-   稼働率: 99.99%保証
-   24/7 サポート

## 認証方法

-   **方式**: `X-API-Key`ヘッダーによる API キー認証
-   **Twitter OAuth 不要** - これが主要な売り
-   **無料枠**: サインアップ時に$1 の無料クレジット付与

## 料金体系

-   **従量課金制**: 1,000 ツイートあたり$0.15
-   **最小課金単位**: $0.00015/リクエスト
-   **月額コミットメント不要**
-   Twitter 公式 API と比較してコスト効率が良い（96%安い）

## 確認済み API エンドポイント

### 1. ツイート高度検索

**エンドポイント**: `GET https://api.twitterapi.io/twitter/tweet/advanced_search`

**ヘッダー**:

```
X-API-Key: YOUR_API_KEY
```

**パラメータ**:

-   `query`: 検索クエリ（Twitter 検索演算子対応）
    -   例: `"from:elonmusk since:2025-03-01_00:02:01_UTC"`

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

-   `listId`: Twitter リストの ID（必須）※キャメルケースに注意
-   `sinceTime`: 開始時刻（Unix timestamp 秒）※オプション
-   `untilTime`: 終了時刻（Unix timestamp 秒）※オプション
-   `includeReplies`: リプライを含むか（boolean、デフォルト: true）※オプション
-   `cursor`: ページネーション用カーソル（string、初回は空文字）※オプション

**特徴**:

-   1 ページあたり 20 ツイートを返す（固定）
-   ツイート時間の降順でソート
-   期間フィルター対応
-   ページネーションは cursor 対応

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

-   `listId`: Twitter リストの ID（必須）※キャメルケースに注意

**特徴**:

-   1 ページあたり 20 フォロワーを返す

#### リストのメンバー取得

**エンドポイント**: `GET https://api.twitterapi.io/twitter/list/members`

**パラメータ**:

-   `listId`: Twitter リストの ID（必須）※キャメルケースに注意

**特徴**:

-   1 ページあたり 20 メンバーを返す

### 3. 利用可能なデータカテゴリ

#### ユーザーデータ:

-   プロフィール情報
-   ユーザーのツイート
-   フォロワー
-   フォロー中リスト

#### ツイートデータ:

-   ツイート詳細検索
-   リプライ
-   引用ツイート
-   リツイートユーザー

#### リストデータ:

-   リストのツイート
-   リストのフォロワー
-   リストのメンバー

## レート制限

-   **高処理能力**: 1,000+クエリ/秒
-   **具体的な制限**: 公開資料では詳細不明、サインアップ後のドキュメントで確認が必要

## 重要な注意事項

1. **サードパーティサービス**: Twitter 公式 API ではない
2. **データ完全性の保証なし**: サードパーティサービスのため、全ての Twitter データにアクセスできない可能性
3. **利用規約**: TwitterAPI.io と Twitter 両方の利用規約確認が必要
4. **信頼性**: 99.99%稼働率を謳うが、インフラと Twitter ポリシーに依存

## WebSocket / リアルタイムストリーミング機能詳細調査結果

### WebSocket 機能の有無：YES ✅

TwitterAPI.io は WebSocket によるリアルタイム Twitter アカウント監視機能を提供しています。

### 技術仕様

#### WebSocket エンドポイント

-   **URL**: `wss://ws.twitterapi.io/twitter/tweet/websocket`
-   **認証方式**: HTTP ヘッダーによる API キー認証
    ```json
    { "x-api-key": "your_api_key" }
    ```

#### 接続仕様

-   **Ping インターバル**: 40 秒推奨
-   **自動再接続**: 90 秒間隔
-   **接続制限**: API キーあたり 1 接続のみ
-   **レスポンス時間**: 約 800ms
-   **処理能力**: 1,000+ QPS

#### サポートされるイベントタイプ

1. **connected**: 接続成功確認
2. **ping**: サーバーハートビート
3. **tweet**: マッチしたツイートデータ

#### ツイートイベント形式

```json
{
    "event_type": "tweet",
    "rule_id": "rule_12345",
    "rule_tag": "elon_musk_tweets",
    "tweets": [
        {
            "id": "1234567890",
            "text": "Sample tweet",
            "author": {
                "username": "username",
                "name": "Display Name"
            },
            "created_at": "2023-06-01T12:34:56Z"
        }
    ]
}
```

### フィルタールール設定

#### 監視対象の設定

-   **特定ユーザー監視**: `from:username`形式
-   **キーワード監視**: `#hashtag`、`keyword`形式
-   **複合条件**: Twitter 検索演算子対応

#### ルール管理

-   Web 管理画面または API 経由での設定
-   ルールの作成、更新、削除、照会が可能
-   ポーリング間隔: 0.1〜86,400 秒

### 料金体系

#### WebSocket ストリーミング料金

-   **基本料金**: REST API と同一の従量課金制
-   **ツイート単価**: $0.15 / 1,000 ツイート
-   **最小課金単位**: $0.00015 / リクエスト
-   **重要**: フィルタールールを有効化した時点から課金開始（WebSocket 未接続でも課金対象）

#### 他サービスとの比較

-   Twitter 公式ストリーミング API: $5,000/月
-   TwitterAPI.io の場合: 従量課金（約 96%安い）

### 実装例（Python）

```python
import websocket
import json
import time

def on_message(ws, message):
    data = json.loads(message)
    if data['event_type'] == 'tweet':
        print(f"New tweet: {data['tweets'][0]['text']}")
    elif data['event_type'] == 'ping':
        print("Ping received")

def on_error(ws, error):
    print(f"Error: {error}")

def on_close(ws, close_status_code, close_msg):
    print("Connection closed")
    # 90秒後に再接続
    time.sleep(90)
    connect_websocket()

def on_open(ws):
    print("WebSocket connection opened")

def connect_websocket():
    websocket.enableTrace(True)
    ws = websocket.WebSocketApp(
        "wss://ws.twitterapi.io/twitter/tweet/websocket",
        header={"x-api-key": "your_api_key"},
        on_open=on_open,
        on_message=on_message,
        on_error=on_error,
        on_close=on_close
    )
    ws.run_forever(ping_interval=40, ping_timeout=10)

# 使用には websocket-client ライブラリが必要
# pip install websocket-client
```

### 代替手段：Webhook 機能

WebSocket が適さない場合、Webhook 機能も提供されています：

#### Webhook 仕様

-   **ゼロコード統合**: 永続接続不要
-   **同一料金体系**: $0.00015/ツイート
-   **フィルタールール**: WebSocket と同様の設定方式
-   **データ形式**: WebSocket と同一の JSON 形式

#### Webhook 実装例

```python
from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/webhook', methods=['POST'])
def handle_webhook():
    data = request.json
    if data['event_type'] == 'tweet':
        # ツイート処理ロジック
        process_tweet(data['tweets'][0])
    return jsonify({'status': 'success'})

def process_tweet(tweet):
    print(f"Received tweet: {tweet['text']}")
    # 具体的な処理を実装
```

### 推奨される実装アプローチ

#### WebSocket が適している場合

-   **リアルタイム性重視**: 即座にデータ処理が必要
-   **高頻度監視**: 多数のツイートを継続監視
-   **インタラクティブアプリ**: ダッシュボードやライブ分析

#### Webhook が適している場合

-   **バッチ処理**: 定期的なデータ処理で十分
-   **サーバーレス環境**: AWS Lambda、Vercel Functions 等
-   **シンプルな構成**: 接続管理の複雑さを避けたい場合

### ベストプラクティス

1. **接続管理**: 1API キーあたり 1 接続の制限を遵守
2. **エラーハンドリング**: 自動再接続機能の実装
3. **フィルタールール最適化**: 不要なデータ受信を避けてコスト削減
4. **セキュリティ**: API キーの適切な管理

## 不明な情報

公開ドキュメントへのアクセス制限により、以下の詳細は要サインアップ:

-   完全なエンドポイント一覧
-   各エンドポイントの詳細パラメータ仕様
-   レスポンス形式の例
-   エラーハンドリングとステータスコード

## 活用可能なサイト例

-   **仮想通貨トレンド分析サイト** - リアルタイムで Twitter 上の暗号通貨関連言及を追跡
-   **ソーシャルメディア分析ダッシュボード** - ブランドや製品の評判モニタリング
-   **市場調査ツール** - 消費者の意見や感情分析
-   **ニュース集約サービス** - トレンドトピックの自動収集と分析
-   **インフルエンサー分析ツール** - フォロワー動向とエンゲージメント追跡

## 推奨事項

完全な API ドキュメントを入手するには:

1. twitterapi.io でアカウント作成
2. 完全なドキュメントポータルにアクセス
3. 全エンドポイントとパラメータの API リファレンスガイドを確認

このサービスは合法的に見えるが、サードパーティによる Twitter データアクセスに関する Twitter 利用規約のグレーエリアで動作している。

## ChatGPT API 統合（準備済み）

### セットアップ

このプロジェクトは将来的なツイート要約機能のために OpenAI ChatGPT API を使用する準備が整っています。

### 必要な設定

1. OpenAI API キーを`.env`ファイルに設定：

    ```
    OPENAI_API_KEY=your_openai_api_key_here
    ```

2. 依存関係はすでにインストール済み：
    - `openai@^5.1.1`

### 要約エンドポイント（未実装）

**エンドポイント**: `POST /api/twitter/summarize`

**パラメータ**:

-   `tweets`: ツイート配列（必須）
-   `summaryType`: 要約タイプ（オプション）
    -   `brief`: 簡潔な要約
    -   `detailed`: 詳細な要約
    -   `trends`: トレンド分析
    -   `sentiment`: 感情分析

**将来の実装計画**:

1. ツイートテキストの抽出・整形
2. OpenAI ChatGPT API への送信
3. 要約タイプに応じたプロンプト最適化
4. レスポンスの構造化

**ヘルスチェック**:
`/api/health`エンドポイントで OpenAI API の設定状況を確認可能：

```json
{
    "status": "OK",
    "services": {
        "twitter": true,
        "openai": true
    }
}
```
