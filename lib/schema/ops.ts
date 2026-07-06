/**
 * lib/schema/ops — LOGS & COÛTS du cockpit (Pascal 2026-06-30). Données RÉELLES :
 * processus PM2 (statut/mém/CPU/uptime/restarts), dernières erreurs des logs, taille
 * des bases sur disque. HONNÊTE sur le monétaire : ce qui n'est pas instrumenté est
 * marqué « non instrumenté » — jamais de chiffre inventé (doctrine grounding).
 * Node runtime ; fail-soft (si pm2 indisponible, on le dit).
 */
import { execSync } from 'node:child_process';
import { readFileSync, statSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { llmUsageStats, type LlmStats } from '@/lib/schema/llm-usage';

export interface ProcInfo { name: string; status: string; cpu: number; memoryMB: number; uptimeH: number; restarts: number }
export interface ErrLine { app: string; line: string }
export interface DbSize { name: string; mb: number }
export interface CostItem { service: string; basis: string; measured: boolean; value?: string; note: string }

function pm2Json(): any[] | null {
  try {
    const out = execSync('pm2 jlist', { encoding: 'utf8', timeout: 6000 });
    const arr = JSON.parse(out);
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}

function tailLines(file: string, n: number): string[] {
  try {
    if (!file || !existsSync(file)) return [];
    const txt = readFileSync(file, 'utf8');
    return txt.split('\n').filter((l) => l.trim().length > 0).slice(-n);
  } catch {
    return [];
  }
}

export interface OpsSnapshot {
  pm2Ok: boolean;
  procs: ProcInfo[];
  errors: ErrLine[];
  dbs: DbSize[];
  uploadsMB: number | null;
  costs: CostItem[];
  llm: LlmStats;
}

export function gatherOps(): OpsSnapshot {
  const arr = pm2Json();
  const now = Date.now();
  const procs: ProcInfo[] = [];
  const errors: ErrLine[] = [];

  if (arr) {
    for (const p of arr) {
      procs.push({
        name: p.name,
        status: p.pm2_env?.status ?? '?',
        cpu: p.monit?.cpu ?? 0,
        memoryMB: Math.round((p.monit?.memory ?? 0) / 1048576),
        uptimeH: p.pm2_env?.pm_uptime ? Math.round(((now - p.pm2_env.pm_uptime) / 3600000) * 10) / 10 : 0,
        restarts: p.pm2_env?.restart_time ?? 0,
      });
      // dernières erreurs (3 lignes max par app, pour rester lisible)
      for (const line of tailLines(p.pm2_env?.pm_err_log_path, 3)) {
        errors.push({ app: p.name, line: line.slice(0, 240) });
      }
    }
  }

  // Tailles des bases sur disque (vrai coût stockage)
  const dbs: DbSize[] = [];
  try {
    const dbPath = process.env.TALKTOME_DB_PATH;
    const dir = dbPath ? path.dirname(dbPath) : null;
    if (dir && existsSync(dir)) {
      for (const f of readdirSync(dir)) {
        if (f.endsWith('.db')) {
          const mb = Math.round((statSync(path.join(dir, f)).size / 1048576) * 10) / 10;
          dbs.push({ name: f, mb });
        }
      }
    }
  } catch { /* fail-soft */ }
  dbs.sort((a, b) => b.mb - a.mb);

  // Taille uploads (vrai coût stockage médias)
  let uploadsMB: number | null = null;
  try {
    const out = execSync('du -sm public/uploads 2>/dev/null || true', { encoding: 'utf8', timeout: 5000 });
    const m = out.trim().split(/\s+/)[0];
    if (m && /^\d+$/.test(m)) uploadsMB = parseInt(m, 10);
  } catch { /* fail-soft */ }

  // Instrumentation LLM (tokens réels comptés à chaque appel)
  const llm = llmUsageStats();

  // Surface des coûts — honnête : mesuré vs non instrumenté
  const totalDbMb = dbs.reduce((s, d) => s + d.mb, 0);
  const costs: CostItem[] = [
    {
      service: 'LLM (DeepSeek / compat)', basis: 'par token (tarif déclaré)',
      measured: llm.instrumented,
      value: llm.instrumented ? `~${llm.estCost} ${llm.currency} · ${llm.tokensTotal.toLocaleString('fr')} tok` : undefined,
      note: llm.instrumented
        ? `${llm.calls} appels comptés (tokens réels × tarif déclaré ${llm.rateIn}/${llm.rateOut} par 1M)`
        : 'instrumenté — en attente du 1er appel LLM',
    },
    { service: 'Stockage — bases de données', basis: 'taille disque', measured: true, value: `${Math.round(totalDbMb * 10) / 10} Mo`, note: 'mesuré en direct (somme des .db)' },
    { service: 'Stockage — médias (uploads)', basis: 'taille disque', measured: uploadsMB !== null, value: uploadsMB !== null ? `${uploadsMB} Mo` : undefined, note: uploadsMB !== null ? 'mesuré en direct' : 'mesure indisponible' },
    { service: 'VPS (serveur)', basis: 'forfait mensuel', measured: false, note: 'montant connu de Pascal — à renseigner (pas inventé)' },
    { service: 'GPU', basis: 'forfait / heure', measured: false, note: 'GPU local (amorti), actuellement planté' },
    { service: 'Vision API', basis: 'par appel', measured: false, note: 'quota gratuit faible — non facturé pour l’instant' },
  ];

  return { pm2Ok: arr !== null, procs, errors: errors.slice(-40), dbs, uploadsMB, costs, llm };
}
