# Underwritly landing page

Static site — deploys cleanly to **Vercel** with no build step.

## Local preview

```powershell
Set-Location "path\to\LANDING PAGE"
npm start
```

Or: `npx --yes serve -l 3456 .` — open the URL shown (e.g. `http://localhost:3456`).

---

## Deploy on Vercel (first time)

Vercel needs **your account** — this repo is ready; you complete the login and domain steps in the dashboard or CLI.

### Option A — Git + Vercel dashboard (recommended)

1. **Create a Git repository** (GitHub, GitLab, or Bitbucket) and push this project:

   ```powershell
   cd "path\to\LANDING PAGE"
   git init
   git add .
   git commit -m "Initial commit: Underwritly landing"
   ```

   Create an empty repo on GitHub, then:

   ```powershell
   git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
   git branch -M main
   git push -u origin main
   ```

2. **Import in Vercel:** [vercel.com/new](https://vercel.com/new) → **Add New Project** → pick the repo.

3. **Settings to use:**

   - **Framework Preset:** Other  
   - **Root Directory:** `.` (leave default if the repo is only this site)  
   - **Build Command:** *(leave empty)*  
   - **Output Directory:** *(leave empty — not used for static HTML at repo root)*  

4. Click **Deploy**. Your site gets a `*.vercel.app` URL.

### Option B — Vercel CLI

```powershell
npm i -g vercel
cd "path\to\LANDING PAGE"
vercel login
vercel
```

Follow prompts. Production: `vercel --prod`.

---

## Connect your custom domain

1. In Vercel: open your project → **Settings** → **Domains**.
2. Enter your domain (e.g. `underwritly.com` and `www.underwritly.com`).
3. Vercel shows **DNS records** to add at your registrar (usually one **A** or **CNAME** for apex, and **CNAME** for `www`).

Typical patterns:

- **Subdomain** (`www`): add a **CNAME** from `www` to `cname.vercel-dns.com` (or the host Vercel shows).
- **Apex** (`example.com`): add the **A** records to Vercel’s IPs shown in the UI, or use your registrar’s **ALIAS/ANAME** to Vercel if supported.

4. Wait for DNS to propagate (often minutes, sometimes up to 48 hours). Vercel issues **HTTPS** automatically once the domain verifies.

**If you use Cloudflare:** proxy can stay on (“orange cloud”) for most setups; if verification fails, try DNS-only (grey cloud) until the domain is verified.

---

## What you must provide (cannot be automated here)

| Item | Why |
|------|-----|
| **Vercel login** | Deployments are tied to your account. |
| **Git host login** (if using Git deploy) | To create the repo and push. |
| **Registrar / DNS access** | To add the records Vercel gives you for your domain. |

If you use **team/organization** billing or **environment variables** later, configure those in the Vercel project settings.

---

## Form behavior

The early-access form validates in the browser and logs submissions to the console as `[Underwritly early access]`. To store leads in production, connect a serverless function, Formspree, or another backend.
