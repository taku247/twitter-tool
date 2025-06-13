// Firestore Templates Service
import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDocs, 
  getDoc,
  onSnapshot,
  orderBy,
  query,
  where,
  Timestamp 
} from 'https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js';

// Firestoreテンプレート用の型定義（JSDocコメント）
/**
 * @typedef {Object} FirebasePromptTemplate
 * @property {string} [id] - ドキュメントID
 * @property {string} name - テンプレート名
 * @property {string} content - プロンプト内容
 * @property {boolean} isDefault - デフォルトテンプレートかどうか
 * @property {Timestamp} createdAt - 作成日時
 * @property {Timestamp} updatedAt - 更新日時
 */

export class FirestoreTemplatesService {
  
  // コレクション名
  static COLLECTION_NAME = 'prompt-templates';
  
  // 日次使用量追跡（簡易版）
  static dailyUsage = {
    date: new Date().toDateString(),
    writes: 0,
    reads: 0
  };
  
  // 使用量をリセット（日付変更時）
  static checkDailyReset() {
    const today = new Date().toDateString();
    if (this.dailyUsage.date !== today) {
      this.dailyUsage = { date: today, writes: 0, reads: 0 };
      console.log('🔄 Firebase使用量カウンターをリセットしました');
    }
  }
  
  // 使用量を追跡
  static trackUsage(operation, count = 1) {
    this.checkDailyReset();
    this.dailyUsage[operation === 'read' ? 'reads' : 'writes'] += count;
    
    const remaining = 20000 - this.dailyUsage.writes;
    if (remaining < 1000) {
      console.warn(`⚠️ Firebase書き込み制限接近: 残り${remaining}回`);
    }
  }
  
  // 使用量確認
  static getDailyUsage() {
    this.checkDailyReset();
    return { ...this.dailyUsage };
  }

  // === テンプレート管理 ===

  /**
   * テンプレート追加
   * @param {Omit<FirebasePromptTemplate, 'id' | 'createdAt' | 'updatedAt'>} templateData 
   * @returns {Promise<string>} ドキュメントID
   */
  static async addTemplate(templateData) {
    try {
      const db = window.firebaseAuth.db;
      const now = Timestamp.now();
      
      const docRef = await addDoc(collection(db, this.COLLECTION_NAME), {
        ...templateData,
        createdAt: now,
        updatedAt: now
      });
      
      this.trackUsage('write');
      console.log('🔥 Firestore: テンプレート追加成功', docRef.id);
      return docRef.id;
    } catch (error) {
      console.error('❌ Firestore: テンプレート追加失敗', error);
      throw error;
    }
  }

  /**
   * テンプレート更新
   * @param {string} templateId 
   * @param {Partial<FirebasePromptTemplate>} updates 
   */
  static async updateTemplate(templateId, updates) {
    try {
      const db = window.firebaseAuth.db;
      const templateRef = doc(db, this.COLLECTION_NAME, templateId);
      
      await updateDoc(templateRef, {
        ...updates,
        updatedAt: Timestamp.now()
      });
      
      this.trackUsage('write');
      console.log('🔥 Firestore: テンプレート更新成功', templateId);
    } catch (error) {
      console.error('❌ Firestore: テンプレート更新失敗', error);
      throw error;
    }
  }

  /**
   * テンプレート削除
   * @param {string} templateId 
   */
  static async deleteTemplate(templateId) {
    try {
      const db = window.firebaseAuth.db;
      await deleteDoc(doc(db, this.COLLECTION_NAME, templateId));
      
      this.trackUsage('write');
      console.log('🔥 Firestore: テンプレート削除成功', templateId);
    } catch (error) {
      console.error('❌ Firestore: テンプレート削除失敗', error);
      throw error;
    }
  }

