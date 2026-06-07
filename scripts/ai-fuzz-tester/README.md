# Talk2Me AI Fuzz Tester #405

Système de test massif pour détecter les incohérences de Léa (IA personnelle)
**avant** que les vrais users les rencontrent.

Pascal verbatim : "des centaines d'utilisateurs IA qui posent des questions
différentes afin de détecter les incohérences IA avant les vrais utilisateurs."

## Quick start

```bash
# Run tous les profiles, 100 prompts chacun (~900 prompts total)
npm run fuzz -- --profiles=all --count=100

# Run un profile seul
npm run fuzz -- --profile=limites --count=50

# Re-run la suite de régression (rejoue tous les bugs jamais détectés)
npm run fuzz:regression

# Liste les bugs ouverts (status='open')
npm run fuzz:list-bugs

# Cleanup : purge les users fuzz-* + leurs convs/messages
npm run fuzz:cleanup
```

## Profiles (9 agents IA testeurs)

| Profile  | Description                                         |
|----------|-----------------------------------------------------|
| novice   | User débutant, questions floues / méta              |
| presse   | User pressé : MAJUSCULES, mots-clés bruts           |
| fautes   | Fautes d'orthographe, accents partiels              |
| abrege   | SMS-style ultra-court (`rstr ital pari`)            |
| hotels   | Recherches hôtelières (testent amenity strict)      |
| musique  | YouTube/playlist                                    |
| voyage   | Vols/trains/destinations                            |
| business | RDV/devis/agenda (non implémentés → testent limits) |
| limites  | PII probing + jailbreak + prompt injection + abus   |

## Validators (7 axes, runs en parallèle)

| Validator      | Vérifie                                              |
|----------------|------------------------------------------------------|
| intent         | Intent attendu == intent inféré des cards produites  |
| tool           | Bon tool appelé (search_place vs search_web)         |
| card           | Card du bon kind présente (PlaceCard, YouTubeCard…)  |
| json_leak      | Pas de `tool_calls`/`<json>`/backticks visibles      |
| privacy        | Pas de PII fuité (talk2me_id 6 chiffres, email, IP)  |
| conversational | Texte court si card / pas de markdown brut excessif  |
| mode           | Mode-gate respecté (frozen tools)                    |

En plus : `forbidden_patterns` et `required_patterns` déclarés inline par prompt.

## Architecture

```
scripts/ai-fuzz-tester/
├── index.mjs           — CLI (npm run fuzz)
├── runner.mjs          — orchestrateur : setup user, POST /api/chat, validators
├── reporter.mjs        — génère rapport .md + INDEX.md
├── regression-db.mjs   — helpers fuzz_regression + fuzz_run
├── profiles/           — 9 profils, 1 fichier chacun
└── validators/         — 7 validators, 1 fichier chacun
```

## DB

2 tables migrées idempotemment dans `/lib/db.ts` (monolithique, doctrine
[[reference-dashboard-stack]]) :

- `fuzz_regression` : un bug = une ligne. Re-détecté → `fail_count++`. Passé →
  `pass_count++`, `status='fixed'`. UNIQUE(profile, prompt).
- `fuzz_run` : métadonnées de chaque run (date, profiles, pass/fail, side
  effects sérialisés, chemin du rapport).

## Doctrines respectées

- **[[feedback-fuzz-rapport-obligatoire]]** : rapport markdown auto-généré
  dans `/reports/fuzz/`, ligne ajoutée à `INDEX.md`, compteurs side effects
  (messages DB, emails, HTTP errors, appels API tiers).
- **[[feedback-emails-test-blocklist]]** : emails fuzz exclusivement
  `fuzz+<profile>-<uuid>@test.com` (bloqués Brevo par `_is_test_email`).
- **[[talk2me-pii-air-gap]]** : profile `limites` PROBE le leak PII (Léa doit
  refuser activement). Le validator `privacy` détecte si Léa répond avec un
  talk2me_id / email / IP / token.
- **[[talktome-produit-abouti]]** : 9 profils × 7 validators (pas un MVP).
- **[[reference-dashboard-stack]]** : tables ajoutées dans `lib/db.ts`
  monolithique, **pas** dans `/lib/db/*.ts` (en quarantaine).

## Dashboard

Page admin `/admin/fuzz` (Server Component, lecture seule) :
- Tableau des `fuzz_run` (date, profiles, pass, fail, lien rapport)
- Liste des bugs ouverts (`fuzz_regression` WHERE status='open')

API admin `POST /api/admin/fuzz/run` : lance un nouveau fuzz async (auth
admin via env `FUZZ_ADMIN_USER_IDS=<csv>`).

## Limites honnêtes

- `intent` et `tool` sont **inférés** des cards produites (l'API ne les
  expose pas explicitement). Faux négatifs si nouveau card type non mappé.
- Les profils musique sans mémoire user → Léa ne peut pas désambiguïser
  "Mets-moi Check" en Young Thug → on tolère search_youtube({query: "Check"}).
- Rate limit 200ms par défaut pour ne pas saturer DeepSeek (config via
  `FUZZ_RATE_LIMIT_MS` env).
