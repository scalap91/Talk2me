'use client';

/* eslint-disable @next/next/no-img-element */
/**
 * Talk2Me — DÉPÔT D'ANNONCE (Pascal 2026-06-11). Formulaire IMPOSÉ en mode annonce :
 * photo, catégorie, titre, description, prix, ville. Enregistrer en BROUILLON ou
 * PUBLIER. Option : rattacher à une de ses boutiques. Données réelles (grounding).
 */
import { useEffect, useState } from 'react';
import { imageHasPhoneNumber, CONTACT_LEAK_MSG } from '@/lib/client/image-guard';
import { createPortal } from 'react-dom';
import { X, Loader2, ImagePlus, MapPin, Megaphone, Rocket } from '@/lib/icons';
import { useRouter } from 'next/navigation';
import { fromMinor, currencyLabel } from '@/lib/money';
import RentalPlanningPanel from '@/components/rental/RentalPlanningPanel';
import ReferentSection from '@/components/shop/ReferentSection';

// « Plat » retiré : le plat maison a son propre flux (géoloc voisins), pas les annonces.
// 'Services' et 'Emploi' RETIRÉS des annonces (Pascal 2026-07-05) : déjà couverts par
// les boutons dédiés 🔧 Service / 💼 Emploi dans « + Créer ». Pas de doublon.
const CATEGORIES = ['Mode', 'Maison', 'Électronique', 'Téléphones', 'Véhicules', 'Beauté', 'Loisirs', 'Immobilier', 'Autres'];

// Champs SPÉCIFIQUES par catégorie (façon Leboncoin). Rendu dynamiquement sous la
// catégorie choisie. Une catégorie absente d'ici = pas de champ spécifique.
type Attr = { key: string; label: string; type: 'text' | 'number' | 'select'; options?: string[]; placeholder?: string; suffix?: string };
const ETAT = ['Neuf', 'Très bon état', 'Bon état', 'État correct', 'Pour pièces'];
const ATTRIBUTES: Record<string, Attr[]> = {
  'Véhicules': [
    { key: 'type', label: 'Type de véhicule', type: 'select', options: ['Voiture', 'Moto', 'Scooter', 'Camion', 'Utilitaire', 'Tuk-tuk', 'Bus', 'Vélo', 'Autre'] },
    { key: 'marque', label: 'Marque', type: 'text', placeholder: 'Ex : Toyota' },
    { key: 'modele', label: 'Modèle', type: 'text', placeholder: 'Ex : Yaris' },
    { key: 'annee', label: 'Année', type: 'number', placeholder: 'Ex : 2018' },
    { key: 'km', label: 'Kilométrage', type: 'number', placeholder: 'Ex : 80000', suffix: 'km' },
    { key: 'carburant', label: 'Carburant', type: 'select', options: ['Essence', 'Diesel', 'Hybride', 'Électrique', 'GPL'] },
    { key: 'boite', label: 'Boîte de vitesse', type: 'select', options: ['Manuelle', 'Automatique'] },
    { key: 'portes', label: 'Nombre de portes', type: 'select', options: ['2', '3', '4', '5'] },
    { key: 'places', label: 'Nombre de places', type: 'number', placeholder: 'Ex : 5' },
    { key: 'etat', label: 'État', type: 'select', options: ETAT },
  ],
  'Immobilier': [
    { key: 'transaction', label: 'Transaction', type: 'select', options: ['Location', 'Vente'] },
    { key: 'type', label: 'Type de bien', type: 'select', options: ['Appartement', 'Maison', 'Studio', 'Terrain', 'Local commercial', 'Bureau'] },
    { key: 'surface', label: 'Surface', type: 'number', placeholder: 'Ex : 75', suffix: 'm²' },
    { key: 'pieces', label: 'Nombre de pièces', type: 'number', placeholder: 'Ex : 3' },
    { key: 'chambres', label: 'Chambres', type: 'number', placeholder: 'Ex : 2' },
    { key: 'meuble', label: 'Meublé', type: 'select', options: ['Oui', 'Non'] },
  ],
  'Téléphones': [
    { key: 'marque', label: 'Marque', type: 'text', placeholder: 'Ex : Samsung' },
    { key: 'modele', label: 'Modèle', type: 'text', placeholder: 'Ex : Galaxy S23' },
    { key: 'stockage', label: 'Stockage', type: 'select', options: ['32 Go', '64 Go', '128 Go', '256 Go', '512 Go', '1 To'] },
    { key: 'debloque', label: 'Débloqué tout opérateur', type: 'select', options: ['Oui', 'Non'] },
    { key: 'etat', label: 'État', type: 'select', options: ETAT },
  ],
  'Électronique': [
    { key: 'type', label: 'Type', type: 'text', placeholder: 'Ex : Ordinateur portable' },
    { key: 'marque', label: 'Marque', type: 'text', placeholder: 'Ex : HP' },
    { key: 'garantie', label: 'Sous garantie', type: 'select', options: ['Oui', 'Non'] },
    { key: 'etat', label: 'État', type: 'select', options: ETAT },
  ],
  'Mode': [
    { key: 'type', label: 'Type', type: 'text', placeholder: 'Ex : Veste, Chaussures…' },
    { key: 'taille', label: 'Taille', type: 'text', placeholder: 'Ex : M, 42…' },
    { key: 'couleur', label: 'Couleur', type: 'text', placeholder: 'Ex : Noir' },
    { key: 'etat', label: 'État', type: 'select', options: ETAT },
  ],
  'Emploi': [
    { key: 'contrat', label: 'Type de contrat', type: 'select', options: ['CDI', 'CDD', 'Freelance', 'Stage', 'Temps partiel', 'Saisonnier'] },
    { key: 'secteur', label: 'Secteur', type: 'text', placeholder: 'Ex : Restauration' },
    { key: 'experience', label: 'Expérience requise', type: 'text', placeholder: 'Ex : 2 ans' },
    { key: 'remote', label: 'Télétravail', type: 'select', options: ['Sur site', 'Hybride', 'Full remote'] },
  ],
  'Services': [
    { key: 'type', label: 'Type de service', type: 'text', placeholder: 'Ex : Plomberie, Ménage…' },
    { key: 'dispo', label: 'Disponibilité', type: 'text', placeholder: 'Ex : Week-ends' },
  ],
  'Maison': [
    { key: 'type', label: 'Type', type: 'text', placeholder: 'Ex : Canapé, Frigo…' },
    { key: 'etat', label: 'État', type: 'select', options: ETAT },
  ],
  'Loisirs': [
    { key: 'type', label: 'Type', type: 'text', placeholder: 'Ex : Vélo, Console…' },
    { key: 'etat', label: 'État', type: 'select', options: ETAT },
  ],
  'Beauté': [
    { key: 'type', label: 'Type', type: 'text', placeholder: 'Ex : Parfum, Soin…' },
    { key: 'etat', label: 'État', type: 'select', options: ['Neuf', 'Neuf sous blister', 'Entamé'] },
  ],
};

