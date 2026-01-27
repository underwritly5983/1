# IFTA Summarizer Pro

**Tagline:** *"Transform IFTA Reports into Actionable Insights in Minutes"*

A professional-grade application designed specifically for commercial insurance transportation brokers to streamline IFTA report processing, summarization, and analysis.

## Features

- 🤖 **AI-Powered Summarization** - Automatically extract and summarize key data from IFTA reports
- 📊 **Quarter Detection** - Intelligent quarter identification from document content
- 🎨 **Custom Branding** - White-label reports with your company logo and colors
- 📈 **Analytics Dashboard** - Track usage and generate insights
- 💳 **Flexible Pricing** - Free tier with premium upgrades
- 🔔 **Smart Notifications** - Automated reminders and alerts
- 👥 **Admin Console** - Comprehensive user and usage management

## Tech Stack

- **Frontend:** React + Tailwind CSS
- **Backend:** Node.js + Express
- **Database:** PostgreSQL
- **Deployment:** Vercel + Docker
- **AI:** OpenAI API for document processing

## Quick Start

### Option 1: Docker (Recommended)

**Windows:**
```powershell
.\start-docker.ps1
```

**Mac/Linux:**
```bash
chmod +x start-docker.sh
./start-docker.sh
```

**Or manually:**
```bash
# Create .env file with your OpenAI API key
docker-compose -f docker-compose.dev.yml up --build
```

Access the app at:
- Frontend: http://localhost:3000
- Backend: http://localhost:5000

### Option 2: Local Development

1. Install dependencies:
```bash
npm run install-all
```

2. Set up environment variables (see `server/.env.example`)

3. Start PostgreSQL (or use Docker):
```bash
docker-compose up -d postgres
```

4. Start development:
```bash
npm run dev
```

5. Build for production:
```bash
npm run build
```

## Docker

For development with hot-reload:
```bash
docker-compose -f docker-compose.dev.yml up --build
```

For production:
```bash
docker-compose up -d --build
```

See `DOCKER_SETUP.md` for detailed Docker instructions.

## License

MIT
