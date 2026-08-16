/**
 * Registry des tools exposés à DeepSeek (function calling, format OpenAI).
 * L'IA reçoit ces schémas + tool_choice:'auto' et décide elle-même.
 *
 * Doctrine [[talktome-toolkit-ia]] : hiérarchie API > embed > oEmbed > scrape
 * HTML > Playwright headless (dernier recours uniquement via fetch_url_content).
 */

import type OpenAI from 'openai';

export const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'search_music',
      description:
        "Cherche un son dans la BIBLIOTHÈQUE MUSICALE de l'utilisateur (ses music cards curatées : artistes hip-hop, rap, pop qu'il a ajoutés). À UTILISER EN PRIORITÉ dès que l'utilisateur demande de la MUSIQUE : 'mets/balance un son', 'joue [artiste/titre]', un nom d'artiste musical, une chanson. Retourne le morceau (vidéo YouTube officielle) prêt à jouer. Préfère ce tool à search_youtube pour TOUTE demande musicale.",
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              "Artiste et/ou titre (ex 'Young Thug', 'My Beyoncé Lil Durk', 'Dej Loaf Try Me').",
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_youtube',
      description:
        "Cherche une vraie vidéo YouTube qui correspond à la requête utilisateur. Retourne {video_id, title, channel, thumbnail} pour render un iframe officiel. À utiliser dès que l'utilisateur évoque une vidéo, un clip, un docu, un tuto vidéo, une chaîne YouTube, ou demande explicitement 'montre-moi'/'cherche une vidéo'.",
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              "Mots-clés YouTube optimisés (reformulés courts si l'utilisateur a été verbeux).",
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_tiktok',
      description:
        "Cherche une vraie vidéo TikTok par mots-clés (sujet, créateur, hashtag, tendance, danse, recette, sketch, sport, etc.). Retourne {video_id, user, title, cover_url, original_url} pour render le lecteur officiel TikTok. À utiliser quand l'utilisateur dit explicitement 'TikTok' / 'tik tok' / 'mets-moi un tiktok', OU demande un format court vertical typique TikTok. Pour une vidéo plus longue / classique, préfère search_youtube.",
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              "Mots-clés TikTok courts (sujet, créateur, hashtag). Pas une phrase. Reformule si l'utilisateur a été verbeux.",
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 5,
            description: 'Nombre de vidéos à retourner (défaut 3).',
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_place',
      description:
        "Cherche des lieux réels (hôtels, auberges, restos, cafés, bars, boulangeries, pharmacies, hôpitaux, médecins, dentistes, écoles, fast-food, pubs) via OpenStreetMap. À utiliser pour 'j'ai faim', 'où boire un verre', 'pharmacie proche', 'restaurant à Paris', 'hôtel à Évry', etc. Si l'utilisateur mentionne une ville, passe-la dans `city`. Sinon laisse city null : le front demandera la géoloc.",
      parameters: {
        type: 'object',
        properties: {
          amenity: {
            type: 'string',
            enum: [
              'restaurant',
              'cafe',
              'bar',
              'pub',
              'fast_food',
              'bakery',
              'pharmacy',
              'hospital',
              'clinic',
              'doctors',
              'dentist',
              'school',
              'hotel',
              'motel',
              'guest_house',
              'hostel',
            ],
            description:
              "Type de lieu OSM (clé sémantique côté Talk2Me — mappée en interne sur amenity=* OU tourism=* selon le type). Choisis le plus précis possible selon l'intent utilisateur. Pour un hôtel/auberge/logement : 'hotel' (couvre aussi motel/guest_house/hostel).",
          },
          city: {
            type: ['string', 'null'],
            description:
              'Ville mentionnée par l\'utilisateur (ex "Paris", "Lyon"). null si pas mentionnée.',
          },
        },
        required: ['amenity'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_recipe',
      description:
        "Cherche une vraie recette de cuisine sur Marmiton (fallback CuisineAZ). Retourne {name, image, prep_time, servings, ingredients[], description}. À utiliser dès que l'utilisateur demande une recette, comment cuisiner X, ingrédients pour Y, comment faire X (plat).",
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              "Mots-clés courts du plat (ex 'couscous', 'tarte tatin', 'pancakes'). PAS une phrase.",
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_wikipedia',
      description:
        "Cherche un article Wikipedia pour répondre à une question encyclopédique, biographique, historique, scientifique, géographique générale. Retourne {title, extract, thumbnail, page_url}. Utiliser pour 'qui est X', 'qu'est-ce que Y', 'définition de Z', 'histoire de W'.",
      parameters: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            description: "Sujet ou nom à chercher (ex 'Albert Einstein', 'Photosynthèse').",
          },
          lang: {
            type: 'string',
            description: "Langue Wikipedia (ISO-639-1, ex 'fr', 'en'). Défaut 'fr'.",
          },
        },
        required: ['topic'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description:
        "Récupère la météo actuelle (Open-Meteo, données réelles) pour une position. Retourne {temperature_c, condition_label, icon, wind_kmh, humidity_pct}. Si l'utilisateur cite une ville, géocode-la d'abord mentalement ou demande des coordonnées approximatives ; le serveur géocodera automatiquement si city fourni.",
      parameters: {
        type: 'object',
        properties: {
          lat: { type: ['number', 'null'], description: 'Latitude décimale.' },
          lng: { type: ['number', 'null'], description: 'Longitude décimale.' },
          city: {
            type: ['string', 'null'],
            description:
              "Ville en clair si pas de coordonnées. Le serveur géocodera. Ex 'Paris', 'Marseille'.",
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_product',
      description:
        "Cherche des produits réels et COMPARE les marketplaces (SHEIN, TEMU) pour proposer la MEILLEURE offre (prix, délai, dispo). Retourne {products[]} déjà classés (le meilleur d'abord), image/titre/prix BRUT (jamais recalculé). À utiliser quand l'utilisateur veut acheter/trouver un objet physique (robe, perceuse, casque…). NE DIS PAS de quelle marketplace vient le produit (T2M = hub, l'user s'en fiche).",
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              "Mots-clés produits courts (ex 'robe rouge femme M', 'perceuse sans fil'). PAS une phrase.",
          },
          ships_to: {
            type: 'string',
            description:
              "Code pays ISO de livraison SI l'utilisateur le précise : 'MG' (Madagascar), 'FR' (France). Omettre sinon.",
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_shop',
      description:
        "Cherche des OFFRES de la COMMUNAUTÉ Talk2Me : produits proposés par les utilisateurs et ARTISANS (Shop interne). À UTILISER EN PRIORITÉ quand l'utilisateur cherche un ARTISAN, un produit/service local, fait main, ou une offre de la communauté ('un artisan qui fait X', 'quelqu'un qui vend Y'). Les offres BOOSTÉES (sponsorisées) sont remontées en premier — propose-les en priorité. Si rien d'interne, tu peux ensuite proposer search_product (AliExpress).",
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              "Type d'offre/produit/artisan (ex 'bijoux fait main', 'gâteau anniversaire'). Vide = top offres boostées.",
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_boutique',
      description: "Cherche dans le CATALOGUE de la Boutique principale Talk2Me (produits internes de la plateforme). À utiliser quand l'utilisateur veut un produit DE LA BOUTIQUE Talk2Me. Retourne {products[]} (titre, image, prix de la DB, jamais inventé).",
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: "Mots-clés produit (ex 'coque iphone', 'écouteurs')." } },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_annonces',
      description: "Cherche dans les ANNONCES déposées sur Talk2Me (petites annonces : objets, véhicules, immobilier, services…). À utiliser quand l'utilisateur cherche une annonce / occasion / à louer sur la plateforme. Retourne {products[]} grounded sur la DB.",
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: "Mots-clés (ex 'clio', 'canapé', 'studio à louer')." },
          category: { type: 'string', description: "Catégorie optionnelle (Mode, Véhicules, Immobilier, Maison…)." },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_eat',
      description: "Cherche les RESTAURANTS / plats de Talk2Me (Eat, restos INTERNES de la plateforme — PAS OpenStreetMap). À utiliser quand l'utilisateur veut manger / commander un plat sur Talk2Me. Retourne {products[]}. Pour des restos génériques autour de l'user (hors plateforme) → search_place.",
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: "Type de cuisine / nom (ex 'burger', 'malagasy', 'pizza')." } },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_boutique',
      description:
        "Crée la BOUTIQUE Talk2Me de l'utilisateur à partir d'un MODÈLE (template). À utiliser quand l'utilisateur veut ouvrir/créer/monter sa boutique ou son shop ('crée ma boutique', 'monte-moi une boutique de bijoux', 'je veux vendre des X'). Crée la boutique + un emplacement vide par rayon (catégorie) qu'il complétera avec ses VRAIS produits — n'invente JAMAIS de produits ni de prix. Templates dispo : mode-femme, mode-homme, beaute, bijoux, tech, maison, artisan. Si l'utilisateur n'a pas précisé le nom OU le type, demande-lui avant d'appeler le tool.",
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: "Nom de la boutique choisi par l'utilisateur (ex 'Yaya', 'Chez Léa Bijoux').",
          },
          template: {
            type: 'string',
            description:
              "Clé du modèle qui colle le mieux au besoin : mode-femme, mode-homme, beaute, bijoux, tech, maison, artisan.",
          },
        },
        required: ['name', 'template'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_web',
      description:
        "Cherche sur le web (entreprises, marques, sites, infos générales, faits, actualités, personnes, organisations, lieux non-géolocalisés). UTILISE CE TOOL dès que l'utilisateur demande une information factuelle qui n'est PAS couverte par les autres tools (ce n'est pas une recette → search_recipe ; pas une vidéo → search_youtube ; pas un lieu géolocalisé → search_place ; pas la météo → get_weather ; pas une définition encyclopédique pure → search_wikipedia). Exemples : 'genius diagnostic', 'OVH c'est qui', 'site officiel Renault', 'qu'est-ce que Aliexpress'.",
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              "Requête de recherche web courte et précise (le nom de l'entreprise/marque/site, ou la question reformulée en mots-clés).",
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_url_content',
      description:
        "DERNIER RECOURS. Récupère le contenu textuel brut (title + text) d'une URL spécifique fournie par l'utilisateur ou trouvée via un autre tool. À utiliser UNIQUEMENT quand aucun autre tool ne couvre le besoin et qu'on a une URL précise à analyser.",
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL absolue http(s)://.' },
        },
        required: ['url'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recall_last_move',
      description:
        "Rappelle le dernier coup joué dans la partie d'échecs ou de dames en cours dans la conversation actuelle. Utilise quand l'user demande explicitement (ex: 'attends t'as joué où ?', 'rappelle-moi ton dernier coup', 'où as-tu bougé ?', 'tu as joué quoi ?'). Retourne le coup en notation SAN/algébrique + nombre total de coups.",
      parameters: {
        type: 'object',
        properties: {
          game_kind: {
            type: 'string',
            enum: ['chess', 'dame'],
            description: 'Type de jeu : échecs ou dames.',
          },
        },
        required: ['game_kind'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'start_game',
      description:
        "Lance une partie d'échecs ou de dames dans la conversation actuelle. Utilise quand l'user demande explicitement (ex: 'on joue aux échecs ?', 'sort le jeu de dame', 'partie d'échecs ?'). En conv solo avec l’IA : opponent=lea (l’IA joue). En conv P2P avec un ami : opponent=arbiter (l’IA pose le plateau mais ne joue pas, les 2 humains s'affrontent). Intent 'auto' cherche une partie en cours et propose reprise.",
      parameters: {
        type: 'object',
        properties: {
          game_kind: {
            type: 'string',
            enum: ['chess', 'dame'],
            description: 'Type de jeu : échecs ou dames.',
          },
          intent: {
            type: 'string',
            enum: ['auto', 'new', 'resume'],
            description:
              "'auto' = vérifie partie existante et propose reprise/nouvelle. 'new' = nouvelle partie forcée. 'resume' = reprend partie existante (échoue si aucune).",
          },
        },
        required: ['game_kind', 'intent'],
        additionalProperties: false,
      },
    },
  },
];

export type ToolName =
  | 'search_youtube'
  | 'search_tiktok'
  | 'search_place'
  | 'search_recipe'
  | 'search_wikipedia'
  | 'get_weather'
  | 'search_product'
  | 'search_web'
  | 'fetch_url_content'
  | 'start_game'
  | 'recall_last_move';
