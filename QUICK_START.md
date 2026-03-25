# Quick Start Guide - Docker

## 🚀 Get Running in 3 Steps

### Step 1: Create Environment File

Create a `.env` file in the root directory:

```env
JWT_SECRET=your-random-secret-key-here
OPENAI_API_KEY=sk-your-openai-api-key
```

**Quick generate JWT_SECRET:**
- Windows PowerShell: `-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})`
- Mac/Linux: `openssl rand -base64 32`

### Step 2: Start Docker

**Easiest (Windows):** Double-click `start-docker.ps1` or run in PowerShell:
```powershell
.\start-docker.ps1
```

**Or run manually:**
```powershell
# Windows (from project folder)
docker compose -f docker-compose.dev.yml up --build
```
If you get "compose is not a docker command", use: `docker-compose -f docker-compose.dev.yml up --build`

**Mac/Linux:**
```bash
docker compose -f docker-compose.dev.yml up --build
```

Wait until you see **VITE ready** and **Server running on port 5000**, then:

### Step 3: Access the project

Open in your browser: **http://localhost:3000**

- **App (frontend):** http://localhost:3000  
- **API (backend):** http://localhost:5000/api/health

---

## ✅ Verify It's Working

1. **Frontend:** http://localhost:3000 - Should show the home page
2. **Backend API:** http://localhost:5000/api/health - Should return `{"status":"ok"}`
3. **Database:** Running in Docker (port 5432)

## 🔍 Troubleshooting

### Port 3000 Already in Use

```bash
# Find what's using port 3000
# Windows
netstat -ano | findstr :3000

# Mac/Linux
lsof -ti:3000

# Kill it or change port in docker-compose.dev.yml
```

### Client Not Loading

1. Check if container is running:
   ```bash
   docker ps
   ```

2. Check client logs:
   ```bash
   docker-compose -f docker-compose.dev.yml logs client
   ```

3. Rebuild if needed:
   ```bash
   docker-compose -f docker-compose.dev.yml up --build --force-recreate client
   ```

### Database Connection Error

Wait for database to be healthy (check with `docker ps`), then restart server:
```bash
docker-compose -f docker-compose.dev.yml restart server
```

### Can't Connect to Backend

Check server logs:
```bash
docker-compose -f docker-compose.dev.yml logs server
```

Verify server is running:
```bash
curl http://localhost:5000/api/health
```

## 📝 First Time Setup

1. **Register an account** at http://localhost:3000/register
2. **Upload your company logo** (optional)
3. **Set brand colors** (optional)
4. **Upload your first IFTA report** at http://localhost:3000/reports/upload

## 🛑 Stop Services

```bash
docker-compose -f docker-compose.dev.yml down
```

To also remove database data:
```bash
docker-compose -f docker-compose.dev.yml down -v
```

## 📚 More Help

- See `DOCKER_SETUP.md` for detailed Docker instructions
- See `SETUP.md` for local development setup
- See `PROJECT_SUMMARY.md` for feature overview
