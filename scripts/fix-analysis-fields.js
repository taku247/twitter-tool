const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, writeBatch, doc, query, where } = require('firebase/firestore');
require('dotenv').config();

async function fixAnalysisFields() {
    const firebaseConfig = {
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: process.env.FIREBASE_AUTH_DOMAIN,
        projectId: process.env.FIREBASE_PROJECT_ID,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.FIREBASE_APP_ID,
        measurementId: process.env.FIREBASE_MEASUREMENT_ID
    };

    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    try {
        console.log('🔍 Searching for tweets without analysis field...');
        
        // まずFixed Database Test Listのツイートを取得
        const snapshot = await getDocs(
            query(
                collection(db, 'collected_tweets'),
                where('sourceId', '==', 'list-1751126677056-ifnqreddr')
            )
        );

        console.log(`📊 Found ${snapshot.size} tweets for Fixed Database Test List`);

        let batchCount = 0;
        let batch = writeBatch(db);
        let updatedCount = 0;

        snapshot.forEach((docSnapshot) => {
            const data = docSnapshot.data();
            
            // analysisフィールドがないかanalyzedプロパティがない場合
            if (!data.analysis || typeof data.analysis.analyzed === 'undefined') {
                batch.update(docSnapshot.ref, {
                    'analysis.analyzed': false,
                    'analysis.analyzedAt': null
                });
                updatedCount++;
                batchCount++;

                console.log(`🔄 Updating tweet ${data.tweetId}: adding analysis field`);

                // バッチサイズ制限（500件）
                if (batchCount >= 400) {
                    console.log(`💾 Committing batch of ${batchCount} updates...`);
                    batch.commit();
                    batch = writeBatch(db);
                    batchCount = 0;
                }
            }
        });

        // 残りのバッチをコミット
        if (batchCount > 0) {
            console.log(`💾 Committing final batch of ${batchCount} updates...`);
            await batch.commit();
        }

        console.log(`✅ Successfully updated ${updatedCount} tweets`);

        // 更新後のカウントを確認
        const afterSnapshot = await getDocs(
            query(
                collection(db, 'collected_tweets'),
                where('sourceId', '==', 'list-1751126677056-ifnqreddr'),
                where('analysis.analyzed', '==', false)
            )
        );

        console.log(`📊 Unanalyzed tweets count: ${afterSnapshot.size}`);

    } catch (error) {
        console.error('❌ Error fixing analysis fields:', error);
    }
}

fixAnalysisFields();