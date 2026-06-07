import { create } from 'zustand';
import type {
  ChatMessage,
  PlaceCardData,
  PlaceSearchSpec,
  ProductCardData,
} from '@/lib/chat-types';

interface ChatState {
  messages: ChatMessage[];
  isTyping: boolean;
  selectionMode: boolean;
  /** Sélection contiguë : indices dans le tableau messages, inclusifs. */
  selectionStartId: string | null;
  selectionEndId: string | null;
  /**
   * Si l'agent a déclenché une placeSearch nécessitant la géoloc mais
   * que la permission n'est pas accordée, on stocke la spec ici en attendant
   * soit l'activation de la géoloc, soit la ville saisie par l'utilisateur.
   */
  pendingPlaceSearch: { messageId: string; spec: PlaceSearchSpec } | null;

  sendMessage: (text: string) => Promise<void>;
  /**
   * Talk2Me média chat (Pascal 2026-06-04) — partage d'un fichier (image,
   * vidéo, audio) dans la conv IA solo. Persiste le message côté serveur
   * sans déclencher DeepSeek si pas de caption.
   */
  sendMedia: (media: {
    url: string;
    type: 'image' | 'video' | 'audio';
    filename?: string | null;
    size?: number | null;
    mime?: string | null;
  }, caption?: string) => Promise<void>;
  reset: () => void;
  seed: (initial: ChatMessage[]) => void;
  enterSelection: (initialId?: string) => void;
  exitSelection: () => void;
  extendSelectionTo: (id: string) => void;
  clearSelection: () => void;
  loadFromServer: () => Promise<void>;
  publishSelection: () => Promise<{ ok: boolean; postId?: string }>;
  requestGeolocation: () => Promise<void>;
}

const SS_GEOLOC_KEY = 'talktome_geoloc';

/** Lit lat,lng depuis sessionStorage si présent (et valide). */
function readCachedGeoloc(): { lat: number; lng: number } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(SS_GEOLOC_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.lat === 'number' &&
      typeof parsed.lng === 'number' &&
      Number.isFinite(parsed.lat) &&
      Number.isFinite(parsed.lng)
    ) {
      return { lat: parsed.lat, lng: parsed.lng };
    }
  } catch {
    // ignore
  }
  return null;
}

function saveCachedGeoloc(lat: number, lng: number) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      SS_GEOLOC_KEY,
      JSON.stringify({ lat, lng })
    );
  } catch {
    // ignore
  }
}

/** Wrap navigator.geolocation.getCurrentPosition en Promise. */
function getCurrentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('geolocation_unsupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 }
    );
  });
}

/** Lit l'état de la permission géoloc si supporté. */
async function getGeolocPermissionState(): Promise<
  'granted' | 'prompt' | 'denied' | 'unsupported'
> {
  if (typeof navigator === 'undefined') return 'unsupported';
  if (!('permissions' in navigator) || !navigator.permissions?.query) {
    return 'prompt'; // best effort
  }
  try {
    const status = await navigator.permissions.query({
      name: 'geolocation' as PermissionName,
    });
    return status.state as 'granted' | 'prompt' | 'denied';
  } catch {
    return 'prompt';
  }
}

/**
 * Appelle /api/search/place avec lat,lng et la spec.
 * Retourne {places, intent_query, intent_label_fr} ; null si erreur fatale.
 */
async function fetchPlaces(
  lat: number,
  lng: number,
  spec: PlaceSearchSpec
): Promise<{ places: PlaceCardData[]; intent_query: string; intent_label_fr: string } | null> {
  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      category: spec.category,
      radius: '1500',
      limit: '6',
    });
    if (spec.amenity) {
      params.set('amenity', spec.amenity);
    }
    const res = await fetch(`/api/search/place?${params.toString()}`);
    if (!res.ok) return null;
    const data = await res.json();
    const places: PlaceCardData[] = Array.isArray(data?.places)
      ? (data.places as PlaceCardData[])
      : [];
    const intent_query =
      typeof data?.intent_query === 'string' ? (data.intent_query as string) : 'restaurant';
    const intent_label_fr =
      typeof data?.intent_label_fr === 'string'
        ? (data.intent_label_fr as string)
        : 'restaurants';
    return { places, intent_query, intent_label_fr };
  } catch (e) {
    console.error('[fetchPlaces]', e);
    return null;
  }
}