  /**
   * 全テンプレート取得
   * @returns {Promise<FirebasePromptTemplate[]>}
   */
  static async getAllTemplates() {
    try {
      const db = window.firebaseAuth.db;
      const q = query(collection(db, this.COLLECTION_NAME), orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const templates = [];
      
      querySnapshot.forEach((doc) => {
        templates.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      this.trackUsage('read', templates.length);
      console.log('🔥 Firestore: テンプレート取得成功', templates.length + '件');
      return templates;
    } catch (error) {
      console.error('❌ Firestore: テンプレート取得失敗', error);
      throw error;
    }
  }

  /**
   * デフォルトテンプレート取得
   * @returns {Promise<FirebasePromptTemplate|null>}
   */
  static async getDefaultTemplate() {
    try {
      const db = window.firebaseAuth.db;
      const q = query(
        collection(db, this.COLLECTION_NAME), 
        where('isDefault', '==', true)
      );
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        this.trackUsage('read');
        return {
          id: doc.id,
          ...doc.data()
        };
      }
      
      return null;
    } catch (error) {
      console.error('❌ Firestore: デフォルトテンプレート取得失敗', error);
      throw error;
    }
  }

  /**
   * デフォルトテンプレート設定
   * @param {string} templateId 
   */
  static async setDefaultTemplate(templateId) {
    try {
      const db = window.firebaseAuth.db;
      
      // 全テンプレートのデフォルトを解除
      const allTemplates = await this.getAllTemplates();
      const updatePromises = allTemplates
        .filter(template => template.isDefault)
        .map(template => this.updateTemplate(template.id, { isDefault: false }));
      
      await Promise.all(updatePromises);
      
      // 指定されたテンプレートをデフォルトに設定
      await this.updateTemplate(templateId, { isDefault: true });
      
      console.log('🔥 Firestore: デフォルトテンプレート設定成功', templateId);
    } catch (error) {
      console.error('❌ Firestore: デフォルトテンプレート設定失敗', error);
      throw error;
    }
  }

  /**
   * テンプレートの変更をリアルタイム監視
   * @param {function(FirebasePromptTemplate[]): void} callback 
   * @returns {function} unsubscribe function
   */
  static subscribeToTemplates(callback) {
    try {
      const db = window.firebaseAuth.db;
      const q = query(collection(db, this.COLLECTION_NAME), orderBy('createdAt', 'desc'));
      
      return onSnapshot(q, (querySnapshot) => {
        const templates = [];
        querySnapshot.forEach((doc) => {
          templates.push({
            id: doc.id,
            ...doc.data()
          });
        });
        
        console.log('🔥 Firestore: テンプレートリアルタイム更新', templates.length + '件');
        callback(templates);
      });
    } catch (error) {
      console.error('❌ Firestore: リアルタイム監視失敗', error);
      throw error;
    }
  }

  /**
   * 初期デフォルトテンプレートを作成
   */
  static async initializeDefaultTemplates() {
    try {
      // 既存のテンプレートをチェック
      const existingTemplates = await this.getAllTemplates();
      if (existingTemplates.length > 0) {
        console.log('🔥 Firestore: 既存テンプレートあり、初期化スキップ');
        return;
      }

      console.log('🔥 Firestore: 初期テンプレートを作成中...');

      // デフォルトテンプレートを作成
      const defaultTemplates = [
        {
          name: 'トレンド分析',
          content: `以下のツイートを分析してください：

1. 主要なトピックと傾向
2. 感情の分析
3. 注目すべき意見や発言
4. 全体的な要約

分析対象のツイート:`,
          isDefault: true
        },
        {
          name: '感情分析特化',
          content: `以下のツイートの感情を詳しく分析してください：

1. 全体的な感情（ポジティブ/ネガティブ/ニュートラル）
2. 主要な感情の種類と強度
3. 感情の分布と傾向
4. 特徴的な表現や言葉遣い

分析対象のツイート:`,
          isDefault: false
        }
      ];

      const promises = defaultTemplates.map(template => this.addTemplate(template));
      await Promise.all(promises);

      console.log('✅ Firestore: 初期テンプレート作成完了');
    } catch (error) {
      console.error('❌ Firestore: 初期テンプレート作成失敗', error);
      throw error;
    }
  }

  /**
   * 重複テンプレート名チェック
   * @param {string} name 
   * @param {string} [excludeId] - 除外するテンプレートID（編集時用）
   * @returns {Promise<boolean>}
   */
  static async checkDuplicateName(name, excludeId = null) {
    try {
      const db = window.firebaseAuth.db;
      const q = query(
        collection(db, this.COLLECTION_NAME), 
        where('name', '==', name)
      );
      const querySnapshot = await getDocs(q);
      
      // 除外IDがある場合（編集時）は、そのID以外で重複をチェック
      if (excludeId) {
        return querySnapshot.docs.some(doc => doc.id !== excludeId);
      }
      
      return !querySnapshot.empty;
    } catch (error) {
      console.error('❌ Firestore: 重複チェック失敗', error);
      return false;
    }
  }
}

// グローバルに公開
window.FirestoreTemplatesService = FirestoreTemplatesService;