/**
 * Talk2Me #406 — AI Ops Telegram notifier (Pascal 2026-06-05).
 *
 * Wrapper qui appelle /home/ubuntu/tg-bridge/tg-send (bash script qui poste
 * sur l'API Telegram via le bot Pascal). C'est le pattern utilisé par tous
 * les watchdogs de l'infrastructure.
 *
 * Doctrine [[feedback-watchdog-pipeline]] : tout bug critique aboie sur
 * Telegram dès qu'il est détecté.
 *
 * Mode AI_OPS_DRY_RUN=true : log seulement, n'envoie pas.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const TG_SEND_PATH = '/home/ubuntu/tg-bridge/tg-send';

let _bridgeAvailable: boolean | null = null;
function bridgeAvailable(): boolean {
  if (_bridgeAvailable === null) {
    _bridgeAvailable = existsSync(TG_SEND_PATH);
    if (!_bridgeAvailable) {
      console.warn(
        '[ai-ops/telegram] tg-bridge introuvable à',
        TG_SEND_PATH,
        '— notifs désactivées (mode log-only).',
      );
    }
  }
  return _bridgeAvailable;
}

/**
 * Envoie un message Telegram à Pascal via tg-bridge.
 * Non-bloquant : on attend pas la réponse pour ne pas freezer le cycle.
 */
export function notifyTelegram(message: string): void {
  const dryRun =
    process.env.AI_OPS_DRY_RUN === 'true' ||
    process.env.AI_OPS_DRY_RUN === '1';
  const truncated = message.length > 3900 ? message.slice(0, 3890) + '…' : message;

  if (dryRun) {
    console.log('[ai-ops/telegram] DRY_RUN ⇒', truncated.split('\n')[0]);
    return;
  }
  if (!bridgeAvailable()) {
    console.log('[ai-ops/telegram] LOG-ONLY ⇒', truncated.split('\n')[0]);
    return;
  }

  try {
    const child = spawn(TG_SEND_PATH, [truncated], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  } catch (e) {
    console.warn('[ai-ops/telegram] spawn failed:', (e as Error).message);
  }
}

/** Helper formats. */
export function fmtCriticalBug(args: {
  bugType: string;
  severity: string;
  evidence: string;
  userMessage: string;
}): string {
  return [
    `🚨 Talk2Me AI Ops — Bug ${args.severity.toUpperCase()}`,
    ``,
    `Type : *${args.bugType}*`,
    `User : "${args.userMessage.slice(0, 120)}"`,
    `Evidence : ${args.evidence.slice(0, 300)}`,
    ``,
    `Dashboard : talk2me.fr/admin/agents`,
  ].join('\n');
}

export function fmtPatchesProposed(args: {
  count: number;
  topTargets: string[];
}): string {
  return [
    `💡 Talk2Me AI Ops — ${args.count} patches proposés`,
    ``,
    `Cibles : ${args.topTargets.slice(0, 3).join(', ')}`,
    ``,
    `Valider : talk2me.fr/admin/patches`,
  ].join('\n');
}

export function fmtDailyReport(args: {
  cycles: number;
  bugs: number;
  patches: number;
  costUsd: number;
}): string {
  return [
    `📊 Talk2Me AI Ops — Bilan 24h`,
    ``,
    `Cycles : ${args.cycles}`,
    `Bugs détectés : ${args.bugs}`,
    `Patches proposés : ${args.patches}`,
    `Coût : $${args.costUsd.toFixed(3)}`,
    ``,
    `Dashboard : talk2me.fr/admin/agents`,
  ].join('\n');
}
