/**
 * Talk2Me #406 — AI Ops Orchestrator (Pascal 2026-06-05).
 *
 * Pipeline cycle complet :
 *   1. Generator → message user inventé
 *   2. Léa → /api/chat → réponse
 *   3. Critic → critique structurée
 *   4. Persiste bugs détectés
 *   5. (toutes les N missions) Fix Agent → patches → patch_queue
 *   6. Si bug critical → telegram immédiat
 *   7. Daily : aggregate perf + judge sample
 *
 * Verbatim Pascal : "le fuzz sera perpétuel".
 *
 * Doctrine [[feedback-watchdog-pipeline]] : tout cycle qui échoue silencieusement
 * doit aboyer Telegram. On compte les erreurs consécutives.
 */

import { generateUserPrompt } from './agents/generator-agent';
import { criticAnalyze } from './agents/critic-agent';
import { fixProposePatches } from './agents/fix-agent';
import { runJudgeOnAllAgents } from './agents/judge-agent';
import { recordBug, getBugsGroupedByType, aggregatePerfDaily } from './scoring';
import {
  getOrCreateFakeUser,
  createFakeSession,
  callLea,
} from './lea-bridge';
import { notifyTelegram, fmtCriticalBug, fmtPatchesProposed, fmtDailyReport } from './telegram';
import { totalCostSince, countMissionsSince } from './missions';

export interface CycleResult {
  ok: boolean;
  userMessage?: string;
  leaText?: string;
  bugsCount?: number;
  criticalCount?: number;
  error?: string;
  cycleNumber: number;
}

interface OrchestratorState {
  cycleCount: number;
  consecutiveErrors: number;
  startedAt: number;
  lastDailyRunDate: string;
  bugsSinceLastFix: number;
}

const _state: OrchestratorState = {
  cycleCount: 0,
  consecutiveErrors: 0,
  startedAt: Date.now(),
  lastDailyRunDate: '',
  bugsSinceLastFix: 0,
};

const FIX_EVERY_N_CYCLES = Math.max(
  5,
  Number(process.env.AI_OPS_FIX_EVERY_N_CYCLES || 20),
);

const BASE_URL =
  process.env.TALKTOME_INTERNAL_BASE_URL ||
  `http://127.0.0.1:${process.env.PORT || '3010'}`;

export function getOrchestratorState(): Readonly<OrchestratorState> {
  return _state;
}

/** Un cycle complet du pipeline. Tolère échecs gracieusement. */
export async function runCycle(): Promise<CycleResult> {
  _state.cycleCount++;
  const cycleNumber = _state.cycleCount;
  let userMessage = '';
  let leaText = '';
  try {
    // 1. Generator
    const gen = await generateUserPrompt();
    userMessage = gen.message;

    // 2. Léa
    const fakeUser = getOrCreateFakeUser();
    const token = createFakeSession(fakeUser.id);
    const lea = await callLea({
      baseUrl: BASE_URL,
      sessionToken: token,
      message: userMessage,
      timeoutMs: 60000,
    });
    leaText = lea.text;

    if (lea.error || lea.httpStatus >= 500) {
      _state.consecutiveErrors++;
      const errMsg = `Cycle #${cycleNumber} Léa HTTP=${lea.httpStatus} err=${lea.error}`;
      if (_state.consecutiveErrors >= 5) {
        notifyTelegram(
          `🚨 Talk2Me AI Ops — ${_state.consecutiveErrors} erreurs consécutives Léa.\n${errMsg}`,
        );
      }
      return { ok: false, userMessage, error: errMsg, cycleNumber };
    }
    _state.consecutiveErrors = 0;

    // 3. Critic
    const crit = await criticAnalyze({
      userMessage,
      leaResponseText: lea.text,
      toolCallsSummary: lea.toolCallsSummary,
      attachedCardsKinds: lea.attachedCardsKinds,
    });

    // 4. Persiste les bugs
    let criticalCount = 0;
    for (const b of crit.critique.bugs) {
      recordBug({
        missionId: crit.missionId,
        bugType: b.type,
        severity: b.severity,
        evidence: b.evidence,
        suggestedFixCategory: b.suggested_fix_category || null,
      });
      if (b.severity === 'critical') criticalCount++;
    }
    _state.bugsSinceLastFix += crit.critique.bugs.length;

    // 5. Bug critique → Telegram immédiat (premier seulement pour éviter spam)
    if (criticalCount > 0) {
      const firstCritical = crit.critique.bugs.find((b) => b.severity === 'critical')!;
      notifyTelegram(
        fmtCriticalBug({
          bugType: firstCritical.type,
          severity: firstCritical.severity,
          evidence: firstCritical.evidence,
          userMessage,
        }),
      );
    }

    // 6. Toutes les N cycles : Fix Agent
    if (cycleNumber % FIX_EVERY_N_CYCLES === 0 && _state.bugsSinceLastFix > 0) {
      try {
        const bugs = getBugsGroupedByType();
        if (bugs.length > 0) {
          const fix = await fixProposePatches({ bugsByType: bugs });
          if (fix.enqueued > 0) {
            const topTargets = fix.patches.map((p) => p.target_file).slice(0, 3);
            notifyTelegram(
              fmtPatchesProposed({ count: fix.enqueued, topTargets }),
            );
          }
          _state.bugsSinceLastFix = 0;
        }
      } catch (e) {
        console.warn('[ai-ops] fix agent failed:', (e as Error).message);
      }
    }

    // 7. Daily aggregation & judge (1x par jour)
    const today = new Date().toISOString().slice(0, 10);
    if (_state.lastDailyRunDate !== today) {
      _state.lastDailyRunDate = today;
      // skip le premier appel (start de daemon) pour éviter aggregation vide
      if (cycleNumber > 1) {
        try {
          aggregatePerfDaily();
          // Judge en background (non-blocking pour le cycle)
          runJudgeOnAllAgents(2).catch((e) =>
            console.warn('[ai-ops] judge run failed:', (e as Error).message),
          );
          const since = Date.now() - 24 * 60 * 60 * 1000;
          const cost = totalCostSince(since);
          const totalMissions = countMissionsSince(since);
          notifyTelegram(
            fmtDailyReport({
              cycles: cycleNumber,
              bugs: 0,
              patches: 0,
              costUsd: cost,
            }) + `\n(Missions 24h : ${totalMissions})`,
          );
        } catch (e) {
          console.warn('[ai-ops] daily run failed:', (e as Error).message);
        }
      }
    }

    return {
      ok: true,
      userMessage,
      leaText,
      bugsCount: crit.critique.bugs.length,
      criticalCount,
      cycleNumber,
    };
  } catch (e) {
    _state.consecutiveErrors++;
    const msg = (e as Error).message;
    console.error('[ai-ops] cycle error:', msg);
    if (_state.consecutiveErrors >= 5) {
      notifyTelegram(
        `🚨 Talk2Me AI Ops — ${_state.consecutiveErrors} erreurs consécutives orchestrator.\n${msg}`,
      );
    }
    return { ok: false, userMessage, error: msg, cycleNumber };
  }
}
