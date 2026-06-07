/**
 * /sfu-test/[activity_id] — Page de test SFU mediasoup (Talk2Me #403).
 *
 * Permet à 2+ users authentifiés et participants de la conv associée à
 * cette activity_id de se voir/entendre via le SFU natif Talk2Me.
 *
 * Doctrine [[talk2me-watch-together-passthrough]] : aucune vidéo partenaire
 * n'est routée. Cette page sert UNIQUEMENT à valider mic+cam des
 * participants via mediasoup.
 *
 * Usage Pascal :
 *   1. user A : crée une activity kind='video' dans une conv P2P (via UI ou
 *      POST /api/activities/start)
 *   2. user A : ouvre /sfu-test/{activity_id}
 *   3. user B : ouvre la même URL
 *   4. → ils doivent se voir/entendre
 */
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { userCanAccessActivity } from '@/lib/db';
import SfuTestClient from './SfuTestClient';

interface PageProps {
  params: Promise<{ activity_id: string }>;
}

export default async function Page({ params }: PageProps) {
  const { activity_id } = await params;
  const me = await getCurrentUser();
  if (!me) {
    redirect(`/?next=${encodeURIComponent(`/sfu-test/${activity_id}`)}`);
  }
  const access = userCanAccessActivity(activity_id, me.id);
  if (!access) {
    return (
      <div className="p-4 text-red-400">
        Accès refusé : tu n&apos;es pas participant de cette activité.
      </div>
    );
  }
  return (
    <SfuTestClient
      activityId={activity_id}
      convId={access.convId}
      meId={me.id}
      meLabel={me.display_name || me.username}
    />
  );
}
