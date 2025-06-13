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

## License

MIT