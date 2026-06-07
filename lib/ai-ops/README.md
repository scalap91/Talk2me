# Talk2Me AI Ops — #406 + #407

Plateforme AI Ops de Talk2Me. Verbatim Pascal (2026-06-05) :

> #406 : "Pourquoi vous avez pas fait un module fuzz avec une IA branchée au cul qui génère des users, un autre qui analyse, un autre qui te propose les solutions de coding car ça le fuzz sera perpétuel."
>
> #407 : "On va toujours ouvrir un agent et le refermer, le module enregistre le score de nos agent en fonction des objectifs et des tâches qu'ils doivent accomplir comme des bons ouvriers qui apprennent leur taf."

## Architecture

```
lib/ai-ops/
├── agents/
│   ├── generator-agent.ts    # DeepSeek créatif : invente un message user
│   ├── critic-agent.ts       # DeepSeek analytique : note réponse Léa (JSON)
│   ├── fix-agent.ts          # DeepSeek codeur : propose patches
│   └── judge-agent.ts        # Évalue les autres agents (4 critères)
├── registry.ts               # CRUD agent_registry
├── missions.ts               # CRUD agent_missions (open/close + coût)
├── scoring.ts                # CRUD agent_scores + aggregatePerfDaily
├── patch-queue.ts            # CRUD patch_queue (pending/approved/rejected)
├── orchestrator.ts           # Pipeline complet 1 cycle
├── telegram.ts               # Notif via /home/ubuntu/tg-bridge/tg-send
├── lea-bridge.ts             # Fake users + session + callLea (HTTP /api/chat)
├── auth.ts                   # AI_OPS_ADMIN_EMAILS + AI_OPS_DAEMON_TOKEN
└── README.md
```

Daemon : `scripts/ai-ops-daemon.mjs` — process PM2 H24 qui ping
`/api/admin/ai-ops/run-once` toutes les `3600/AI_OPS_CYCLES_PER_HOUR` secondes.

## Admin UI

- `/admin/agents` — Dashboard perf agents (scores, missions, coût, bugs)
- `/admin/patches` — Patch queue avec boutons Approve/Reject

## API

- `POST /api/admin/ai-ops/run-once` — Exécute 1 cycle (daemon ou admin)
- `GET  /api/admin/ai-ops/status` — JSON stats (admin only)
- `POST /api/admin/ai-ops/cleanup` — Purge fake users (admin only)
- `POST /api/admin/ai-ops/patch/{id}/approve`
- `POST /api/admin/ai-ops/patch/{id}/reject`

## Tables DB (lib/db.ts monolithique)

- `agent_registry` — annuaire des agents
- `agent_missions` — chaque tâche (open/close + coût USD)
- `agent_scores` — note 0-10 par critère par mission
- `agent_perf_daily` — agrégation journalière
- `patch_queue` — propositions Fix Agent (pending/approved/rejected)
- `ai_ops_bugs` — bugs détectés par le Critic

## Env vars

```bash
AI_OPS_CYCLES_PER_HOUR=10           # 10/h = ~$30/mois (default Pascal)
AI_OPS_FIX_EVERY_N_CYCLES=20        # Fix Agent batch every N
AI_OPS_DAEMON_TOKEN=changeme         # secret daemon↔Next
AI_OPS_ADMIN_EMAILS=pascal.repir@gmail.com
AI_OPS_DRY_RUN=true                  # mode test (no telegram)
AI_OPS_MAX_CYCLES=3                  # arrête après N cycles (test)
```

## Commandes

```bash
# Mode dry-run (3 cycles rapides, pas de telegram)
npm run ai-ops:dry-run

# Mode prod (H24, 10 cycles/h)
npm run ai-ops:daemon

# PM2
pm2 start scripts/ai-ops-daemon.mjs --name ai-ops-daemon

# Status JSON
curl -s --cookie "talk2me_session=$ADMIN_TOKEN" \
  http://127.0.0.1:3010/api/admin/ai-ops/status | jq

# Cleanup fake users
curl -X POST --cookie "talk2me_session=$ADMIN_TOKEN" \
  http://127.0.0.1:3010/api/admin/ai-ops/cleanup
```

## Doctrines respectées

- `[[feedback-fuzz-rapport-obligatoire]]` : rapport JSON + INDEX.md auto
- `[[feedback-watchdog-pipeline]]` : aboie Telegram si bug critical ou 5 erreurs consécutives
- `[[feedback-modular-no-scattered-patches]]` : 1 module ai-ops/, patches chirurgicaux only
- `[[talk2me-pii-air-gap]]` : fake users isolés ai-ops-fuzz+*@test.com
- `[[project-bizzi-no-funding]]` : 10 cycles/h, modèle DeepSeek cheap
- `[[feedback-emails-test-blocklist]]` : @test.com bloqué Brevo

## Coût observé

- 1 cycle = 2 appels DeepSeek (generator + critic) + 1 toutes les 20 (fix)
- 10 cycles/h × 24h = 240 cycles/jour ≈ 500 appels DeepSeek/jour
- ~1k tokens/appel = $0.0007/appel = $0.35/jour = ~$10/mois en réel
- Budget réservé : $30/mois (marge confortable pour pics)

## Anti-patterns INTERDITS

- ❌ Auto-merge des patches (Pascal verbatim "STRICTEMENT NON")
- ❌ Utiliser de vrais users humains comme cobayes
- ❌ Lancer des cycles sans rapport JSON
- ❌ Modifier le code de prod depuis le Fix Agent
- ❌ Notifier Telegram en boucle (rate-limit : 1 critical/cycle max)
