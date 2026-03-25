# How to Access the Project

## Start the app

1. **From the project folder** in PowerShell:
   ```powershell
   .\start-docker.ps1
   ```
   Or: `docker compose -f docker-compose.dev.yml up --build`

2. **Wait** until you see:
   - `VITE ready` and `Local: http://localhost:3000`
   - `Server running on port 5000`

3. **Open in your browser:**  
   **http://localhost:3000**

---

## URLs

| What        | URL                          |
|------------|-------------------------------|
| **App**    | http://localhost:3000         |
| **API**    | http://localhost:5000/api     |
| **Health** | http://localhost:5000/api/health |

---

## Still can't access?

- **Port 3000 or 5000 in use?** Stop other apps using those ports or change ports in `docker-compose.dev.yml`.
- **Containers not running?** Run `docker ps` — you should see `ifta_client`, `ifta_server`, `ifta_postgres`. If not, run the start command again.
- **Blank or error page?** Wait 10–15 seconds after start for Vite and the server to be ready, then refresh.
- **API errors in browser?** Check backend: http://localhost:5000/api/health — should return `{"status":"ok"}`.

See **QUICK_START.md** and **LOGIN_TROUBLESHOOTING.md** for more.
