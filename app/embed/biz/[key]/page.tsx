import BizChat from '@/components/biz/BizChat';

export const dynamic = 'force-dynamic';

// Page PUBLIQUE (contenu de l'iframe). Pas d'auth, pas de chrome T2M.
export default async function BizEmbedPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return <BizChat inboxKey={key} />;
}
