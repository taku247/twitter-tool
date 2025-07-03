// E2E テスト: 分析ワークフロー

const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const path = require('path');

// テスト環境設定
const TEST_PORT = 3003;
const BASE_URL = `http://localhost:${TEST_PORT}`;

describe('Analysis Workflow E2E Tests', () => {
    let browser;
    let page;
    let server;

    beforeAll(async () => {
        // テスト用サーバーを起動
        server = spawn('node', ['server.js'], {
            env: { ...process.env, PORT: TEST_PORT, NODE_ENV: 'test' },
            cwd: path.resolve(__dirname, '../..')
        });

        // サーバーの起動を待つ
        await new Promise((resolve) => {
            server.stdout.on('data', (data) => {
                if (data.toString().includes(`listening on ${TEST_PORT}`)) {
                    resolve();
                }
            });
        });

        // Puppeteerの設定
        browser = await puppeteer.launch({
            headless: true, // CIでも動作するようにheadlessモード
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
    });

    afterAll(async () => {
        if (browser) {
            await browser.close();
        }
        if (server) {
            server.kill();
        }
    });

    beforeEach(async () => {
        page = await browser.newPage();
        
        // コンソールエラーを監視
        page.on('console', (msg) => {
            if (msg.type() === 'error') {
                console.error('Console error:', msg.text());
            }
        });

        // ネットワークエラーを監視
        page.on('response', (response) => {
            if (!response.ok()) {
                console.warn(`HTTP ${response.status()}: ${response.url()}`);
            }
        });
    });

    afterEach(async () => {
        if (page) {
            await page.close();
        }
    });

    describe('テンプレート管理フロー', () => {
        it('テンプレートの作成から使用まで', async () => {
            // 1. テンプレート管理ページに移動
            await page.goto(`${BASE_URL}/template-manager.html`);
            await page.waitForSelector('#templatesList');

            // 2. 新しいテンプレートを作成
            await page.click('#createTemplateBtn');
            await page.waitForSelector('#templateModal');

            // フォームに入力
            await page.type('#templateName', 'E2E Test Template');
            await page.select('#templateCategory', 'sentiment');
            await page.type('#templatePrompt', 'Analyze the sentiment of these tweets: {{ tweets }}');
            await page.type('#templateDescription', 'E2E testing template');

            // 保存
            await page.click('#saveTemplateBtn');
            await page.waitForSelector('.template-item[data-template-name="E2E Test Template"]');

            // 3. テンプレートが作成されたことを確認
            const templateItem = await page.$('.template-item[data-template-name="E2E Test Template"]');
            expect(templateItem).not.toBeNull();

            // 4. リスト管理ページでテンプレートが選択可能か確認
            await page.goto(`${BASE_URL}/list-manager.html`);
            await page.waitForSelector('#listsContainer');

            // リスト設定を開く
            await page.click('.list-item:first-child .settings-btn');
            await page.waitForSelector('#analysisTemplateSelect');

            // 作成したテンプレートが選択肢にあることを確認
            const templateOptions = await page.$$eval('#analysisTemplateSelect option', 
                options => options.map(option => option.textContent)
            );
            expect(templateOptions).toContain('E2E Test Template');
        });

        it('テンプレートの編集と削除', async () => {
            await page.goto(`${BASE_URL}/template-manager.html`);
            await page.waitForSelector('#templatesList');

            // テンプレートを編集
            await page.click('.template-item:first-child .edit-btn');
            await page.waitForSelector('#templateModal');

            // 名前を変更
            await page.evaluate(() => document.getElementById('templateName').value = '');
            await page.type('#templateName', 'Updated E2E Template');
            await page.click('#saveTemplateBtn');

            // 変更が反映されたことを確認
            await page.waitForSelector('.template-item[data-template-name="Updated E2E Template"]');

            // テンプレートを削除
            await page.click('.template-item[data-template-name="Updated E2E Template"] .delete-btn');
            
            // 確認ダイアログで削除を実行
            page.on('dialog', async dialog => {
                await dialog.accept();
            });

            // 削除されたことを確認
            await page.waitForFunction(
                () => !document.querySelector('.template-item[data-template-name="Updated E2E Template"]')
            );
        });
    });

    describe('手動分析フロー', () => {
        it('KaitoTweetページでの分析実行', async () => {
            await page.goto(`${BASE_URL}/kaitotweet.html`);
            await page.waitForSelector('#searchForm');

            // 1. ツイートを検索
            await page.type('#searchKeywords', '@ai');
            await page.click('#searchBtn');

            // 検索結果を待つ
            await page.waitForSelector('#tweetsContainer .tweet-item', { timeout: 10000 });

            // 2. ツイートを選択
            const tweetCheckboxes = await page.$$('#tweetsContainer .tweet-checkbox');
            if (tweetCheckboxes.length > 0) {
                await tweetCheckboxes[0].click();
                await tweetCheckboxes[1].click(); // 2つ選択
            }

            // 3. AI分析セクションでテンプレートを選択
            await page.select('#analysisTemplateSelect', 'template-sentiment');

            // 4. 分析を実行
            await page.click('#analyzeBtn');

            // オーバーレイローディングが表示されることを確認
            await page.waitForSelector('#loadingOverlay');

            // 分析完了を待つ
            await page.waitForSelector('#analysisResult', { timeout: 30000 });

            // 5. 結果が表示されることを確認
            const resultText = await page.$eval('#analysisResult', el => el.textContent);
            expect(resultText).toContain('分析完了');
        });

        it('リスト管理ページでの分析設定と実行', async () => {
            await page.goto(`${BASE_URL}/list-manager.html`);
            await page.waitForSelector('#listsContainer');

            // 1. リスト設定を開く
            await page.click('.list-item:first-child .settings-btn');
            await page.waitForSelector('#listSettingsModal');

            // 2. 分析設定を有効化
            await page.click('#analysisEnabled');
            await page.select('#analysisTemplateSelect', 'template-sentiment');
            await page.type('#analysisMinTweets', '5');

            // 設定を保存
            await page.click('#saveSettingsBtn');
            await page.waitForSelector('#listSettingsModal', { hidden: true });

            // 3. 手動分析を実行
            await page.click('.list-item:first-child .analyze-btn');

            // 確認ダイアログで実行
            page.on('dialog', async dialog => {
                await dialog.accept();
            });

            // 4. 分析開始の通知を確認
            await page.waitForSelector('.notification', { timeout: 5000 });
            const notificationText = await page.$eval('.notification', el => el.textContent);
            expect(notificationText).toContain('分析を開始しました');
        });
    });

    describe('分析結果表示フロー', () => {
        it('分析結果ページでの表示とフィルタリング', async () => {
            await page.goto(`${BASE_URL}/analysis-results.html`);
            await page.waitForSelector('#analysisResultsContainer');

            // 1. 分析結果一覧が表示されることを確認
            const resultItems = await page.$$('.analysis-result-item');
            expect(resultItems.length).toBeGreaterThan(0);

            // 2. リストによるフィルタリング
            await page.select('#filterByList', 'list-doc-123');
            await page.waitForTimeout(1000); // フィルタリング処理を待つ

            // フィルタリングされた結果を確認
            const filteredItems = await page.$$('.analysis-result-item:not([style*="display: none"])');
            expect(filteredItems.length).toBeGreaterThan(0);

            // 3. 詳細を展開
            await page.click('.analysis-result-item:first-child .expand-btn');
            await page.waitForSelector('.analysis-details');

            // 詳細情報が表示されることを確認
            const detailsVisible = await page.$eval('.analysis-details', el => 
                getComputedStyle(el).display !== 'none'
            );
            expect(detailsVisible).toBe(true);

            // 4. CSVダウンロード
            // const downloadPromise = page.waitForEvent('download');
            await page.click('.analysis-result-item:first-child .download-csv-btn');
            
            // ダウンロードが開始されることを確認
            // const download = await downloadPromise;
            // expect(download.suggestedFilename()).toContain('.csv');
        });

        it('リアルタイム更新の動作確認', async () => {
            await page.goto(`${BASE_URL}/analysis-results.html`);
            await page.waitForSelector('#analysisResultsContainer');

            // 初期の結果数を記録
            const initialCount = await page.$$eval('.analysis-result-item', items => items.length);

            // 新しい分析を別ページで開始（シミュレーション）
            const newPage = await browser.newPage();
            await newPage.goto(`${BASE_URL}/list-manager.html`);
            await newPage.waitForSelector('#listsContainer');
            
            // 手動分析を実行
            await newPage.click('.list-item:first-child .analyze-btn');
            newPage.on('dialog', async dialog => {
                await dialog.accept();
            });

            await newPage.close();

            // 元のページで新しい結果が表示されるのを待つ
            await page.waitForFunction(
                (expectedCount) => {
                    const items = document.querySelectorAll('.analysis-result-item');
                    return items.length > expectedCount;
                },
                {},
                initialCount
            );

            // 新しい結果が追加されたことを確認
            const newCount = await page.$$eval('.analysis-result-item', items => items.length);
            expect(newCount).toBeGreaterThan(initialCount);
        });
    });

    describe('エラーハンドリング', () => {
        it('ネットワークエラー時の適切な表示', async () => {
            // ネットワークを無効化
            await page.setOfflineMode(true);

            await page.goto(`${BASE_URL}/template-manager.html`);
            
            // エラーメッセージが表示されることを確認
            await page.waitForSelector('.error-message', { timeout: 10000 });
            const errorText = await page.$eval('.error-message', el => el.textContent);
            expect(errorText).toContain('接続エラー');

            // ネットワークを復旧
            await page.setOfflineMode(false);

            // リトライボタンが機能することを確認
            await page.click('.retry-btn');
            await page.waitForSelector('#templatesList');
        });

        it('無効なデータ入力時のバリデーション', async () => {
            await page.goto(`${BASE_URL}/template-manager.html`);
            await page.waitForSelector('#templatesList');

            // 新しいテンプレート作成
            await page.click('#createTemplateBtn');
            await page.waitForSelector('#templateModal');

            // 無効なデータを入力
            await page.type('#templateName', ''); // 空の名前
            await page.type('#templatePrompt', 'Invalid prompt without placeholder');

            // 保存を試行
            await page.click('#saveTemplateBtn');

            // バリデーションエラーが表示されることを確認
            await page.waitForSelector('.validation-error');
            const errorMessages = await page.$$eval('.validation-error', 
                errors => errors.map(e => e.textContent)
            );
            
            expect(errorMessages.some(msg => msg.includes('名前は必須'))).toBe(true);
            expect(errorMessages.some(msg => msg.includes('{{ tweets }}'))).toBe(true);
        });
    });

    describe('レスポンシブデザイン', () => {
        it('モバイル表示での動作確認', async () => {
            // モバイル画面サイズに設定
            await page.setViewport({ width: 375, height: 667 });

            await page.goto(`${BASE_URL}/kaitotweet.html`);
            await page.waitForSelector('#searchForm');

            // ハンバーガーメニューが表示されることを確認
            const hamburgerMenu = await page.$('.hamburger-menu');
            expect(hamburgerMenu).not.toBeNull();

            // メニューをクリックして展開
            await page.click('.hamburger-menu');
            await page.waitForSelector('.nav-menu.open');

            // ナビゲーションが機能することを確認
            await page.click('.nav-menu a[href="template-manager.html"]');
            await page.waitForNavigation();
            
            expect(page.url()).toContain('template-manager.html');
        });

        it('タブレット表示での動作確認', async () => {
            // タブレット画面サイズに設定
            await page.setViewport({ width: 768, height: 1024 });

            await page.goto(`${BASE_URL}/list-manager.html`);
            await page.waitForSelector('#listsContainer');

            // サイドバーとメインコンテンツが適切に表示されることを確認
            const sidebar = await page.$('.sidebar');
            const mainContent = await page.$('.main-content');
            
            expect(sidebar).not.toBeNull();
            expect(mainContent).not.toBeNull();

            // 両方が同時に表示されることを確認
            const sidebarVisible = await page.$eval('.sidebar', el => 
                getComputedStyle(el).display !== 'none'
            );
            const mainVisible = await page.$eval('.main-content', el => 
                getComputedStyle(el).display !== 'none'
            );

            expect(sidebarVisible).toBe(true);
            expect(mainVisible).toBe(true);
        });
    });
});