/** Géocode une ville via /api/geocode. */
async function geocodeCity(
  city: string
): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `/api/geocode?city=${encodeURIComponent(city)}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (
      data &&
      typeof data.lat === 'number' &&
      typeof data.lng === 'number' &&
      Number.isFinite(data.lat) &&
      Number.isFinite(data.lng)
    ) {
      return { lat: data.lat, lng: data.lng };
    }
    return null;
  } catch (e) {
    console.error('[geocodeCity]', e);
    return null;
  }
}

/** Persiste places + requires_geoloc + intent metadata en DB côté serveur. */
async function persistMessagePlaces(
  messageId: string,
  places: PlaceCardData[] | null,
  requiresGeoloc: boolean,
  intentQuery?: string,
  intentLabelFr?: string,
  userLat?: number,
  userLng?: number
): Promise<void> {
  if (!messageId || messageId.startsWith('temp-') || messageId.startsWith('agent-')) {
    return; // pas encore d'ID DB stable
  }
  try {
    await fetch(`/api/messages/${messageId}/places`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        places,
        requires_geoloc: requiresGeoloc,
        intent_query: intentQuery,
        intent_label_fr: intentLabelFr,
        user_lat: userLat,
        user_lng: userLng,
      }),
    });
  } catch (e) {
    console.error('[persistMessagePlaces]', e);
  }
}

/** Sélecteur helper : retourne les IDs des messages dans la sélection contiguë. */
export function selectIdsInRange(state: ChatState): string[] {
  const { messages, selectionStartId, selectionEndId } = state;
  if (!selectionStartId || !selectionEndId) return [];
  const startIdx = messages.findIndex((m) => m.id === selectionStartId);
  const endIdx = messages.findIndex((m) => m.id === selectionEndId);
  if (startIdx === -1 || endIdx === -1) return [];
  const minIdx = Math.min(startIdx, endIdx);
  const maxIdx = Math.max(startIdx, endIdx);
  return messages.slice(minIdx, maxIdx + 1).map((m) => m.id);
}

export const useChatStore = create<ChatState>()((set, get) => ({
  messages: [],
  isTyping: false,
  selectionMode: false,
  selectionStartId: null,
  selectionEndId: null,
  pendingPlaceSearch: null,

  sendMessage: async (text: string) => {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const optimisticMessage: ChatMessage = {
      id: tempId,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    set((state) => ({
      messages: [...state.messages, optimisticMessage],
      isTyping: true,
    }));

    // --- Cas spécial : on attend une ville en clair de la part de l'utilisateur ---
    const pending = get().pendingPlaceSearch;
    if (pending) {
      // L'utilisateur vient peut-être de donner la ville en réponse à
      // "Tu veux chercher dans quelle ville ?". On tente le géocodage avant
      // même d'appeler l'IA (économie d'1 round-trip). On garde aussi la
      // possibilité que ce ne soit pas une ville → fallback /api/chat normal.
      const candidateCity = text.trim().replace(/^(à|a|sur|dans|en|au|aux)\s+/i, '');
      if (candidateCity.length >= 2 && candidateCity.length <= 60) {
        const coords = await geocodeCity(candidateCity);
        if (coords) {
          // Géocodage OK → exécute la search en attente
          const result = await fetchPlaces(coords.lat, coords.lng, pending.spec);
          saveCachedGeoloc(coords.lat, coords.lng);
          const places = result?.places ?? [];

          set((state) => {
            const updated = state.messages.map((m) =>
              m.id === tempId ? { ...m, id: m.id } : m
            );
            const agentMessage: ChatMessage = {
              id: `agent-${Date.now()}`,
              role: 'agent',
              content: places.length > 0
                ? `Voici ce que j'ai trouvé à ${candidateCity} 👇`
                : `Je n'ai rien trouvé à ${candidateCity} pour le moment.`,
              links: [],
              places,
              intent_query: result?.intent_query,
              intent_label_fr: result?.intent_label_fr,
              user_lat: coords.lat,
              user_lng: coords.lng,
              timestamp: Date.now(),
            };
            return {
              messages: [...updated, agentMessage],
              isTyping: false,
              pendingPlaceSearch: null,
            };
          });
          return;
        }
      }
      // Géocodage KO → on abandonne le pending et on tombe sur le flow normal
      set({ pendingPlaceSearch: null });
    }

    try {
      // history = derniers messages avant l'optimistic, mappés au format API
      const priorMessages = get().messages.filter((m) => m.id !== tempId);
      const history = priorMessages.slice(-6).map((m) => ({
        role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.content,
      }));

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
      });

      if (!response.ok) {
        throw new Error(`Chat API error: ${response.status}`);
      }

      const data = await response.json();
      const {
        text: agentText,
        links,
        youtube,
        placeSearch,
        recipe,
        products,
        wikipedia,
        weather,
        web_search,
        tiktok,
        places: prefetchedPlaces,
        intent_query: prefetchedIntentQuery,
        intent_label_fr: prefetchedIntentLabelFr,
        user_lat: prefetchedUserLat,
        user_lng: prefetchedUserLng,
        userMessageId,
        agentMessageId,
      } = data as {
        text: string;
        links?: string[];
        youtube?: ChatMessage['youtube'];
        placeSearch?: PlaceSearchSpec;
        recipe?: ChatMessage['recipe'];
        products?: ProductCardData[] | null;
        wikipedia?: ChatMessage['wikipedia'];
        weather?: ChatMessage['weather'];
        web_search?: ChatMessage['web_search'];
        tiktok?: ChatMessage['tiktok'];
        places?: ChatMessage['places'];
        intent_query?: string;
        intent_label_fr?: string;
        user_lat?: number;
        user_lng?: number;
        userMessageId?: string;
        agentMessageId?: string;
      };

      // --- Insertion du message agent (avec places pré-fetché si dispo) ---
      const stableAgentId = agentMessageId || `agent-${Date.now()}`;
      set((state) => {
        const updatedMessages = state.messages.map((msg) =>
          msg.id === tempId ? { ...msg, id: userMessageId || tempId } : msg
        );
        const agentMessage: ChatMessage = {
          id: stableAgentId,
          role: 'agent',
          content: agentText,
          links: links || [],
          youtube: youtube === undefined ? undefined : youtube,
          recipe: recipe === undefined ? undefined : recipe,
          products: products === undefined ? undefined : products,
          wikipedia: wikipedia === undefined ? undefined : wikipedia,
          weather: weather === undefined ? undefined : weather,
          web_search: web_search === undefined ? undefined : web_search,
          tiktok: tiktok === undefined ? undefined : tiktok,
          places: prefetchedPlaces === undefined ? undefined : prefetchedPlaces,
          intent_query: prefetchedIntentQuery,
          intent_label_fr: prefetchedIntentLabelFr,
          user_lat: prefetchedUserLat,
          user_lng: prefetchedUserLng,
          timestamp: Date.now(),
        };
        return {
          messages: [...updatedMessages, agentMessage],
          isTyping: false,
        };
      });

      // --- Flow place si DeepSeek a demandé une placeSearch (pas pré-fetché) ---
      if (placeSearch && placeSearch.type === 'place' && !prefetchedPlaces) {
        await get_handlePlaceSearch(stableAgentId, placeSearch, set, get);
      }
    } catch (error) {
      console.error('sendMessage error:', error);
      set({ isTyping: false });
    }
  },

  sendMedia: async (media, caption?: string) => {
    const text = (caption || '').trim();
    const tempId = `temp-media-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const optimisticMessage: ChatMessage = {
      id: tempId,
      role: 'user',
      content: text,
      media,
      timestamp: Date.now(),
    };

    set((state) => ({
      messages: [...state.messages, optimisticMessage],
      isTyping: text.length > 0, // pas de typing si pas de question à l'IA
    }));

    try {
      const priorMessages = get().messages.filter((m) => m.id !== tempId);
      const history = priorMessages.slice(-6).map((m) => ({
        role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.content,
      }));

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history, media }),
      });
      if (!response.ok) throw new Error(`Chat API error: ${response.status}`);

      const data = await response.json();

      // Pas de caption → /api/chat short-circuit, pas de réponse IA. On
      // confirme juste l'ID stable côté optimistic.
      if (!text) {
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === tempId ? { ...m, id: data.userMessageId || tempId } : m
          ),
          isTyping: false,
        }));
        return;
      }

      const {
        text: agentText,
        links,
        youtube,
        placeSearch,
        recipe,
        products,
        wikipedia,
        weather,
        web_search,
        tiktok,
        places: prefetchedPlaces,
        intent_query: prefetchedIntentQuery,
        intent_label_fr: prefetchedIntentLabelFr,
        user_lat: prefetchedUserLat,
        user_lng: prefetchedUserLng,
        userMessageId,
        agentMessageId,
      } = data as {
        text: string;
        links?: string[];
        youtube?: ChatMessage['youtube'];
        placeSearch?: PlaceSearchSpec;
        recipe?: ChatMessage['recipe'];
        products?: ProductCardData[] | null;
        wikipedia?: ChatMessage['wikipedia'];
        weather?: ChatMessage['weather'];
        web_search?: ChatMessage['web_search'];
        tiktok?: ChatMessage['tiktok'];
        places?: ChatMessage['places'];
        intent_query?: string;
        intent_label_fr?: string;
        user_lat?: number;
        user_lng?: number;
        userMessageId?: string;
        agentMessageId?: string;
      };

      const stableAgentId = agentMessageId || `agent-${Date.now()}`;
      set((state) => {
        const updatedMessages = state.messages.map((msg) =>
          msg.id === tempId ? { ...msg, id: userMessageId || tempId } : msg
        );
        const agentMessage: ChatMessage = {
          id: stableAgentId,
          role: 'agent',
          content: agentText,
          links: links || [],
          youtube: youtube === undefined ? undefined : youtube,
          recipe: recipe === undefined ? undefined : recipe,
          products: products === undefined ? undefined : products,
          wikipedia: wikipedia === undefined ? undefined : wikipedia,
          weather: weather === undefined ? undefined : weather,
          web_search: web_search === undefined ? undefined : web_search,
          tiktok: tiktok === undefined ? undefined : tiktok,
          places: prefetchedPlaces === undefined ? undefined : prefetchedPlaces,
          intent_query: prefetchedIntentQuery,
          intent_label_fr: prefetchedIntentLabelFr,
          user_lat: prefetchedUserLat,
          user_lng: prefetchedUserLng,
          timestamp: Date.now(),
        };
        return {
          messages: [...updatedMessages, agentMessage],
          isTyping: false,
        };
      });

      if (placeSearch && placeSearch.type === 'place' && !prefetchedPlaces) {
        await get_handlePlaceSearch(stableAgentId, placeSearch, set, get);
      }
    } catch (error) {
      console.error('sendMedia error:', error);
      set({ isTyping: false });
    }
  },

  reset: () => {
    set({
      messages: [],
      isTyping: false,
      selectionMode: false,
      selectionStartId: null,
      selectionEndId: null,
      pendingPlaceSearch: null,
    });
  },

  seed: (initial: ChatMessage[]) => {
    set({ messages: initial });
  },

  enterSelection: (initialId?: string) => {
    set({
      selectionMode: true,
      selectionStartId: initialId ?? null,
      selectionEndId: initialId ?? null,
    });
  },

  exitSelection: () => {
    set({
      selectionMode: false,
      selectionStartId: null,
      selectionEndId: null,
    });
  },

  extendSelectionTo: (id: string) => {
    set((state) => {
      const { messages, selectionStartId, selectionEndId } = state;
      if (!selectionStartId || !selectionEndId) {
        // Sélection vide → initialiser
        return { selectionStartId: id, selectionEndId: id };
      }
      const currentStartIdx = messages.findIndex((m) => m.id === selectionStartId);
      const currentEndIdx = messages.findIndex((m) => m.id === selectionEndId);
      const targetIdx = messages.findIndex((m) => m.id === id);
      if (targetIdx === -1) return state; // ID introuvable

      const minIdx = Math.min(currentStartIdx, currentEndIdx);
      const maxIdx = Math.max(currentStartIdx, currentEndIdx);

      if (targetIdx > minIdx && targetIdx < maxIdx) {
        // Cible à l'intérieur de la range → réduire
        const distToStart = targetIdx - minIdx;
        const distToEnd = maxIdx - targetIdx;
        if (distToStart <= distToEnd) {
          return { selectionEndId: id };
        } else {
          return { selectionStartId: id };
        }
      } else if (targetIdx < minIdx) {
        // Étendre vers le bas (plus ancien)
        return { selectionStartId: id };
      } else if (targetIdx > maxIdx) {
        // Étendre vers le haut (plus récent)
        return { selectionEndId: id };
      }
      return state;
    });
  },

  clearSelection: () => {
    set({ selectionStartId: null, selectionEndId: null });
  },

  loadFromServer: async () => {
    try {
      const response = await fetch('/api/conversation');
      if (!response.ok) {
        throw new Error(`Conversation API error: ${response.status}`);
      }
      const data = await response.json();
      const { messages } = data;
      if (Array.isArray(messages)) {
        set({ messages });
      }
    } catch (error) {
      console.error('loadFromServer error:', error);
    }
  },

  publishSelection: async () => {
    const orderedIds = selectIdsInRange(get());
    if (orderedIds.length === 0) {
      return { ok: false };
    }

    try {
      const response = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageIds: orderedIds }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error(
          'publishSelection error:',
          errorData.error || response.statusText
        );
        return { ok: false };
      }

      const data = await response.json();
      get().clearSelection();
      get().exitSelection();
      return { ok: true, postId: data.id };
    } catch (error) {
      console.error('publishSelection error:', error);
      return { ok: false };
    }
  },

  /**
   * Déclenché par GeolocRequestBubble : tente d'obtenir la position et,
   * si une placeSearch est en attente, l'exécute.
   */
  requestGeolocation: async () => {
    const pending = get().pendingPlaceSearch;
    let coords: { lat: number; lng: number };
    try {
      coords = await getCurrentPosition();
    } catch (e) {
      // Permission refusée ou erreur → on bascule en mode "demande ville manuelle"
      if (pending) {
        // remplace la bulle requires_geoloc par un nouveau message agent
        set((state) => ({
          messages: [
            ...state.messages.map((m) =>
              m.id === pending.messageId
                ? { ...m, requires_geoloc: false }
                : m
            ),
            {
              id: `agent-${Date.now()}`,
              role: 'agent',
              content: 'OK, tu veux chercher dans quelle ville ?',
              links: [],
              timestamp: Date.now(),
            } as ChatMessage,
          ],
        }));
        // pendingPlaceSearch reste actif pour que le prochain message user
        // soit interprété comme une ville.
      }
      throw e;
    }

    saveCachedGeoloc(coords.lat, coords.lng);

    if (pending) {
      const result = await fetchPlaces(coords.lat, coords.lng, pending.spec);
      const places = result?.places ?? [];
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === pending.messageId
            ? {
                ...m,
                requires_geoloc: false,
                places,
                intent_query: result?.intent_query,
                intent_label_fr: result?.intent_label_fr,
                user_lat: coords.lat,
                user_lng: coords.lng,
              }
            : m
        ),
        pendingPlaceSearch: null,
      }));
      await persistMessagePlaces(
        pending.messageId,
        places,
        false,
        result?.intent_query,
        result?.intent_label_fr,
        coords.lat,
        coords.lng
      );
    }
  },
}));

/**
 * Helper module-local : traite une placeSearch reçue de l'API chat.
 * Gère ville → géocodage → fetch, OU geoloc nav (granted/prompt/denied).
 * Important : on évite une closure circulaire sur le store en passant set/get.
 */
async function get_handlePlaceSearch(
  agentMessageId: string,
  spec: PlaceSearchSpec,
  set: (
    partial:
      | Partial<ChatState>
      | ((state: ChatState) => Partial<ChatState>)
  ) => void,
  get: () => ChatState
): Promise<void> {
  // 1. Ville explicite → géocode direct
  if (spec.city && spec.city.trim().length > 0) {
    const coords = await geocodeCity(spec.city);
    if (!coords) {
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === agentMessageId
            ? {
                ...m,
                content:
                  m.content +
                  `\n\n(Je n'ai pas trouvé la ville "${spec.city}".)`,
              }
            : m
        ),
      }));
      return;
    }
    saveCachedGeoloc(coords.lat, coords.lng);
    const result = await fetchPlaces(coords.lat, coords.lng, spec);
    const places = result?.places ?? [];
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === agentMessageId
          ? {
              ...m,
              places,
              intent_query: result?.intent_query,
              intent_label_fr: result?.intent_label_fr,
              user_lat: coords.lat,
              user_lng: coords.lng,
            }
          : m
      ),
    }));
    await persistMessagePlaces(
      agentMessageId,
      places,
      false,
      result?.intent_query,
      result?.intent_label_fr,
      coords.lat,
      coords.lng
    );
    return;
  }

  // 2. Pas de ville → geoloc navigateur
  // 2a. Cache session ?
  const cached = readCachedGeoloc();
  if (cached) {
    const result = await fetchPlaces(cached.lat, cached.lng, spec);
    const places = result?.places ?? [];
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === agentMessageId
          ? {
              ...m,
              places,
              intent_query: result?.intent_query,
              intent_label_fr: result?.intent_label_fr,
              user_lat: cached.lat,
              user_lng: cached.lng,
            }
          : m
      ),
    }));
    await persistMessagePlaces(
      agentMessageId,
      places,
      false,
      result?.intent_query,
      result?.intent_label_fr,
      cached.lat,
      cached.lng
    );
    return;
  }

  // 2b. État permission
  const permState = await getGeolocPermissionState();

  if (permState === 'granted') {
    try {
      const coords = await getCurrentPosition();
      saveCachedGeoloc(coords.lat, coords.lng);
      const result = await fetchPlaces(coords.lat, coords.lng, spec);
      const places = result?.places ?? [];
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === agentMessageId
            ? {
                ...m,
                places,
                intent_query: result?.intent_query,
                intent_label_fr: result?.intent_label_fr,
                user_lat: coords.lat,
                user_lng: coords.lng,
              }
            : m
        ),
      }));
      await persistMessagePlaces(
        agentMessageId,
        places,
        false,
        result?.intent_query,
        result?.intent_label_fr,
        coords.lat,
        coords.lng
      );
      return;
    } catch {
      // tombe sur prompt
    }
  }

  if (permState === 'denied') {
    // Direct : on demande la ville
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: `agent-${Date.now()}`,
          role: 'agent',
          content: 'Je n\'ai pas accès à ta position. Tu veux chercher dans quelle ville ?',
          links: [],
          timestamp: Date.now(),
        } as ChatMessage,
      ],
      pendingPlaceSearch: { messageId: agentMessageId, spec },
    }));
    return;
  }

  // permState === 'prompt' (ou unsupported best-effort)
  set((state) => ({
    messages: state.messages.map((m) =>
      m.id === agentMessageId ? { ...m, requires_geoloc: true } : m
    ),
    pendingPlaceSearch: { messageId: agentMessageId, spec },
  }));
  await persistMessagePlaces(agentMessageId, null, true);

  // Évite warning lint sur get inutilisé en branche prompt
  void get;
}