// Exemples de titre + description ADAPTÉS à la catégorie (placeholders).
const PLACEHOLDERS: Record<string, { title: string; desc: string }> = {
  'Véhicules': { title: 'Ex : Toyota Yaris 2018 essence', desc: 'Décris le véhicule : entretien, options, état carrosserie, raison de la vente…' },
  'Immobilier': { title: 'Ex : Appartement 3 pièces avec balcon', desc: 'Décris le bien : quartier, étage, charges, disponibilité…' },
  'Téléphones': { title: 'Ex : iPhone 13 128 Go très bon état', desc: 'Décris le téléphone : batterie, rayures, accessoires fournis…' },
  'Électronique': { title: 'Ex : PC portable HP 16 Go RAM', desc: 'Décris l’appareil : caractéristiques, état, garantie…' },
  'Mode': { title: 'Ex : Veste en cuir taille M', desc: 'Décris l’article : matière, taille, état, marque…' },
  'Maison': { title: 'Ex : Canapé 3 places gris', desc: 'Décris le meuble/objet : dimensions, état, matière…' },
  'Beauté': { title: 'Ex : Parfum 100 ml neuf', desc: 'Décris le produit : contenance, neuf/entamé, date…' },
  'Loisirs': { title: 'Ex : Vélo VTT 27,5"', desc: 'Décris l’article : taille, usage, état…' },
  'Services': { title: 'Ex : Plombier disponible week-ends', desc: 'Décris ton service : prestations, zone, tarifs…' },
  'Emploi': { title: 'Ex : Serveur(se) restaurant — CDI', desc: 'Décris le poste : missions, horaires, profil recherché…' },
};
const DEFAULT_PH = { title: 'Ex : iPhone 13 très bon état', desc: 'Décris ce que tu vends : état, détails, raison de la vente…' };

export interface AnnonceDraft {
  id?: string;
  title?: string;
  description?: string | null;
  category?: string;
  price_cents?: number | null;
  city?: string | null;
  image_url?: string | null;
  shop_id?: string | null;
  status?: 'draft' | 'published';
  rental?: number | boolean | null;
  driver_option?: string | null;
  attributes?: string | Record<string, string> | null; // détails structurés (JSON ou objet)
  photos?: string[] | string | null;                    // galerie multi-photos (JSON ou tableau)
  quantity?: number | null;                             // stock (null = non applicable)
  relist_at?: number | null;                            // immobilier occupé : remise en ligne auto (ms)
  deposit_cents?: number | null;                        // acompte de réservation demandé
}

// Catégories SANS stock (une annonce d'emploi, un appartement, un service = pas de quantité).
const NO_QUANTITY = ['Emploi', 'Immobilier', 'Services'];
const DAY_MS = 86400000;
// Date 'YYYY-MM-DD' d'un timestamp (input date).
function toDateInput(ms: number): string { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

// Parse tolérant : accepte un objet déjà parsé OU une string JSON OU null.
function parseAttrs(v: unknown): Record<string, string> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, string>;
  if (typeof v === 'string' && v.trim()) { try { const o = JSON.parse(v); return o && typeof o === 'object' ? o : {}; } catch { return {}; } }
  return {};
}
function parsePhotos(v: unknown, fallback?: string | null): string[] {
  let arr: string[] = [];
  if (Array.isArray(v)) arr = v.filter((x) => typeof x === 'string');
  else if (typeof v === 'string' && v.trim()) { try { const o = JSON.parse(v); if (Array.isArray(o)) arr = o.filter((x) => typeof x === 'string'); } catch { /* */ } }
  if (!arr.length && fallback) arr = [fallback];
  return arr;
}

