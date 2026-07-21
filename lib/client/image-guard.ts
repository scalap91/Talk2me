'use client';
/**
 * image-guard — anti-désintermédiation COUCHE 2, côté client (Pascal 2026-07-21).
 *
 * Un helper UNIQUE réutilisé par tous les composers commerce (pas de patch éparpillé). OCR
 * ON-DEVICE (ML Kit natif / Tesseract.js web — le même moteur que le karaoké), GRATUIT et
 * l'image ne quitte JAMAIS l'appareil. Détecte un numéro de téléphone écrit SUR la photo.
 * Best-effort : si l'OCR échoue → false (on n'empêche pas la vente pour un OCR raté).
 * Cf. [[project_talk2me_anti_desinter_scan]], [[project_talk2me_compute_mesh]].
 */
import { recognizeText } from '@/lib/compute/ondevice-ocr';
import { hasContactLeak } from '@/lib/cards/contact-guard';

export const CONTACT_LEAK_MSG =
  'Cette photo contient un numéro de téléphone. Retire-le : sur Talk2Me la vente passe par le paiement protégé (escrow), pas par un appel direct.';

/** true si un numéro de téléphone est visible SUR l'image. Best-effort (false si OCR indisponible). */
export async function imageHasPhoneNumber(file: File): Promise<boolean> {
  try {
    const dataUrl = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
    const { text } = await recognizeText(dataUrl);
    return hasContactLeak(text);
  } catch {
    return false;
  }
}
