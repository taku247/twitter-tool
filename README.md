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

This application is configured for Vercel deployment with:
- `vercel.json` configuration
- Environment variables setup
- Node.js runtime support

## License

MIT