// RATTRAPAGE anciennes annonces : les détails étaient AVANT collés en texte dans la
// description (« Type : M\nTaille : 43… »). Si l'attribut structuré est vide, on
// réextrait ces lignes dans les bons champs et on nettoie la description.
function healFolded(rawDesc: string, category: string, presetAttrs: Record<string, string>): { desc: string; attrs: Record<string, string> } {
  const list = ATTRIBUTES[category] || [];
  if (Object.keys(presetAttrs).length || !rawDesc || !list.length) return { desc: rawDesc, attrs: presetAttrs };
  const found: Record<string, string> = {};
  const kept: string[] = [];
  for (const line of rawDesc.split('\n')) {
    const m = line.match(/^\s*([^:]{1,30}?)\s*:\s*(.+?)\s*$/);
    if (m) {
      const attr = list.find((a) => a.label.toLowerCase() === m[1].trim().toLowerCase());
      if (attr) { let val = m[2].trim(); if (attr.suffix) val = val.replace(new RegExp('\\s*' + attr.suffix + '$'), '').trim(); found[attr.key] = val; continue; }
    }
    kept.push(line);
  }
  return { desc: kept.join('\n').trim(), attrs: found };
}

export default function DepositAnnonceSheet({
  initial, onClose, onSaved, itemSource,
}: {
  initial?: AnnonceDraft; onClose: () => void; onSaved: () => void;
  // UN seul formulaire d'édition : si l'article vient d'une BOUTIQUE (messagerie),
  // on enregistre dans l'article de boutique au lieu de deposit_annonces. Même rendu,
  // même champs, qu'on édite depuis la boutique ou depuis les annonces (Pascal 2026-06-27).
  itemSource?: { shopId: string } | null;
}) {
  const _healed = healFolded(initial?.description || '', initial?.category || '', parseAttrs(initial?.attributes));
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title || '');
  const [category, setCategory] = useState(initial?.category || '');
  const [description, setDescription] = useState(_healed.desc);
  const [price, setPrice] = useState(initial?.price_cents != null ? String(fromMinor(initial.price_cents)) : '');
  const [city, setCity] = useState(initial?.city || '');
  // Galerie multi-photos (min 4 conseillé). La 1re = couverture.
  const [photos, setPhotos] = useState<string[]>(parsePhotos(initial?.photos, initial?.image_url || null));
  const cover = photos[0] || null;
  // ✨ Baguette magique : l'IA corrige TOUTE l'annonce (titre + description) en regardant l'ensemble
  // des champs ET la PHOTO (vision pool = GPU du téléphone), garde la langue (FR/malgache), n'invente rien. Pascal 2026-07-12.
  const [refining, setRefining] = useState(false);
  const refineDesc = async () => {
    if (refining) return;
    if (!title.trim() && !description.trim()) return;
    setRefining(true);
    try {
      const r = await fetch('/api/annonces/refine', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, category, city, price, photo: cover || '' }),
      });
      const d = await r.json().catch(() => null);
      if (d?.ok) {
        if (typeof d.title === 'string') setTitle(d.title);
        if (typeof d.description === 'string') setDescription(d.description);
      }
    } catch { /* échec → on garde les textes d'origine */ } finally { setRefining(false); }
  };
  const [shopId, setShopId] = useState<string>(initial?.shop_id || '');
  const [shops, setShops] = useState<{ id: string; name: string }[]>([]);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [busy, setBusy] = useState<null | 'draft' | 'published' | 'upload'>(null);
  const [err, setErr] = useState('');
  // Champs spécifiques à la catégorie (clé → valeur) — chargés depuis l'attribut
  // STRUCTURÉ (plus jamais reparsés depuis la description).
  const [attrs, setAttrs] = useState<Record<string, string>>(_healed.attrs);
  const [rental, setRental] = useState<boolean>(!!initial?.rental);
  const [driverOption, setDriverOption] = useState<string>(initial?.driver_option || '');
  const [quantity, setQuantity] = useState<string>(initial?.quantity != null ? String(initial.quantity) : '1');
  // Immobilier occupé : date de DÉPART du locataire → remise en ligne auto 2 mois avant.
  const [departure, setDeparture] = useState<string>(initial?.relist_at != null ? toDateInput(initial.relist_at + 60 * DAY_MS) : '');
  // Acompte de réservation demandé (Immobilier) — l'acheteur le verse pour bloquer le bien.
  const [deposit, setDeposit] = useState<string>(initial?.deposit_cents != null ? String(fromMinor(initial.deposit_cents)) : '');
  // Formulaire en DEUX parties (Pascal 2026-06-27) : en messagerie, le cœur reste
  // simple (photo/titre/prix) ; cocher « Publier dans les annonces » DÉROULE la
  // partie détaillée (catégorie, détails, ville). En mode annonce pur, toujours ouvert.
  const [annonceMode, setAnnonceMode] = useState<boolean>(itemSource ? initial?.status === 'published' : true);
  const [diffusing, setDiffusing] = useState<null | 'story' | 'feed'>(null);
  const [diffMsg, setDiffMsg] = useState('');
  const catAttrs = ATTRIBUTES[category] || [];
  const ph = PLACEHOLDERS[category] || DEFAULT_PH;
  // Immobilier en LOCATION = location façon Airbnb (nuits) → même moteur que les
  // voitures (calendrier + dispo + réservation par annonce).
  const immoLocation = category === 'Immobilier' && attrs.transaction === 'Location';
  const isRental = (category === 'Véhicules' && rental) || immoLocation;
  const rentalUnit = immoLocation ? ' / nuit' : ' / jour';
  // Quantité applicable sauf emploi / immobilier / service (et pas pour une location).
  const hasQuantity = !NO_QUANTITY.includes(category) && !isRental;

  const locate = () => {
    if (!('geolocation' in navigator)) { setErr('Géolocalisation indisponible sur cet appareil.'); return; }
    setGeoBusy(true); setErr('');
    navigator.geolocation.getCurrentPosition(
      (p) => { setLat(p.coords.latitude); setLng(p.coords.longitude); setGeoBusy(false); },
      () => { setGeoBusy(false); setErr('Localisation refusée.'); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  useEffect(() => {
    fetch('/api/annonces/mine', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.ok) setShops(d.shops || []); })
      .catch(() => {});
  }, []);

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setBusy('upload');
    try {
      for (const f of files) {
        if (await imageHasPhoneNumber(f)) { alert(CONTACT_LEAK_MSG); continue; } // anti-désintermédiation
        const fd = new FormData(); fd.append('file', f);
        const r = await fetch('/api/upload', { method: 'POST', body: fd });
        const d = await r.json().catch(() => null);
        if (d?.url) setPhotos((p) => (p.length >= 8 ? p : [...p, d.url]));
      }
    } finally { setBusy(null); }
    try { e.target.value = ''; } catch { /* */ }
  };
  const removePhoto = (url: string) => setPhotos((p) => p.filter((u) => u !== url));

  // Après un enregistrement réussi : on ferme, et si PUBLIÉ → on atterrit sur le FEED ANNONCES
  // pour voir tout de suite ce qu'on vient de publier. Pascal 2026-07-12.
  const afterSave = (status: 'draft' | 'published') => {
    onSaved();
    if (status === 'published') {
      try { sessionStorage.setItem('t2m_shop_section', 'annonces'); } catch { /* */ }
      router.push('/shop');
    }
  };

  const save = async (status: 'draft' | 'published') => {
    setErr('');
    if (!title.trim()) { setErr('Donne un titre.'); return; }
    // Au moins 1 photo (jusqu'à 8). Pas d'obligation de 4 — inutile pour un article simple.
    if (photos.length < 1) { setErr('Ajoute au moins une photo.'); return; }
    // Catégorie obligatoire UNIQUEMENT pour une annonce (article simple = pas requise).
    if (!category && status === 'published') { setErr('Choisis une catégorie pour l’annonce.'); return; }
    if (status === 'published') {
      if (!price.trim()) { setErr('Indique un prix pour publier.'); return; }
      if (!city.trim()) { setErr('Indique ta ville pour publier.'); return; }
    }
    // Détails STRUCTURÉS (couleur, taille…) → objet JSON, JAMAIS dans la description.
    const attributesObj: Record<string, string> = {};
    for (const a of catAttrs) { const v = (attrs[a.key] || '').trim(); if (v) attributesObj[a.key] = v; }
    const cleanDesc = description.trim() || null;
    // Stock : null si non applicable (emploi/immo/service/location), sinon entier (≥0, défaut 1).
    const qty = hasQuantity ? (quantity.trim() === '' ? 1 : Math.max(0, parseInt(quantity, 10) || 0)) : null;
    // Immobilier occupé : remise en ligne = 2 mois (60j) avant la date de départ saisie.
    const relistAt = category === 'Immobilier' && departure ? (Date.parse(departure + 'T00:00:00') - 60 * DAY_MS) : null;
    const depositAr = category === 'Immobilier' && deposit.trim() ? Math.max(0, parseInt(deposit.replace(/[^0-9]/g, ''), 10) || 0) : null;
    // Parse prix robuste : on garde chiffres + 1 séparateur décimal (gère « 1 234,56 », « 1,234.56 »).
    let priceNum: number | null = null;
    if (price.trim()) {
      const c = price.replace(/[^\d.,]/g, '').replace(/,/g, '.');
      const parts = c.split('.');
      const norm = parts.length > 1 ? `${parts.slice(0, -1).join('')}.${parts[parts.length - 1]}` : c;
      const v = parseFloat(norm);
      priceNum = Number.isFinite(v) ? v : null;
    }
    setBusy(status);
    try {
      // MODE BOUTIQUE (article créé en messagerie) : on enregistre dans l'article de
      // boutique via l'API simple-shop, même formulaire. « Publier » = visible dans les
      // Petites annonces ; « Brouillon » = reste dans la boutique seule.
      if (itemSource) {
        const base = `/api/simple-shop/${itemSource.shopId}/item`;
        const jh = { 'Content-Type': 'application/json' };
        let itemId = initial?.id;
        if (!itemId) {
          // CRÉATION d'un nouvel article depuis le formulaire (messagerie).
          const rc = await fetch(base, { method: 'POST', headers: jh, body: JSON.stringify({ image_url: cover, price: priceNum ?? 0, label: title.trim(), description: cleanDesc, category, attributes: attributesObj, photos, quantity: qty }) });
          const dc = await rc.json().catch(() => null);
          if (!rc.ok || !dc?.item?.id) { setErr('Création impossible, réessaie.'); setBusy(null); return; }
          itemId = dc.item.id;
        } else {
          // ÉDITION d'un article existant.
          if (cover && cover !== (initial?.image_url || null)) {
            await fetch(base, { method: 'PATCH', headers: jh, body: JSON.stringify({ item_id: itemId, image_url: cover }) }).catch(() => {});
          }
          const rf = await fetch(base, { method: 'PATCH', headers: jh, body: JSON.stringify({ item_id: itemId, action: 'edit', label: title.trim(), price: priceNum ?? 0, description: cleanDesc, category, attributes: attributesObj, photos, quantity: qty }) });
          if (!rf.ok) { setErr('Échec, réessaie.'); setBusy(null); return; }
        }
        // Destination annonce : Publier = visible Petites annonces ; sinon boutique seule.
        await fetch(base, {
          method: 'PATCH', headers: jh,
          body: JSON.stringify(status === 'published'
            ? { item_id: itemId, action: 'annonce', on: true, category, city: city.trim(), lat, lng }
            : { item_id: itemId, action: 'annonce', on: false }),
        }).catch(() => {});
        afterSave(status);
        return;
      }
      const r = await fetch('/api/annonces/mine', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: initial?.id, title: title.trim(), description: cleanDesc, category,
          price: priceNum,
          city: city.trim() || null, image_url: cover, shop_id: shopId || null, status,
          lat, lng,
          attributes: attributesObj, photos, quantity: qty, relist_at: relistAt, deposit: depositAr,
          rental: (category === 'Véhicules' ? rental : false) || immoLocation,
          driver_option: category === 'Véhicules' && rental ? (driverOption || null) : null,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d?.error === 'incomplete' ? 'Pour publier : photo + prix + ville obligatoires.' : 'Échec, réessaie.'); setBusy(null); return; }
      afterSave(status);
    } finally { setBusy(null); }
  };

  // Diffusion (mode messagerie) : Story = la photo de l'article dans ma story ;
  // Feed = publie la vitrine de la boutique sur le hub (VitrineCard).
  const toStory = async () => {
    if (!cover) { setErr('Ajoute une photo avant de la mettre en story.'); return; }
    setErr(''); setDiffMsg(''); setDiffusing('story');
    try {
      const r = await fetch('/api/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'image', media_url: cover, caption: title.trim() || null }) });
      setDiffMsg(r.ok ? '✓ Ajouté à ta story' : ''); if (!r.ok) setErr('Échec de la story.');
    } catch { setErr('Échec de la story.'); } finally { setDiffusing(null); }
  };
  const toFeed = async () => {
    if (!itemSource) return;
    setErr(''); setDiffMsg(''); setDiffusing('feed');
    try {
      const r = await fetch(`/api/simple-shop/${itemSource.shopId}/publish`, { method: 'POST' });
      setDiffMsg(r.ok ? '✓ Ta boutique est sur le feed' : ''); if (!r.ok) setErr('Échec du feed.');
    } catch { setErr('Échec du feed.'); } finally { setDiffusing(null); }
  };

  const label = 'block text-[12px] text-[var(--t2m-ink-3)] mb-1';
  const field = 'w-full bg-[var(--t2m-wash)] border border-[var(--t2m-line)] rounded-lg px-3 py-2.5 text-[14px] text-[var(--t2m-ink)] outline-none focus:border-[var(--t2m-primary)]';

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] bg-[var(--t2m-paper)] md:bg-black/70 md:backdrop-blur-sm flex flex-col md:items-center md:justify-center">
      <div className="flex flex-col w-full h-full md:h-auto md:max-h-[90dvh] md:w-full md:max-w-md md:rounded-2xl md:border md:border-[var(--t2m-line)] bg-[var(--t2m-paper)] overflow-hidden">
      <header className="shrink-0 flex items-center justify-between gap-2 px-3 border-b border-[var(--t2m-line)]" style={{ height: 'calc(env(safe-area-inset-top) + 3.25rem)', paddingTop: 'env(safe-area-inset-top)' }}>
        <h1 className="text-[16px] font-semibold text-[var(--t2m-ink)]">{initial?.id ? 'Modifier l’annonce' : 'Nouvelle annonce'}</h1>
        {/* Croix à DROITE (Pascal 2026-07-12) — style à répliquer sur toutes les autres feuilles (qui ont une flèche). */}
        <button onClick={onClose} aria-label="Fermer" className="w-9 h-9 rounded-full grid place-items-center text-[var(--t2m-ink-2)] active:bg-[var(--t2m-wash)]"><X className="w-6 h-6" /></button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3.5 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          {/* Photos — galerie (min 4). La 1re = couverture. */}
          <div>
            <span className={label}>Photos <span className="text-[var(--t2m-ink-3)]">({photos.length}/8 · 4 conseillées)</span></span>
            <div className="grid grid-cols-4 gap-2">
              {photos.map((u, i) => (
                <div key={u} className="relative aspect-square rounded-lg overflow-hidden border border-[var(--t2m-line)] bg-[var(--t2m-wash)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="" className="w-full h-full object-cover" />
                  {i === 0 && <span className="absolute bottom-0 inset-x-0 text-[9px] text-center bg-black/60 text-white py-0.5">Couverture</span>}
                  <button type="button" onClick={() => removePhoto(u)} className="absolute top-0.5 right-0.5 w-5 h-5 grid place-items-center rounded-full bg-black/70 text-white/90 text-[12px]">×</button>
                </div>
              ))}
              {photos.length < 8 && (
                <label className="aspect-square rounded-lg border border-dashed border-[var(--t2m-line)] bg-[var(--t2m-wash)] grid place-items-center cursor-pointer text-[var(--t2m-ink-3)]">
                  {busy === 'upload' ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-6 h-6" />}
                  <input type="file" accept="image/*" multiple className="hidden" onChange={upload} />
                </label>
              )}
            </div>
            {photos.length < 4 && <p className="text-[11px] text-[var(--t2m-ink-3)] mt-1.5">📸 On achète avec les yeux — jusqu&apos;à 4 photos vendent mieux ; la 1ʳᵉ sera la couverture.</p>}
          </div>

          {/* Titre (toujours — cœur simple) */}
          <div>
            <span className={label}>Titre *</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={ph.title} className={field} />
          </div>

          {/* Prix (toujours — cœur simple) */}
          <div>
            <span className={label}>Prix ({currencyLabel()}{isRental ? rentalUnit : ''})</span>
            <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.,]/g, ''))} inputMode="decimal" placeholder="0" className={field} />
          </div>

          {/* Quantité en stock — sauf emploi / immobilier / service / location. */}
          {hasQuantity && (
            <div>
              <span className={label}>Quantité en stock</span>
              <input value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="1" className={field} />
              <p className="text-[10.5px] text-[var(--t2m-ink-3)] mt-1">1 = pièce unique · ou le nombre exact disponible. Modifiable à tout moment.</p>
            </div>
          )}

          {/* Bascule ANNONCE (messagerie) : coche pour DÉROULER la partie détaillée.
              En mode annonce pur (onglet Annonces), la partie reste toujours ouverte. */}
          {itemSource && (
            <label className="flex items-start gap-3 p-3 rounded-xl border border-[var(--t2m-line)] bg-[var(--t2m-wash)] cursor-pointer">
              <input type="checkbox" checked={annonceMode} onChange={(e) => setAnnonceMode(e.target.checked)} className="w-4 h-4 mt-0.5 accent-red-600" />
              <span className="text-[13.5px] text-[var(--t2m-ink)] font-medium">Publier dans les Petites annonces
                <span className="block text-[11px] text-[var(--t2m-ink-3)] font-normal mt-0.5">Déroule catégorie + détails (couleur, taille…) + ville. Sinon l’article reste simple (boutique / story / feed).</span>
              </span>
            </label>
          )}

          {/* ───── PARTIE DÉTAILLÉE — pour une ANNONCE uniquement ───── */}
          {annonceMode && (
          <>
          {/* Catégorie (imposée) */}
          <div>
            <span className={label}>Catégorie *</span>
            <select value={category} onChange={(e) => { setCategory(e.target.value); setAttrs({}); }} className={field + (category ? '' : ' text-[var(--t2m-ink-3)]')}>
              <option value="">Choisir une catégorie…</option>
              {CATEGORIES.map((c) => <option key={c} value={c} className="text-black">{c}</option>)}
            </select>
          </div>

          {/* Véhicules : VENTE ou LOCATION (avec/sans chauffeur). La location remonte aussi dans Drive. */}
          {category === 'Véhicules' && (
            <div className="rounded-xl border border-[var(--t2m-line)] bg-white shadow-[0_2px_10px_rgba(47,52,58,.05)] p-3 space-y-3">
              <div>
                <span className={label}>Type d&apos;offre</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setRental(false)}
                    className={'flex-1 py-2 rounded-lg text-[13px] font-semibold border ' + (!rental ? 'bg-[var(--t2m-primary)] text-white border-[var(--t2m-primary)]' : 'bg-[var(--t2m-wash)] text-[var(--t2m-ink-2)] border-[var(--t2m-line)]')}>
                    Vente
                  </button>
                  <button type="button" onClick={() => setRental(true)}
                    className={'flex-1 py-2 rounded-lg text-[13px] font-semibold border ' + (rental ? 'bg-red-600 text-white border-red-500' : 'bg-[var(--t2m-wash)] text-[var(--t2m-ink-2)] border-[var(--t2m-line)]')}>
                    Location
                  </button>
                </div>
              </div>
              {rental && (
                <div>
                  <span className={label}>Chauffeur</span>
                  <select value={driverOption} onChange={(e) => setDriverOption(e.target.value)} className={field + (driverOption ? '' : ' text-[var(--t2m-ink-3)]')}>
                    <option value="">Choisir…</option>
                    <option value="without" className="text-black">Sans chauffeur</option>
                    <option value="with" className="text-black">Avec chauffeur</option>
                    <option value="both" className="text-black">Avec ou sans chauffeur</option>
                  </select>
                  <p className="text-[10.5px] text-[var(--t2m-ink-3)] mt-1">Le prix est par <b>jour</b>. Cette location apparaîtra aussi dans <b>Drive</b>.</p>
                  <p className="text-[10.5px] text-amber-200/80 mt-1.5 leading-snug">⚠️ Talk2Me ne gère <b>ni la caution ni les litiges</b> : à régler directement entre toi et le locataire.</p>
                  {/* Planning de disponibilité — édité ICI, sur la fiche (une seule place). Besoin de l'id du .card. */}
                  {initial?.id ? (
                    <div className="pt-2">
                      <span className={label}>📅 Disponibilités</span>
                      <RentalPlanningPanel annonceId={initial.id} />
                    </div>
                  ) : (
                    <p className="text-[10.5px] text-[var(--t2m-ink-3)] mt-2">📅 Le calendrier de disponibilité s&apos;ouvrira ici une fois l&apos;annonce enregistrée.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Champs SPÉCIFIQUES à la catégorie (façon Leboncoin) */}
          {catAttrs.length > 0 && (
            <div className="rounded-xl border border-[var(--t2m-line)] bg-white shadow-[0_2px_10px_rgba(47,52,58,.05)] p-3 space-y-3">
              <p className="text-[12px] font-semibold text-[var(--t2m-ink-2)]">Détails — {category}</p>
              {catAttrs.map((a) => (
                <div key={a.key}>
                  <span className={label}>{a.label}</span>
                  {a.type === 'select' ? (
                    <select
                      value={attrs[a.key] || ''}
                      onChange={(e) => setAttrs((p) => ({ ...p, [a.key]: e.target.value }))}
                      className={field + (attrs[a.key] ? '' : ' text-[var(--t2m-ink-3)]')}
                    >
                      <option value="">Choisir…</option>
                      {(a.options || []).map((o) => <option key={o} value={o} className="text-black">{o}</option>)}
                    </select>
                  ) : (
                    <div className="relative">
                      <input
                        value={attrs[a.key] || ''}
                        onChange={(e) => setAttrs((p) => ({ ...p, [a.key]: a.type === 'number' ? e.target.value.replace(/[^0-9]/g, '') : e.target.value }))}
                        inputMode={a.type === 'number' ? 'numeric' : 'text'}
                        placeholder={a.placeholder || ''}
                        className={field + (a.suffix ? ' pr-12' : '')}
                      />
                      {a.suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-[var(--t2m-ink-3)]">{a.suffix}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Description (complète — annonce) + ✨ baguette magique (IA remet propre, garde la langue) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className={label}>Description</span>
              <button type="button" onClick={refineDesc} disabled={refining || !description.trim()}
                style={{ background: 'radial-gradient(circle at 30% 30%, #FFB86B 0%, #FF7F11 55%, #E86F00 100%)' }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-white text-[12px] font-semibold disabled:opacity-40 active:scale-95">
                {refining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span aria-hidden>✨</span>} Corriger
              </button>
            </div>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={2000} placeholder={ph.desc} className={field + ' resize-none leading-relaxed'} />
          </div>

          {/* Ville */}
          <div>
            <span className={label}>Ville</span>
            <input value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} placeholder="Ex : Casablanca" className={field} />
          </div>

          {/* Immobilier occupé : remise en ligne anticipée (départ connu). */}
          {category === 'Immobilier' && !itemSource && (
            <div>
              <span className={label}>Bien occupé — départ du locataire prévu le (optionnel)</span>
              <input type="date" value={departure} onChange={(e) => setDeparture(e.target.value)} className={field} />
              <p className="text-[10.5px] text-[var(--t2m-ink-3)] mt-1">L’annonce est <b>masquée</b> tant que le bien est occupé, et <b>remise en ligne automatiquement 2 mois avant</b> ce départ.</p>
            </div>
          )}

          {/* Acompte de réservation (Immobilier) : l'acheteur le verse pour bloquer le bien. */}
          {category === 'Immobilier' && !itemSource && (
            <div>
              <span className={label}>Acompte de réservation demandé ({currencyLabel()}, optionnel)</span>
              <input value={deposit} onChange={(e) => setDeposit(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="0" className={field} />
              <p className="text-[10.5px] text-[var(--t2m-ink-3)] mt-1">Si renseigné, un acheteur peut <b>réserver</b> le bien en versant cet acompte (paiement sécurisé via le site). Le bien passe « Réservé » 14 j.</p>
            </div>
          )}

          {/* Géolocalisation (optionnelle) — aide les acheteurs proches à te trouver */}
          <div>
            <span className={label}>Position (optionnel)</span>
            <button
              type="button"
              onClick={locate}
              disabled={geoBusy}
              className={'w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg text-[13px] font-semibold disabled:opacity-50 ' + (lat != null ? 'bg-emerald-600/20 text-emerald-200 border border-emerald-400/30' : 'bg-[var(--t2m-wash)] text-[var(--t2m-ink-2)]')}
            >
              {geoBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
              {geoBusy ? 'Localisation…' : lat != null ? '✓ Position enregistrée' : '📍 Me localiser'}
            </button>
          </div>
          </>
          )}

          {/* Rattacher à une boutique (optionnel) — masqué si on édite DÉJÀ un article de boutique */}
          {!itemSource && shops.length > 0 && (
            <div>
              <span className={label}>Mettre dans une de mes boutiques (optionnel)</span>
              <select value={shopId} onChange={(e) => setShopId(e.target.value)} className={field + (shopId ? '' : ' text-[var(--t2m-ink-3)]')}>
                <option value="">Aucune (annonce simple)</option>
                {shops.map((s) => <option key={s.id} value={s.id} className="text-black">{s.name}</option>)}
              </select>
            </div>
          )}

          {err && <p className="text-red-400 text-[13px]">{err}</p>}

          {/* Référent + « donner au client » — facettes de la FICHE (.card), éditées ICI. Annonce en édition seulement. */}
          {!itemSource && initial?.id && (
            <ReferentSection shopId={initial.id} allowGive onGiven={() => onSaved()} />
          )}

          <p className="text-[11px] text-[var(--t2m-ink-3)] leading-snug">
            {itemSource
              ? (annonceMode
                  ? <>En <b>annonce</b> : photo + prix + ville obligatoires. Décoche pour garder l’article <b>simple</b> (boutique / story / feed).</>
                  : <>Article <b>simple</b> : il vit dans ta boutique et peut partir en <b>story</b> ou dans le <b>feed</b>. Coche au-dessus pour le mettre en <b>annonce</b>.</>)
              : <>Pour <b>publier</b> : photo + prix + ville obligatoires. Le <b>brouillon</b> garde ton annonce sans la rendre visible.</>}
          </p>

          {itemSource ? (
            <div className="pt-1 space-y-2">
              {/* DIFFUSION de l'article (Pascal) : story / feed, en plus de l'annonce (coche ci-dessus). */}
              <div>
                <span className={label}>Diffuser cet article</span>
                <div className="flex gap-2">
                  <button type="button" onClick={toStory} disabled={!!diffusing} className="flex-1 py-2.5 rounded-xl bg-[var(--t2m-wash)] text-[var(--t2m-ink)] text-[13px] font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2">
                    {diffusing === 'story' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Megaphone className="w-4 h-4" />} Story
                  </button>
                  <button type="button" onClick={toFeed} disabled={!!diffusing} className="flex-1 py-2.5 rounded-xl bg-[var(--t2m-wash)] text-[var(--t2m-ink)] text-[13px] font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2">
                    {diffusing === 'feed' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />} Feed
                  </button>
                </div>
                {diffMsg && <p className="text-emerald-300 text-[12px] mt-1.5">{diffMsg}</p>}
              </div>
              <div className="flex gap-2.5">
                <button onClick={() => save('draft')} disabled={!!busy} className="flex-1 py-3 rounded-xl bg-[var(--t2m-wash)] text-[var(--t2m-ink)] text-[14px] font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-2">
                  {busy === 'draft' ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Brouillon
                </button>
                <button onClick={() => save(annonceMode ? 'published' : 'draft')} disabled={!!busy} style={{ background: 'radial-gradient(circle at 30% 30%, #FFB86B 0%, #FF7F11 55%, #E86F00 100%)' }} className="flex-1 py-3 rounded-xl text-white text-[14px] font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-2">
                  {busy && busy !== 'draft' ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Enregistrer{annonceMode ? ' + annonce' : ''}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2.5 pt-1">
              <button onClick={() => save('draft')} disabled={!!busy} className="flex-1 py-3 rounded-xl bg-[var(--t2m-wash)] text-[var(--t2m-ink)] text-[14px] font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-2">
                {busy === 'draft' ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Brouillon
              </button>
              <button onClick={() => save('published')} disabled={!!busy} style={{ background: 'radial-gradient(circle at 30% 30%, #FFB86B 0%, #FF7F11 55%, #E86F00 100%)' }} className="flex-1 py-3 rounded-xl text-white text-[14px] font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-2">
                {busy === 'published' ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Publier
              </button>
            </div>
          )}
      </div>
      </div>
    </div>,
    document.body,
  );
}
