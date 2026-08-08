/**
 * ONE-SHOT DEV (Pascal 2026-08-07) — rafraîchit la PAGE 13 « Profil » de la formation (.card 0371bc49)
 * pour coller au profil ACTUEL (Mon relevé, Mon Parcours, Ma formation…). Écrit le FICHIER .card via
 * l'app (la seule voie propre : le fichier vit sur .169, exclu du rsync, écriture SSH bloquée).
 * Idempotent + backup. À RETIRER + redéployer après usage. Token-gaté.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOKEN = 'refresh-p13-2026-08';
const CARD_PATH = path.join(process.cwd(), 'data/cards/0371bc49-0c6b-4e4e-b389-8088a8d51969.card');

const NEW_BODY = `**👤 Profil** (en bas à droite) = ton poste de pilotage. En-tête : ta **photo** (tu prends/recadres), ton **nom** (✎), ton **@pseudo**.

En dessous, des **rubriques repliées** (appuie sur un titre, ça se déroule) :
- **Mon Compte** — 🔔 Notifications · 💻 Appareils connectés.
- **Mes achats** — 🛒 Mon panier · 📦 **Mes commandes** (tes achats protégés) · 🚚 **Mes livraisons** (suivi en temps réel) · 📍 Mes adresses.
- **Gagner & réseau** — 📒 **Mon relevé** (tes ventes, commissions, transactions) · 🤝 **Mon Parcours** (tes niveaux, tes gains réels, parrainer, gérer les boutiques de tes filleuls) · 🎓 **Ma formation** (ce cours + ta certification). Validateur : 🛡️ **Former mes recrutés**.
- **Logistique** — 📦 Envoyer un colis · 🏬 **Mon agence** (dépôt/retrait, chauffeurs, colis) · Devenir transporteur.
- **Mon IA · Préférences · Se déconnecter.**

**Pour ton métier :** ton argent = **Mon relevé** · tes niveaux, gains et ton équipe = **Mon Parcours** · tes colis = **Mon agence**.`;

export async function POST(req: NextRequest) {
  if (req.nextUrl.searchParams.get('t') !== TOKEN) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  try {
    const raw = await fs.readFile(CARD_PATH, 'utf8');
    const j = JSON.parse(raw) as { items?: Array<{ title?: string; text?: { body?: string } }> };
    const items = j.items || [];
    const it = items[13];
    if (!it || !/profil/i.test(it.title || '')) {
      return NextResponse.json({ error: 'item13_not_profil', title: it?.title }, { status: 400 });
    }
    const cur = it.text?.body || '';
    if (cur.includes('Mon relevé') && cur.includes('Mon Parcours')) {
      return NextResponse.json({ ok: true, already: true });
    }
    await fs.writeFile(`${CARD_PATH}.bak-p13-${Date.now()}`, raw, 'utf8');
    it.text = { ...(it.text || {}), body: NEW_BODY };
    await fs.writeFile(CARD_PATH, JSON.stringify(j), 'utf8');
    return NextResponse.json({ ok: true, updated: true, title: it.title, new_len: NEW_BODY.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
