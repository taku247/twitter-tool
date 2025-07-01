// 環境変数の検証とデフォルト値設定
const requiredEnvVars = [
    'TWITTER_API_KEY',
    'FIREBASE_API_KEY',
    'FIREBASE_AUTH_DOMAIN',
    'FIREBASE_PROJECT_ID',
    'FIREBASE_STORAGE_BUCKET',
    'FIREBASE_MESSAGING_SENDER_ID',
    'FIREBASE_APP_ID'
];

const optionalEnvVars = {
    'NODE_ENV': 'development',
    'PORT': '3000',
    'WORKER_SECRET': 'development-secret-change-in-production',
    'DISCORD_WEBHOOK_URL': '',
    'OPENAI_API_KEY': '',
    'FIREBASE_MEASUREMENT_ID': ''
};

function validateEnvironment() {
    const missing = [];
    const warnings = [];
    
    // 必須環境変数のチェック
    for (const envVar of requiredEnvVars) {
        if (!process.env[envVar]) {
            missing.push(envVar);
        }
    }
    
    // オプション環境変数のデフォルト設定
    for (const [envVar, defaultValue] of Object.entries(optionalEnvVars)) {
        if (!process.env[envVar]) {
            process.env[envVar] = defaultValue;
            if (defaultValue) {
                warnings.push(`${envVar} not set, using default: ${defaultValue}`);
            }
        }
    }
    
    // 結果レポート
    if (missing.length > 0) {
        console.error('❌ Missing required environment variables:');
        missing.forEach(envVar => console.error(`   - ${envVar}`));
        console.error('\n💡 Please set these environment variables in Railway Dashboard');
        console.error('   Project → Settings → Variables');
        return false;
    }
    
    if (warnings.length > 0) {
        console.warn('⚠️  Using default values for:');
        warnings.forEach(warning => console.warn(`   - ${warning}`));
    }
    
    console.log('✅ Environment validation passed');
    return true;
}

// 開発環境での環境変数デバッグ
function debugEnvironment() {
    if (process.env.NODE_ENV === 'development') {
        console.log('\n🔍 Environment Debug Info:');
        console.log(`Node Version: ${process.version}`);
        console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
        console.log(`PORT: ${process.env.PORT}`);
        console.log(`Firebase Project: ${process.env.FIREBASE_PROJECT_ID || 'NOT SET'}`);
        console.log(`Worker Secret: ${process.env.WORKER_SECRET ? 'SET' : 'NOT SET'}`);
        console.log(`Twitter API: ${process.env.TWITTER_API_KEY ? 'SET' : 'NOT SET'}`);
        console.log(`OpenAI API: ${process.env.OPENAI_API_KEY ? 'SET' : 'NOT SET'}`);
        console.log(`Discord Webhook: ${process.env.DISCORD_WEBHOOK_URL ? 'SET' : 'NOT SET'}\n`);
    }
}

module.exports = {
    validateEnvironment,
    debugEnvironment,
    requiredEnvVars,
    optionalEnvVars
};