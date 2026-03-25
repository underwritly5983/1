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

module.exports = { getUploadsRoot };
