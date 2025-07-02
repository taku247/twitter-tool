// Firebase imports
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { 
    getFirestore, 
    collection, 
    query, 
    orderBy, 
    limit, 
    startAfter,
    getDocs,
    where,
    onSnapshot,
    doc,
    getDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

class AnalysisResultsManager {
    constructor() {
        this.db = null;
        this.app = null;
        this.currentPage = 1;
        this.pageSize = 12;
        this.lastDocument = null;
        this.documents = [];
        this.totalCount = 0;
        this.filters = {
            search: '',
            status: '',
            period: ''
        };
        this.realtimeListener = null;
        this.refreshInterval = null;
        
        this.initializeFirebase();
        this.setupEventListeners();
        this.loadAnalysisResults();
        this.startRealtimeUpdates();
    }

    async initializeFirebase() {
        try {
            // Firebase設定を環境変数から取得
            const config = await this.getFirebaseConfig();
            console.log('🔧 Firebase config loaded:', {
                projectId: config.projectId,
                authDomain: config.authDomain
            });

            this.app = initializeApp(config);
            this.db = getFirestore(this.app);
            
            console.log('✅ Firebase initialized successfully');
        } catch (error) {
            console.error('❌ Firebase initialization failed:', error);
            this.showError('Firebase初期化に失敗しました');
        }
    }

    async getFirebaseConfig() {
        try {
            const response = await fetch('/api/firebase-config');
            if (!response.ok) throw new Error('Failed to fetch Firebase config');
            return await response.json();
        } catch (error) {
            console.error('Failed to get Firebase config:', error);
            // フォールバック: HTMLから設定を読み取り
            return window.FIREBASE_CONFIG;
        }
    }

    setupEventListeners() {
        // 検索入力
        const searchInput = document.getElementById('searchInput');
        searchInput?.addEventListener('input', (e) => {
            this.filters.search = e.target.value;
            this.debounceSearch();
        });

        // フィルター
        const statusFilter = document.getElementById('statusFilter');
        statusFilter?.addEventListener('change', (e) => {
            this.filters.status = e.target.value;
            this.loadAnalysisResults();
        });

        const periodFilter = document.getElementById('periodFilter');
        periodFilter?.addEventListener('change', (e) => {
            this.filters.period = e.target.value;
            this.loadAnalysisResults();
        });

        // 更新ボタン
        const refreshBtn = document.getElementById('refreshBtn');
        refreshBtn?.addEventListener('click', () => {
            this.loadAnalysisResults();
        });

        // ページネーション
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');
        
        prevBtn?.addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.loadAnalysisResults();
            }
        });

        nextBtn?.addEventListener('click', () => {
            this.currentPage++;
            this.loadAnalysisResults();
        });

        // モーダル
        const modalOverlay = document.getElementById('modalOverlay');
        const modalClose = document.getElementById('modalClose');
        
        modalOverlay?.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                this.closeModal();
            }
        });

        modalClose?.addEventListener('click', () => {
            this.closeModal();
        });

        // ESCキーでモーダルを閉じる
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            }
        });
    }

    debounceSearch() {
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            this.loadAnalysisResults();
        }, 300);
    }

    async loadAnalysisResults() {
        try {
            this.showLoading(true);
            
            if (!this.db) {
                await this.initializeFirebase();
            }

            // クエリ構築
            let analysisQuery = query(
                collection(this.db, 'ai_analysis'),
                orderBy('createdAt', 'desc')
            );

            // ステータスフィルター
            if (this.filters.status) {
                analysisQuery = query(
                    collection(this.db, 'ai_analysis'),
                    where('status', '==', this.filters.status),
                    orderBy('createdAt', 'desc')
                );
            }

            // 期間フィルター
            if (this.filters.period) {
                const now = new Date();
                let startDate;

                switch (this.filters.period) {
                    case 'today':
                        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                        break;
                    case 'week':
                        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                        break;
                    case 'month':
                        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                        break;
                }

                if (startDate) {
                    analysisQuery = query(
                        analysisQuery,
                        where('createdAt', '>=', startDate)
                    );
                }
            }

            // ページネーション
            if (this.currentPage > 1 && this.lastDocument) {
                analysisQuery = query(analysisQuery, startAfter(this.lastDocument));
            }

            analysisQuery = query(analysisQuery, limit(this.pageSize));

            console.log('🔍 Loading analysis results...');
            const snapshot = await getDocs(analysisQuery);
            
            let results = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                results.push({
                    id: doc.id,
                    ...data,
                    createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt)
                });
            });

            // 検索フィルター適用
            if (this.filters.search) {
                const searchTerm = this.filters.search.toLowerCase();
                results = results.filter(item => 
                    item.listName?.toLowerCase().includes(searchTerm) ||
                    item.templateName?.toLowerCase().includes(searchTerm) ||
                    item.summary?.toLowerCase().includes(searchTerm)
                );
            }

            this.lastDocument = snapshot.docs[snapshot.docs.length - 1];
            this.renderResults(results);
            this.updatePagination(results.length);
            
            console.log(`✅ Loaded ${results.length} analysis results`);
            
        } catch (error) {
            console.error('❌ Failed to load analysis results:', error);
            this.showError('分析結果の読み込みに失敗しました');
        } finally {
            this.showLoading(false);
        }
    }

    renderResults(results) {
        const grid = document.getElementById('analysisGrid');
        const emptyState = document.getElementById('emptyState');

        if (results.length === 0) {
            grid.innerHTML = '';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';
        
        grid.innerHTML = results.map(result => this.createAnalysisCard(result)).join('');
        
        // イベントリスナーを追加
        grid.querySelectorAll('.btn-view').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const analysisId = e.target.dataset.analysisId;
                this.showAnalysisDetail(analysisId);
            });
        });

        grid.querySelectorAll('.btn-download').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const csvPath = e.target.dataset.csvPath;
                this.downloadCSV(csvPath);
            });
        });
    }

    createAnalysisCard(result) {
        const statusClass = `status-${result.status || 'completed'}`;
        const statusText = this.getStatusText(result.status);
        const formatDate = (date) => {
            return new Intl.DateTimeFormat('ja-JP', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }).format(date);
        };

        return `
            <div class="analysis-card">
                <div class="analysis-header">
                    <h3>${result.listName || 'Unknown List'}</h3>
                    <span class="analysis-status ${statusClass}">${statusText}</span>
                </div>
                
                <div class="analysis-meta">
                    <span>📝 ${result.templateName || 'Unknown Template'}</span>
                    <span>📅 ${formatDate(result.createdAt)}</span>
                </div>

                <div class="analysis-summary">
                    ${this.truncateText(result.summary || 'No summary available', 120)}
                </div>

                <div class="analysis-stats">
                    <div class="stat-item">
                        <div class="stat-value">${result.tweetCount || 0}</div>
                        <div class="stat-label">ツイート数</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${result.tokensUsed || 0}</div>
                        <div class="stat-label">使用トークン</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${this.formatDuration(result.processingTime)}</div>
                        <div class="stat-label">処理時間</div>
                    </div>
                </div>

                <div class="analysis-actions">
                    <button class="btn-small btn-view" data-analysis-id="${result.id}">
                        👁️ 詳細表示
                    </button>
                    ${result.csvPath ? `
                        <button class="btn-small btn-download" data-csv-path="${result.csvPath}">
                            📥 CSV ダウンロード
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }

    getStatusText(status) {
        const statusMap = {
            'completed': '✅ 完了',
            'error': '❌ エラー',
            'processing': '🔄 処理中',
            'pending': '⏳ 待機中'
        };
        return statusMap[status] || '❓ 不明';
    }

    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    formatDuration(milliseconds) {
        if (!milliseconds) return '-';
        
        const seconds = Math.floor(milliseconds / 1000);
        if (seconds < 60) return `${seconds}s`;
        
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}m ${remainingSeconds}s`;
    }

    async showAnalysisDetail(analysisId) {
        try {
            console.log('🔍 Loading analysis detail:', analysisId);
            
            const docRef = doc(this.db, 'ai_analysis', analysisId);
            const docSnap = await getDoc(docRef);
            
            if (!docSnap.exists()) {
                this.showError('分析結果が見つかりません');
                return;
            }
            
            const data = docSnap.data();
            const result = {
                id: docSnap.id,
                ...data,
                createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt)
            };
            
            this.renderAnalysisDetail(result);
            this.openModal();
            
        } catch (error) {
            console.error('❌ Failed to load analysis detail:', error);
            this.showError('詳細の読み込みに失敗しました');
        }
    }

    renderAnalysisDetail(result) {
        const modalTitle = document.getElementById('modalTitle');
        const modalContent = document.getElementById('modalContent');
        
        modalTitle.textContent = `${result.listName} - 分析結果詳細`;
        
        const formatDate = (date) => {
            return new Intl.DateTimeFormat('ja-JP', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            }).format(date);
        };

        modalContent.innerHTML = `
            <div class="analysis-detail">
                <div class="detail-section">
                    <h4>📋 基本情報</h4>
                    <p><strong>リスト名:</strong> ${result.listName}</p>
                    <p><strong>テンプレート:</strong> ${result.templateName}</p>
                    <p><strong>ステータス:</strong> ${this.getStatusText(result.status)}</p>
                    <p><strong>実行日時:</strong> ${formatDate(result.createdAt)}</p>
                    <p><strong>分析ID:</strong> ${result.id}</p>
                </div>

                <div class="detail-section">
                    <h4>📊 統計情報</h4>
                    <p><strong>分析対象ツイート数:</strong> ${result.tweetCount || 0} 件</p>
                    <p><strong>使用トークン数:</strong> ${result.tokensUsed || 0} tokens</p>
                    <p><strong>処理時間:</strong> ${this.formatDuration(result.processingTime)}</p>
                    ${result.csvPath ? `<p><strong>CSVファイル:</strong> 生成済み</p>` : ''}
                </div>

                <div class="detail-section">
                    <h4>📝 分析結果</h4>
                    <div class="analysis-summary">
                        ${result.summary || 'No summary available'}
                    </div>
                </div>

                ${result.error ? `
                    <div class="detail-section">
                        <h4>❌ エラー情報</h4>
                        <div style="background: #f8d7da; color: #721c24; padding: 1rem; border-radius: 6px;">
                            ${result.error}
                        </div>
                    </div>
                ` : ''}

                ${result.prompt ? `
                    <div class="detail-section">
                        <h4>🤖 使用プロンプト</h4>
                        <div style="background: var(--code-bg); padding: 1rem; border-radius: 6px; font-family: monospace; white-space: pre-wrap;">
                            ${result.prompt}
                        </div>
                    </div>
                ` : ''}

                ${result.csvPath ? `
                    <div class="detail-section">
                        <h4>📥 ダウンロード</h4>
                        <button class="btn btn-primary" onclick="window.analysisResultsManager.downloadCSV('${result.csvPath}')">
                            📊 CSV形式でダウンロード
                        </button>
                    </div>
                ` : ''}
            </div>
        `;
    }

    async downloadCSV(csvPath) {
        try {
            console.log('📥 Downloading CSV:', csvPath);
            
            const response = await fetch(`/api/analysis/download?path=${encodeURIComponent(csvPath)}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = csvPath.split('/').pop() || 'analysis-result.csv';
            document.body.appendChild(a);
            a.click();
            
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            console.log('✅ CSV download started');
            
        } catch (error) {
            console.error('❌ Failed to download CSV:', error);
            this.showError('CSVダウンロードに失敗しました');
        }
    }

    updatePagination(resultCount) {
        const pagination = document.getElementById('pagination');
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');
        const pageInfo = document.getElementById('pageInfo');
        
        const hasResults = resultCount > 0;
        const hasMore = resultCount === this.pageSize;
        
        pagination.style.display = hasResults ? 'flex' : 'none';
        
        if (hasResults) {
            prevBtn.disabled = this.currentPage <= 1;
            nextBtn.disabled = !hasMore;
            pageInfo.textContent = `ページ ${this.currentPage}`;
        }
    }

    openModal() {
        const modalOverlay = document.getElementById('modalOverlay');
        modalOverlay.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }

    closeModal() {
        const modalOverlay = document.getElementById('modalOverlay');
        modalOverlay.style.display = 'none';
        document.body.style.overflow = 'auto';
    }

    // リアルタイム更新機能
    startRealtimeUpdates() {
        // Firestoreリアルタイムリスナー設定
        this.setupRealtimeListener();
        
        // 定期的な完全リフレッシュ（5分間隔）
        this.refreshInterval = setInterval(() => {
            console.log('🔄 Performing scheduled refresh...');
            this.loadAnalysisResults();
        }, 5 * 60 * 1000);
        
        console.log('✅ Realtime updates started');
    }

    setupRealtimeListener() {
        if (!this.db) return;
        
        try {
            // 最新10件の分析結果をリアルタイムで監視
            const realtimeQuery = query(
                collection(this.db, 'ai_analysis'),
                orderBy('createdAt', 'desc'),
                limit(10)
            );
            
            this.realtimeListener = onSnapshot(realtimeQuery, (snapshot) => {
                const changes = snapshot.docChanges();
                let hasUpdates = false;
                
                changes.forEach((change) => {
                    if (change.type === 'added' || change.type === 'modified') {
                        hasUpdates = true;
                        const data = change.doc.data();
                        console.log(`🔔 Realtime update: ${change.type} - ${data.listName || 'Unknown'}`);
                    }
                });
                
                if (hasUpdates && this.currentPage === 1) {
                    console.log('📱 Updating first page with realtime data...');
                    this.loadAnalysisResults();
                }
            }, (error) => {
                console.error('❌ Realtime listener error:', error);
                // リスナーエラー時は定期リフレッシュにフォールバック
                this.fallbackToPolling();
            });
            
            console.log('👂 Realtime listener established');
            
        } catch (error) {
            console.error('❌ Failed to setup realtime listener:', error);
            this.fallbackToPolling();
        }
    }

    fallbackToPolling() {
        console.log('⏰ Falling back to polling mode...');
        
        // 既存の定期リフレッシュを高頻度に変更（1分間隔）
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        
        this.refreshInterval = setInterval(() => {
            console.log('🔄 Performing polling refresh...');
            this.loadAnalysisResults();
        }, 60 * 1000);
    }

    stopRealtimeUpdates() {
        if (this.realtimeListener) {
            this.realtimeListener();
            this.realtimeListener = null;
            console.log('🛑 Realtime listener stopped');
        }
        
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
            console.log('🛑 Refresh interval stopped');
        }
    }

    // ページ離脱時のクリーンアップ
    cleanup() {
        this.stopRealtimeUpdates();
    }

    showLoading(show) {
        const loadingState = document.getElementById('loadingState');
        const analysisGrid = document.getElementById('analysisGrid');
        
        loadingState.style.display = show ? 'block' : 'none';
        analysisGrid.style.display = show ? 'none' : 'grid';
    }

    showError(message) {
        alert(`エラー: ${message}`);
        console.error('Error:', message);
    }
}

// グローバルに公開してモーダルからアクセス可能にする
window.analysisResultsManager = new AnalysisResultsManager();

// ページ離脱時のクリーンアップ
window.addEventListener('beforeunload', () => {
    if (window.analysisResultsManager) {
        window.analysisResultsManager.cleanup();
    }
});

// ページの可視性変更でリアルタイム更新を制御
document.addEventListener('visibilitychange', () => {
    if (window.analysisResultsManager) {
        if (document.hidden) {
            console.log('🌙 Page hidden, stopping realtime updates');
            window.analysisResultsManager.stopRealtimeUpdates();
        } else {
            console.log('🌞 Page visible, starting realtime updates');
            window.analysisResultsManager.startRealtimeUpdates();
            // 再表示時は即座にリフレッシュ
            window.analysisResultsManager.loadAnalysisResults();
        }
    }
});