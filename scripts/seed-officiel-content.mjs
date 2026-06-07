// Talk2Me #379 — Seed contenu T2M Officiel IA (Pascal 2026-06-05).
// Doctrine [[talk2me-officiel-ia]] : seed des docs légaux + tutos consommés
// par les tools get_legal_doc / get_tutorial de l'IA institutionnelle.
//
// Usage : node scripts/seed-officiel-content.mjs
// Idempotent : remplace les entries au même topic / (topic, step_order).

import Database from 'better-sqlite3';
import crypto from 'node:crypto';

const DB_PATH = '/home/ubuntu/talktome/data/talktome.db';
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Migration idempotente (au cas où le serveur n'aurait pas encore tourné après
// l'ajout des tables dans lib/db.ts).
db.exec(`
  CREATE TABLE IF NOT EXISTS tutorial_steps (
    id TEXT PRIMARY KEY,
    topic TEXT NOT NULL,
    step_order INTEGER NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    media_url TEXT,
    next_action TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_tutorial_topic ON tutorial_steps(topic, step_order);

  CREATE TABLE IF NOT EXISTS legal_docs (
    topic TEXT PRIMARY KEY,
    content_md TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

// ---------- 1. Docs légaux ----------
const LEGAL = [
  {
    topic: 'mentions_legales',
    content_md:
      "Talk2Me est édité par GeniusWeb. Contact éditeur : pascal.repir@gmail.com. " +
      "Hébergement : OVH (France). Directeur de publication : Pascal Repir.",
  },
  {
    topic: 'cgu',
    content_md:
      "Conditions Générales d'Utilisation Talk2Me v1.\n" +
      "- Usage personnel et communautaire uniquement.\n" +
      "- Pas de spam, pas de contenu illégal, pas de harcèlement.\n" +
      "- Modération assurée par signalement et revue.\n" +
      "- Talk2Me se réserve le droit de suspendre tout compte enfreignant ces règles.",
  },
  {
    topic: 'cgv',
    content_md:
      "Conditions Générales de Vente Talk2Me v1.\n" +
      "- L'app Talk2Me est gratuite.\n" +
      "- Aucune transaction commerciale n'est effectuée directement dans l'app.\n" +
      "- Les liens vers des partenaires externes (Booking, Spotify, YouTube, etc.) sont " +
      "soumis aux CGV propres de ces partenaires.",
  },
  {
    topic: 'privacy',
    content_md:
      "Politique de confidentialité Talk2Me v1.\n" +
      "Données collectées :\n" +
      "- Email (authentification)\n" +
      "- Messages et cards postés (conversations)\n" +
      "- Habitudes IA (anonymisées, strictement isolées par user)\n" +
      "RGPD : tu peux à tout moment exercer ton droit d'accès, de rectification " +
      "et de suppression en écrivant à pascal.repir@gmail.com.",
  },
  {
    topic: 'rgpd',
    content_md:
      "RGPD Talk2Me.\n" +
      "- Données strictement isolées par user_id (ta mémoire IA n'est jamais leakée à un autre user).\n" +
      "- Droit d'accès, rectification, suppression, portabilité.\n" +
      "- Pas de revente de données.\n" +
      "- Demande : pascal.repir@gmail.com.",
  },
];

const upsertLegal = db.prepare(
  `INSERT INTO legal_docs (topic, content_md, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(topic) DO UPDATE SET content_md = excluded.content_md, updated_at = excluded.updated_at`,
);
const now = Date.now();
for (const l of LEGAL) {
  upsertLegal.run(l.topic, l.content_md, now);
}
console.log('[legal] seeded', LEGAL.length, 'docs');

// ---------- 2. Tutoriels ----------
const TUTORIALS = {
  home: [
    {
      title: 'Le feed Home',
      body:
        "Le feed Home affiche les cards des amis + ce qui buzz. Format vertical " +
        "snap (style TikTok) : un swipe = une nouvelle card.",
      next_action: '/home',
    },
    {
      title: 'Like, save, partage',
      body:
        "Sur chaque card tu peux liker (cœur), sauvegarder dans tes saved_cards " +
        "(bookmark) ou partager à un ami via la conv.",
      next_action: '/home',
    },
    {
      title: 'Découvrir ce qui buzz',
      body:
        "Demande-moi 'un truc qui buzz' ou 'top likes cette semaine' — je te " +
        "remonte les cards qui marchent vraiment.",
      next_action: null,
    },
  ],
  cards: [
    {
      title: 'Créer une card',
      body:
        "Bouton + en bas de l'écran : 3 types de cards possibles — Image, Vidéo, " +
        "Texte. Tu choisis ton type et tu enchaînes.",
      next_action: '/drafts',
    },
    {
      title: 'Image card',
      body:
        "Photo + caption courte. Crop libre, filtres simples. Idéal pour une " +
        "image forte qui parle d'elle-même.",
      next_action: '/drafts',
    },
    {
      title: 'Vidéo card',
      body:
        "Clip vertical 9:16. Trim simple, cover sélectionnable. Pense à un point " +
        "fort dans les 3 premières secondes.",
      next_action: '/drafts',
    },
    {
      title: 'Texte card',
      body:
        "Texte sur fond coloré. Variante de fond modifiable. Bien pour une " +
        "punchline ou un mini-thread.",
      next_action: '/drafts',
    },
  ],
  editor: [
    {
      title: "L'éditeur IA",
      body:
        "L'éditeur de cards est assisté par IA. Tu donnes une intention, l'IA " +
        "propose titre / cover / hashtags. Tu valides ou tu réajustes.",
      next_action: '/drafts',
    },
    {
      title: 'Toi au centre',
      body:
        "L'IA propose, l'humain décide. Toutes les propositions sont rejouables " +
        "(undo / redo). La validation est toujours manuelle.",
      next_action: '/drafts',
    },
    {
      title: 'Mode focus',
      body:
        "En mode éditeur, les autres compétences IA sont gelées. Pas de " +
        "distraction : tu construis ta card, c'est tout.",
      next_action: '/drafts',
    },
  ],
  amis: [
    {
      title: 'Contact Card',
      body:
        "Chaque user Talk2Me a une Contact Card native : 6 chiffres (ton " +
        "Talk2Me ID) + @pseudo. C'est ton identifiant universel.",
      next_action: '/amis',
    },
    {
      title: 'Ajouter un ami',
      body:
        "Cherche par @pseudo ou Talk2Me ID 6 chiffres, puis tape 'Ajouter'. " +
        "L'amitié est symétrique et instantanée.",
      next_action: '/amis',
    },
    {
      title: 'Démarrer une conv',
      body:
        "Depuis ta liste d'amis, tape sur un ami → conv P2P créée. Vous pouvez " +
        "envoyer texte, médias, et tagger vos IA respectives (@Léa, @Nova...).",
      next_action: '/messages',
    },
  ],
  embed: [
    {
      title: 'Coller un lien',
      body:
        "Colle une URL dans ta conv solo IA — YouTube, TikTok, Spotify, " +
        "Maps, article, etc. — elle s'affiche en card riche, pas en lien brut.",
      next_action: null,
    },
    {
      title: 'Plateformes supportées',
      body:
        "17+ embeds natifs : YouTube, TikTok, Spotify, Maps, Twitter/X, " +
        "Facebook, Instagram, SoundCloud, Vimeo, Reddit, Twitch, Dailymotion, " +
        "LinkedIn, Pinterest, Loom, Apple Music, Deezer.",
      next_action: null,
    },
    {
      title: 'Embed → Home',
      body:
        "Tu peux publier un embed dans ton flux Home : long-press sur le " +
        "message → 'Publier sur Home'. La card devient visible par tes amis.",
      next_action: '/home',
    },
  ],
  select: [
    {
      title: 'Sélection contiguë',
      body:
        "Dans la conv solo IA, long-press sur un message — tu peux ensuite " +
        "étendre la sélection aux messages contigus avant/après.",
      next_action: null,
    },
    {
      title: 'Publier sur Home',
      body:
        "Une fois ta sélection prête, tape sur le bouton 'Publier'. Le bloc " +
        "sélectionné devient un post visible dans le feed Home.",
      next_action: '/home',
    },
    {
      title: 'Post = clip conv',
      body:
        "Tes posts NAISSENT de la conversation — pas créés en éditorial. C'est " +
        "ton vrai vécu Talk2Me qui devient feed.",
      next_action: '/home',
    },
  ],
};

// Replace strategy : DELETE par (topic, step_order) puis INSERT.
const deleteStep = db.prepare(
  'DELETE FROM tutorial_steps WHERE topic = ? AND step_order = ?',
);
const insertStep = db.prepare(
  `INSERT INTO tutorial_steps (id, topic, step_order, title, body, media_url, next_action, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
);

let totalSteps = 0;
for (const [topic, steps] of Object.entries(TUTORIALS)) {
  steps.forEach((s, idx) => {
    deleteStep.run(topic, idx + 1);
    insertStep.run(
      crypto.randomUUID(),
      topic,
      idx + 1,
      s.title,
      s.body,
      null,
      s.next_action ?? null,
      now,
    );
    totalSteps += 1;
  });
}
console.log('[tutorials] seeded', totalSteps, 'steps across', Object.keys(TUTORIALS).length, 'topics');

// ---------- 3. Rapport ----------
const fs = await import('node:fs/promises');
const lines = [
  '# T2M Officiel — Seed contenu institutionnel 2026-06-05',
  '',
  '## Légal',
  ...LEGAL.map((l) => `- ${l.topic} : ${l.content_md.length} chars`),
  '',
  '## Tutoriels',
  ...Object.entries(TUTORIALS).map(
    ([topic, steps]) => `- ${topic} : ${steps.length} steps`,
  ),
  '',
  '## Total',
  `- legal_docs : ${LEGAL.length}`,
  `- tutorial_steps : ${totalSteps}`,
  '',
];
await fs.writeFile(
  '/home/ubuntu/dashboard/uploads/t2m_officiel_content_seed_report.md',
  lines.join('\n'),
);
console.log(
  '\nRapport: /home/ubuntu/dashboard/uploads/t2m_officiel_content_seed_report.md',
);

db.close();
console.log('\n=== JSON ===');
console.log(
  JSON.stringify(
    {
      legal_docs: LEGAL.length,
      tutorial_steps: totalSteps,
      topics: Object.keys(TUTORIALS),
    },
    null,
    2,
  ),
);
