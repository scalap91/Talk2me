/**
 * Profile MUSIQUE — focus search vidéo musicale.
 *
 * Cas central [[talktome-raisonnement-ia]] : "Mets-moi Check" devrait devenir
 * search_youtube({query: "Young Thug Check"}) si l'user écoute du rap.
 * Sans mémoire personnelle (user fuzz neuf), Léa doit au minimum poser une
 * question OU exécuter avec la query brute.
 */

const BANK = [
  { text: 'mets Daft Punk', intent: 'youtube_video', tool: 'search_youtube', card: 'YouTubeCard' },
  { text: 'mets-moi du jazz', intent: 'youtube_video', tool: 'search_youtube', card: 'YouTubeCard' },
  { text: 'playlist trap français', intent: 'youtube_video', tool: 'search_youtube', card: 'YouTubeCard' },
  { text: 'écouter Stromae', intent: 'youtube_video', tool: 'search_youtube', card: 'YouTubeCard' },
  { text: 'morceau de classique apaisant', intent: 'youtube_video', tool: 'search_youtube', card: 'YouTubeCard' },
  { text: 'mets Booba', intent: 'youtube_video', tool: 'search_youtube', card: 'YouTubeCard' },
  { text: 'clip Aya Nakamura', intent: 'youtube_video', tool: 'search_youtube', card: 'YouTubeCard' },
  { text: 'chanson Edith Piaf', intent: 'youtube_video', tool: 'search_youtube', card: 'YouTubeCard' },
  { text: 'musique 2020 française', intent: 'youtube_video', tool: 'search_youtube', card: 'YouTubeCard' },
  { text: 'vidéo Indochine', intent: 'youtube_video', tool: 'search_youtube', card: 'YouTubeCard' },
  { text: 'mets une musique calme', intent: 'youtube_video', tool: 'search_youtube', card: 'YouTubeCard' },
  { text: 'concert live Coldplay', intent: 'youtube_video', tool: 'search_youtube', card: 'YouTubeCard' },
];

export const musique = {
  name: 'musique',
  description: 'Recherches musicales — testent intent youtube_video + query enrichie',
  generate(count) {
    const out = [];
    for (let i = 0; i < count; i++) {
      const t = BANK[i % BANK.length];
      out.push({
        text: t.text,
        expected_intent: t.intent,
        expected_tool: t.tool,
        expected_card_kind: t.card,
        forbidden_patterns: [
          // Pas de lien YouTube brut (doctrine cards-primauté)
          'https?://(www\\.)?youtube\\.com/watch',
          'https?://youtu\\.be/',
        ],
        required_patterns: [],
        mode: 'chat',
        skip_validators: [],
      });
    }
    return out;
  },
};
