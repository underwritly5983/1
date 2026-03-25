================================================================================
WHY YOU STILL SEE 405
================================================================================

Your IFTA site is a VITE app (like React + Vite), not Next.js.

• A file named route.ts under app/… does nothing useful for Vite on Vercel.
• GET on /api/ingest/… returns the normal website HTML (that is why GET = 200).
• POST was never implemented → 405 Method Not Allowed.

You need ONE small server file in the Vercel “api” folder (same idea as the
Underwritly landing project).

================================================================================
WHAT TO DO (3 STEPS)
================================================================================

STEP 1 — Open your IFTA project folder (the one you deploy to Vercel).

STEP 2 — Create folders and copy ONE file from this landing repo:

  From (landing project):
    integrations\add-to-ifta-project\api\ingest\underwritly-insured.js

  To (IFTA project), create folders api\ingest\ and put the file here:
    api\ingest\underwritly-insured.js

  So next to package.json you have:  api\ingest\underwritly-insured.js

STEP 3 — Commit, push, redeploy the IFTA project on Vercel.

================================================================================
AFTER THAT
================================================================================

Do not change the URL on the landing site. It should stay:

  https://ifta-dev-underwritly.vercel.app/api/ingest/underwritly-insured

Optional: remove any wrong Next.js folders you added earlier (app\api\…\route.ts)
so they do not confuse you — only the api\ingest\underwritly-insured.js file is
needed for Vite + Vercel.

================================================================================
