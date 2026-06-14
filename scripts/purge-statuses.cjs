/* Talk2Me — Cron purge des STATUTS expirés (>24 h). Pascal 2026-06-09.
 * Lancé par PM2 (cron horaire). Supprime en DB les statuts dont expires_at < now.
 */
const Database = require('better-sqlite3');
const DB = '/home/ubuntu/talktome/data/talktome.db';

try {
  const db = new Database(DB);
  // La table peut ne pas exister si aucun statut n'a encore été créé.
  const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='statuses'").get();
  if (exists) {
    const info = db.prepare('DELETE FROM statuses WHERE expires_at < ?').run(Date.now());
    console.log(`[purge-statuses] ${new Date().toISOString()} — ${info.changes} statut(s) expiré(s) supprimé(s)`);
  } else {
    console.log('[purge-statuses] table statuses absente, rien à purger');
  }
  db.close();
} catch (e) {
  console.error('[purge-statuses] erreur', e && e.message);
  process.exit(1);
}
