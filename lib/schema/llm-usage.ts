/**
 * lib/schema/llm-usage — INSTRUMENTATION DES COÛTS LLM (Pascal 2026-06-30).
 * Compte les VRAIS tokens (champ `usage` renvoyé par l'API) à chaque appel, les
 * stocke, et agrège. Le COÛT = tokens réels × tarif DÉCLARÉ (env, éditable) —
 * jamais un montant inventé : les tokens sont réels, le tarif est explicite.
 * Fail-soft : ne casse jamais le chat (insert best-effort).
 */
import { getDb } from '@/lib/db-core';

let ensured = false;
function ensure() {
  if (ensured) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS llm_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      model TEXT NOT NULL,
      source TEXT NOT NULL,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_llm_usage_ts ON llm_usage(ts);
  `);
  ensured = true;
}

export interface LlmUsageLike { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }

/** Enregistre un appel LLM réel. À appeler juste après chaque completion. Fail-soft. */
export function recordLlmUsage(model: string, usage: LlmUsageLike | null | undefined, source: string): void {
  try {
    if (!usage) return;
    ensure();
    const pt = usage.prompt_tokens ?? 0;
    const ct = usage.completion_tokens ?? 0;
    const tt = usage.total_tokens ?? pt + ct;
    if (tt <= 0) return;
    getDb().prepare(
      'INSERT INTO llm_usage (ts, model, source, prompt_tokens, completion_tokens, total_tokens) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(Date.now(), model || 'unknown', source || 'unknown', pt, ct, tt);
  } catch {
    // doctrine no-excuses : jamais bloquant pour le chat
  }
}

// Tarifs DÉCLARÉS (éditables via env) — USD / 1M tokens. Défauts = ordre de grandeur
// DeepSeek deepseek-chat. À ajuster au vrai tarif ; le coût affiché est tokens×ce tarif.
function rates() {
  const inR = parseFloat(process.env.LLM_PRICE_IN_PER_1M || '0.27');
  const outR = parseFloat(process.env.LLM_PRICE_OUT_PER_1M || '1.10');
  return { inR: isFinite(inR) ? inR : 0, outR: isFinite(outR) ? outR : 0, currency: process.env.LLM_PRICE_CURRENCY || 'USD' };
}

export interface LlmStats {
  calls: number; tokensIn: number; tokensOut: number; tokensTotal: number;
  todayCalls: number; todayTokensTotal: number;
  byModel: { model: string; calls: number; tokens: number }[];
  bySource: { source: string; calls: number; tokens: number }[];
  rateIn: number; rateOut: number; currency: string;
  estCost: number; todayCost: number; instrumented: boolean;
}

export function llmUsageStats(): LlmStats {
  const { inR, outR, currency } = rates();
  try {
    ensure();
    const db = getDb();
    const tot = db.prepare('SELECT COUNT(*) c, COALESCE(SUM(prompt_tokens),0) pin, COALESCE(SUM(completion_tokens),0) pout, COALESCE(SUM(total_tokens),0) tt FROM llm_usage').get() as any;
    const d = new Date(); d.setHours(0, 0, 0, 0); const todayStart = d.getTime();
    const today = db.prepare('SELECT COUNT(*) c, COALESCE(SUM(prompt_tokens),0) pin, COALESCE(SUM(completion_tokens),0) pout, COALESCE(SUM(total_tokens),0) tt FROM llm_usage WHERE ts >= ?').get(todayStart) as any;
    const byModel = db.prepare('SELECT model, COUNT(*) calls, COALESCE(SUM(total_tokens),0) tokens FROM llm_usage GROUP BY model ORDER BY tokens DESC').all() as any[];
    const bySource = db.prepare('SELECT source, COUNT(*) calls, COALESCE(SUM(total_tokens),0) tokens FROM llm_usage GROUP BY source ORDER BY tokens DESC').all() as any[];
    const estCost = (tot.pin / 1e6) * inR + (tot.pout / 1e6) * outR;
    const todayCost = (today.pin / 1e6) * inR + (today.pout / 1e6) * outR;
    return {
      calls: tot.c, tokensIn: tot.pin, tokensOut: tot.pout, tokensTotal: tot.tt,
      todayCalls: today.c, todayTokensTotal: today.tt,
      byModel: byModel.map((m) => ({ model: m.model, calls: m.calls, tokens: m.tokens })),
      bySource: bySource.map((s) => ({ source: s.source, calls: s.calls, tokens: s.tokens })),
      rateIn: inR, rateOut: outR, currency,
      estCost: Math.round(estCost * 10000) / 10000, todayCost: Math.round(todayCost * 10000) / 10000,
      instrumented: tot.c > 0,
    };
  } catch {
    return { calls: 0, tokensIn: 0, tokensOut: 0, tokensTotal: 0, todayCalls: 0, todayTokensTotal: 0, byModel: [], bySource: [], rateIn: inR, rateOut: outR, currency, estCost: 0, todayCost: 0, instrumented: false };
  }
}
