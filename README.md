# Twitter Analytics Tool

AI-powered Twitter analytics dashboard using TwitterAPI.io and OpenAI ChatGPT.

## Features

- 🔍 **Advanced Tweet Search** with filters (language, date, RT exclusion)
- 📎 **Manual Tweet Addition** via URL input  
- 🤖 **AI Analysis** powered by ChatGPT
- 🕒 **JST Timezone Support** for Japanese users
- 🔗 **Click-to-View** tweets directly from the dashboard

## Tech Stack

- **Backend**: Node.js, Express.js
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **APIs**: TwitterAPI.io, OpenAI GPT-4
- **Deployment**: Vercel

## Environment Variables

Create a `.env` file with:

```
TWITTER_API_KEY=your_twitterapi_io_key
OPENAI_API_KEY=your_openai_api_key
```

## Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Production start
npm start
```

## API Endpoints

### Twitter
- `POST /api/twitter/search` - Advanced tweet search
- `POST /api/twitter/tweet` - Single tweet by ID
- `POST /api/twitter/list` - List tweets

### AI Analysis
- `POST /api/openai/test` - ChatGPT analysis
- `POST /api/twitter/summarize` - Tweet summarization

### Utilities
- `GET /api/health` - Health check

## Deployment

This application is deployed on Vercel with automatic deployment configured.

### Production URL
🌐 **https://twitter-tool-eight.vercel.app**

### Deployment Workflow

#### Automatic Deployment
- **main branch** → Production environment (twitter-tool-eight.vercel.app)
- **Other branches** → Preview environments (temporary URLs)

#### Development Process
1. **Create feature branch**
   ```bash
   git checkout -b feature/your-feature
   # Make changes
   git push origin feature/your-feature
   ```
   → Creates preview deployment with unique URL

2. **Create Pull Request**
   - Vercel automatically comments with preview URL
   - Test changes in preview environment

3. **Merge to main**
   ```bash
   git checkout main
   git merge feature/your-feature
   git push origin main
   ```
   → Automatically deploys to production

#### Viewing Deployments
- **Vercel Dashboard**: https://vercel.com/dashboard → twitter-tool → Deployments tab
- **GitHub PR Comments**: Preview URLs posted automatically
- **GitHub Commit Status**: Check results with deployment links

### Configuration
- `vercel.json` - Vercel deployment configuration
- Environment variables setup in Vercel dashboard
- Node.js runtime support

## Webhook Development with ngrok

### Prerequisites

1. **Install ngrok**
   ```bash
   # Using Homebrew (recommended)
   brew install ngrok
   
   # Or download from https://ngrok.com/download
   ```

2. **Configure ngrok authtoken**
   ```bash
   ngrok config add-authtoken YOUR_AUTHTOKEN
   ```

### Development Setup

1. **Start the development server**
   ```bash
   npm run dev
   ```
   Server will run on `http://localhost:3002`

2. **Start ngrok tunnel** (in a separate terminal)
   ```bash
   ngrok http 3002
   ```
   
3. **Get the ngrok URL**
   Look for the forwarding URL in the output:
   ```
   Forwarding  https://abc123.ngrok-free.app -> http://localhost:3002
   ```

### Testing Webhook Functionality

#### Test Webhook Endpoint
```bash
curl -X POST https://YOUR_NGROK_URL.ngrok-free.app/webhook/test \
  -H "Content-Type: application/json" \
  -d '{"test": "hello from ngrok"}'
```

Expected response:
```json
{"success":true,"message":"Test webhook received"}
```

#### Monitor ngrok Traffic
- Open ngrok web interface: `http://127.0.0.1:4040`
- View real-time requests and responses

### Real-time Monitoring Dashboard

Access the real-time Twitter monitoring dashboard:
- **Local**: http://localhost:3002/realtime-monitor.html
- **ngrok**: https://YOUR_NGROK_URL.ngrok-free.app/realtime-monitor.html

### Available Webhook Endpoints

1. **Test Webhook**
   ```
   POST /webhook/test
   ```
   For testing webhook connectivity

2. **Twitter Webhook**
   ```
   POST /webhook/twitter
   ```
   For receiving Twitter data from TwitterAPI.io

### TwitterAPI.io Webhook Configuration

Use the following URL for TwitterAPI.io webhook setup:
```
https://YOUR_NGROK_URL.ngrok-free.app/webhook/twitter
```

### Monitoring Features

#### Hybrid Monitoring Options
1. **WebSocket Monitoring**: `📡 WebSocket監視開始`
2. **Hybrid Monitoring**: `🔄 ハイブリッド監視開始` (WebSocket + Polling)
3. **Webhook Rule Setup**: `🌐 Webhookルール追加`
4. **Rule Activation**: `🔥 ルール有効化`

#### Debug Functions
- `🛠️ RESTルール追加テスト`: Test REST API functionality
- `📋 ルール一覧確認`: Check existing filter rules
- `🔗 接続状態確認`: Check connection status
- `🗑️ ログクリア`: Clear debug logs

### Common Issues

#### ngrok Connection Issues
If you see "endpoint is offline":
1. Ensure server is running on port 3002
2. Check ngrok tunnel is active
3. Verify the correct ngrok URL (should end with `.ngrok-free.app`)

#### Webhook Not Receiving Data
1. Check TwitterAPI.io webhook URL configuration
2. Verify webhook rule is activated (`is_effect: 1`)
3. Monitor ngrok web interface for incoming requests

### Development Workflow

1. **Start development environment**
   ```bash
   # Terminal 1: Start server
   npm run dev
   
   # Terminal 2: Start ngrok
   ngrok http 3002
   ```

2. **Configure webhooks**
   - Copy ngrok URL
   - Set up TwitterAPI.io webhook rules
   - Test with curl commands

3. **Monitor real-time activity**
   - Open real-time dashboard
   - Start monitoring for target Twitter accounts
   - Verify webhook data reception

## License

MIT