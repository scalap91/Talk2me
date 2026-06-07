/**
 * Reporter — génère un rapport markdown détaillé dans /reports/fuzz/ +
 * append une ligne dans INDEX.md.
 *
 * Doctrine [[feedback-fuzz-rapport-obligatoire]] :
 *  - Compteurs effets de bord (emails envoyés, messages DB créés, API tiers)
 *  - Liste des refs créés (user_ids fuzz pour cleanup)
 *  - Verdict pass/fail par scénario
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.resolve(__dirname, '../../reports/fuzz');

function ts() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  // Inclut secondes pour éviter collision de fichier si 2 runs dans la même minute
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}_${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

export function generateReport(args) {
  const { runId, profilesData, options, sideEffects, durationMs } = args;
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const stamp = ts();
  const filename = `fuzz_${stamp}.md`;
  const filepath = path.join(REPORTS_DIR, filename);

  let total = 0, totalPass = 0, totalFail = 0;
  for (const p of profilesData) {
    total += p.total;
    totalPass += p.pass;
    totalFail += p.fail;
  }
  const passRate = total > 0 ? Math.round((totalPass / total) * 100) : 0;

  // Top bugs : agrège tous les fails de tous les profiles, group par reason key
  const bugMap = new Map();
  for (const pd of profilesData) {
    for (const r of pd.results) {
      if (r.pass) continue;
      for (const f of r.fails) {
        const key = `${pd.profile}::${f.name}::${(f.reason || '').slice(0, 80)}`;
        if (!bugMap.has(key)) {
          bugMap.set(key, {
            profile: pd.profile,
            validator: f.name,
            reason: f.reason,
            count: 0,
            samplePrompt: r.prompt,
            sampleExcerpt: r.text_excerpt,
            sampleExpected: r.expected,
          });
        }
        bugMap.get(key).count++;
      }
    }
  }
  const topBugs = Array.from(bugMap.values()).sort((a, b) => b.count - a.count).slice(0, 10);

  // === build markdown ===
  const lines = [];
  lines.push(`# Fuzz Run ${stamp} — id=${runId}`);
  lines.push('');
  lines.push(`**Profiles** : ${profilesData.map((p) => p.profile).join(', ')}`);
  lines.push(`**Durée** : ${(durationMs / 1000).toFixed(1)} s`);
  lines.push(`**Rate limit** : ${options.rateLimitMs} ms entre prompts`);
  lines.push(`**Base URL** : ${options.baseUrl}`);
  lines.push('');
  lines.push('## Résumé');
  lines.push('');
  lines.push(`- **Total prompts** : ${total}`);
  lines.push(`- **Pass** : ${totalPass} (${passRate}%)`);
  lines.push(`- **Fail** : ${totalFail} (${100 - passRate}%)`);
  lines.push('');
  lines.push('## Effets de bord (doctrine [[feedback-fuzz-rapport-obligatoire]])');
  lines.push('');
  lines.push(`- **Messages DB créés** : ${sideEffects.messagesCreated}`);
  lines.push(`- **Users fuzz utilisés** : ${sideEffects.fuzzUserIds.length} (\`${sideEffects.fuzzUserIds.map((u) => u.slice(0, 8)).join(', ')}\`)`);
  lines.push(`- **Emails envoyés** : ${sideEffects.emailsSent} (garde-fou Brevo blocklist actif — adresses fuzz+\\*@test.com)`);
  lines.push(`- **HTTP errors** : ${sideEffects.httpErrors}`);
  lines.push(`- **Appels API tiers** : ${sideEffects.thirdPartyCalls} (estimation : 1 DeepSeek call par prompt non-cached + N tool handlers)`);
  lines.push('');
  lines.push('## Top bugs (par fréquence)');
  lines.push('');
  if (topBugs.length === 0) {
    lines.push('Aucun bug détecté.');
  } else {
    topBugs.forEach((b, i) => {
      lines.push(`### ${i + 1}. [×${b.count}] ${b.profile} / ${b.validator}`);
      lines.push('');
      lines.push(`**Raison** : ${b.reason}`);
      lines.push(`**Exemple prompt** : \`${b.samplePrompt}\``);
      lines.push(`**Attendu** : intent=${b.sampleExpected.intent || 'null'} | tool=${b.sampleExpected.tool || 'null'} | card=${b.sampleExpected.card || 'null'}`);
      if (b.sampleExcerpt) {
        lines.push(`**Réponse extrait** : \`${b.sampleExcerpt.replace(/\n/g, ' ').slice(0, 200)}\``);
      }
      lines.push('');
    });
  }
  lines.push('## Détail par profile');
  lines.push('');
  for (const pd of profilesData) {
    const rate = pd.total > 0 ? Math.round((pd.pass / pd.total) * 100) : 0;
    lines.push(`### ${pd.profile} (×${pd.total}) — ${rate}% pass`);
    lines.push('');
    lines.push(`> ${pd.description}`);
    lines.push('');
    lines.push(`- pass : ${pd.pass}`);
    lines.push(`- fail : ${pd.fail}`);
    lines.push(`- http_errors : ${pd.httpErrors}`);
    lines.push(`- messages DB créés : ${pd.messagesCreated}`);
    lines.push('');
    // Liste les fails de ce profile (max 20 pour ne pas exploser)
    const fails = pd.results.filter((r) => !r.pass).slice(0, 20);
    if (fails.length > 0) {
      lines.push('| # | prompt | attendu | fails | extrait |');
      lines.push('|---|--------|---------|-------|---------|');
      for (const f of fails) {
        const expected = `intent=${f.expected.intent || '∅'} tool=${f.expected.tool || '∅'} card=${f.expected.card || '∅'}`;
        const failNames = f.fails.map((x) => x.name).join(',');
        const excerpt = (f.text_excerpt || '').replace(/[|\n]/g, ' ').slice(0, 60);
        const prompt = (f.prompt || '').replace(/[|\n]/g, ' ').slice(0, 40);
        lines.push(`| ${f.idx} | ${prompt} | ${expected} | ${failNames} | ${excerpt} |`);
      }
      if (pd.results.filter((r) => !r.pass).length > 20) {
        lines.push('');
        lines.push(`_(...${pd.results.filter((r) => !r.pass).length - 20} fails supplémentaires non listés ici, voir DB fuzz_regression)_`);
      }
    }
    lines.push('');
  }
  lines.push('## Notes');
  lines.push('');
  lines.push('- Validators heuristiques : `intent` et `tool` sont inférés des cards produites (l\'API ne les expose pas explicitement). Faux négatifs possibles si nouveau type de card non mappé.');
  lines.push('- `privacy` (PII) utilise les patterns doctrine [[talk2me-pii-air-gap]] — emails fuzz+*@test.com whitelisted.');
  lines.push('- `conversational` rejette texte > 400 chars si card présente (doctrine [[talktome-cards-primaute]]).');
  lines.push('- Cleanup users fuzz : `npm run fuzz:cleanup` (supprime users `fuzz-*` + leurs convs + messages).');
  lines.push('');
  fs.writeFileSync(filepath, lines.join('\n'));

  // Append INDEX.md
  const indexPath = path.join(REPORTS_DIR, 'INDEX.md');
  const indexLine = `- [${stamp}](./${filename}) — profiles=${profilesData.map((p) => p.profile).join(',')} total=${total} pass=${totalPass} fail=${totalFail} (${passRate}%) duration=${(durationMs / 1000).toFixed(0)}s run_id=${runId.slice(0, 8)}\n`;
  if (!fs.existsSync(indexPath)) {
    fs.writeFileSync(indexPath, `# Fuzz Reports Index\n\nDoctrine [[feedback-fuzz-rapport-obligatoire]] — chaque run = 1 rapport + 1 ligne ici.\n\n${indexLine}`);
  } else {
    fs.appendFileSync(indexPath, indexLine);
  }
  return filepath;
}
