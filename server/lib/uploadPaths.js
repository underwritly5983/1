const fs = require('fs');
const path = require('path');

/**
 * Writable upload root. On Vercel only /tmp is reliable; local dev uses ./uploads.
 * Mirrors server/index.js — use for multer and any fs writes under uploads/.
 */
function getUploadsRoot() {
  if (process.env.UPLOAD_DIR) {
    return path.normalize(process.env.UPLOAD_DIR).replace(/[/\\]+$/, '');
  }
  if (process.env.VERCEL) {
    return '/tmp/uploads';
  }
  return path.join(process.cwd(), 'uploads');
}

/**
 * Resolve a DB-stored file_path to a readable absolute path.
 * Handles absolute paths, cwd-relative legacy paths, and basename under uploads/reports/.
 */
function resolveStoredUploadPath(storedPath) {
  if (!storedPath || typeof storedPath !== 'string') return null;
  const s = storedPath.trim();
  if (!s) return null;
  try {
    if (fs.existsSync(s)) return path.resolve(s);
  } catch (_) {
    /* ignore */
  }
  const base = path.basename(s.replace(/\\/g, '/'));
  const root = getUploadsRoot();
  const candidates = [
    path.join(root, 'reports', base),
    path.join(root, base)
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch (_) {
      /* ignore */
    }
  }
  return s;
}

module.exports = { getUploadsRoot, resolveStoredUploadPath };
