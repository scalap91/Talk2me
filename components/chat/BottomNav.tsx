'use client'

import { Globe, MessageSquare, Layers, User, Plus, Home } from '@/lib/icons'
import { ChatText } from '@phosphor-icons/react'
// Discussions = bulle CARRÉE (ChatText), pour NE PAS être confondue avec l'icône COMMENTAIRE des
// posts (ChatCircle, ronde). Duotone comme les autres icônes du bas. Pascal 2026-07-12.
const DiscussionsIcon = (p: { style?: React.CSSProperties }) => <ChatText weight="duotone" {...p} />
import { motion } from 'motion/react'
import { useRouter, usePathname } from 'next/navigation'
import { useCardCreationStore } from '@/lib/card-creation-store'
import { useState, useRef, useEffect, type ComponentType } from 'react'
import CreateCardSheet from '@/components/create/CreateCardSheet'
import BoutiqueQuickSheet from '@/components/create/BoutiqueQuickSheet'
import CreateServiceSheet from '@/components/create/CreateServiceSheet'
import CreateEmploiSheet from '@/components/create/CreateEmploiSheet'
import CreateRencontreSheet from '@/components/create/CreateRencontreSheet'
import AddPlatMaisonSheet from '@/components/feed/AddPlatMaisonSheet'
import DepositAnnonceSheet from '@/components/feed/DepositAnnonceSheet'

interface NavItem {
  icon: React.ElementType
  label: string
  key: string
  href: string
}

// Talk2Me #424 (Pascal 2026-06-07) — Nav :
//   Hub 🌐 | Amis | + (central) | Card | Wallet 🪙
// - Hub (flux global + sous-onglets Tout/Amis/Populaire/Shop).
// - Amis juste après le Hub.
// - Shop n'est PAS un onglet de barre : il vit dans la sidebar (haut à gauche) +
//   sous-onglet du Hub.
// - Profil = dernier onglet de la barre, en bas à droite (Pascal 2026-06-25).
// Doctrine [[talk2me-hub-universel]] + [[talktome-design-premium]].
const sideItems: NavItem[] = [
  { icon: Globe, label: 'Hub', key: 'home', href: '/home' },
  { icon: MessageSquare, label: 'Discussions', key: 'friends', href: '/friends' },
  { icon: Layers, label: 'Card', key: 'drafts', href: '/drafts' },
  // Shop retiré de la barre du bas (il est en icône dans le header, Pascal 2026-07-04) → Profil à la place.
  { icon: User, label: 'Profil', key: 'profile', href: '/profile' },
]

export default function BottomNav() {
  const router = useRouter()
  const pathname = usePathname()
  const shopMode = useCardCreationStore((s) => s.shopMode)
  const openBoutique = useCardCreationStore((s) => s.openBoutique)
  const [menu, setMenu] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [boutiqueOpen, setBoutiqueOpen] = useState(false)
  const [platOpen, setPlatOpen] = useState(false)
  const [serviceOpen, setServiceOpen] = useState(false)
  const [emploiOpen, setEmploiOpen] = useState(false)
  const [rencontreOpen, setRencontreOpen] = useState(false)
  const [annonce, setAnnonce] = useState<null | { category?: string }>(null) // Annonce / Immobilier / Automobile (catégorie pré-réglée)
  const menuRef = useRef<HTMLDivElement>(null)
  // Mode Photo (data-feed) : sur le Hub, la nav du bas devient transparente/verre poli
  // posée SUR l'image (icônes blanches), comme le menu du haut. Ailleurs : blanche.
  const [feedStyle, setFeedStyle] = useState<'cards' | 'long'>('cards')
  useEffect(() => {
    const read = () => { const f = document.documentElement.dataset.feed; setFeedStyle(f === 'photo' || f === 'long' ? 'long' : 'cards') }
    read()
    window.addEventListener('t2m:theme', read)
    return () => window.removeEventListener('t2m:theme', read)
  }, [])
  const immersive = (pathname?.endsWith('/home') ?? false) && feedStyle === 'long'

  // L'icône Shop reste TOUJOURS — les sous-parties (Eat/Annonces/Boutique) se
  // switchent à l'intérieur (cf. AcheterHub + Espace admin). Pas de masquage ici.
  const items = sideItems
  const leftCount = Math.ceil(items.length / 2)

  // Fermer le menu si clic en dehors
  useEffect(() => {
    if (!menu) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menu])

  const isActive = (item: NavItem): boolean => {
    if (item.key === 'home') return pathname.endsWith('/home')
    if (item.key === 'shop') return pathname.startsWith('/shop')
    if (item.key === 'friends') {
      return (
        pathname.startsWith('/friends') ||
        pathname.startsWith('/messages') ||
        pathname.startsWith('/c/')
      )
    }
    if (item.key === 'drafts') return pathname.startsWith('/drafts')
    return false
  }

  return (
    <nav
      className={`md:hidden ${immersive ? 'fixed' : 'sticky'} bottom-0 left-0 right-0 z-50 h-[60px] flex items-center px-2 ${immersive ? '' : 'bg-white backdrop-blur-xl border-t border-[#E7EAF0]'}`}
      style={immersive ? { background: 'linear-gradient(to top, rgba(0,0,0,.82) 0%, rgba(0,0,0,.45) 45%, rgba(0,0,0,0) 100%)', paddingBottom: 'env(safe-area-inset-bottom)' } : undefined}
      data-testid="bottom-nav"
    >
      {/* items à gauche (moitié haute) */}
      <div className="flex-1 flex justify-around items-center">
        {items.slice(0, leftCount).map((item) => (
          <NavBtn
            key={item.key}
            item={item}
            active={isActive(item)}
            shopMode={shopMode}
            immersive={immersive}
            onClick={() => router.push(item.href)}
          />
        ))}
      </div>

      {/* Bouton central + (sphère neon, élevée) */}
      <div className="relative">
        <motion.button
          whileTap={{ scale: 0.9 }}
          type="button"
          onClick={() => {
            if (shopMode) setMenu((v) => !v)
            else setCreateOpen(true)
          }}
          aria-label="Créer une card"
          data-testid="bottom-nav-create"
          className="relative -mt-4 w-[60px] h-[60px] rounded-[20px] flex items-center justify-center text-white transition-transform active:scale-95 hover:scale-[1.04] flex-shrink-0"
          style={
            shopMode
              ? {
                  background:
                    'radial-gradient(circle at 30% 30%, #ffb3bb 0%, #ef4444 45%, #dc2626 75%, #7a1623 100%)',
                  boxShadow:
                    '0 6px 20px rgba(255,51,68,0.40), inset 0 1px 0 rgba(255,255,255,0.18)',
                }
              : {
                  background:
                    'radial-gradient(circle at 30% 30%, #FFB86B 0%, #FF7F11 55%, #E86F00 100%)',
                  boxShadow:
                    '0 8px 20px rgba(255,127,17,0.42), inset 0 1px 0 rgba(255,255,255,0.25)',
                }
          }
        >
          <Plus className="w-6 h-6" />
        </motion.button>

        {/* Popover menu contextuel (mode Shop) */}
        {menu && (
          <div
            ref={menuRef}
            className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 z-50 bg-white rounded-2xl border border-[#E7EAF0] shadow-lg p-1.5 flex flex-col gap-1 min-w-[180px]"
          >
            <button
              type="button"
              onClick={() => {
                openBoutique()
                setMenu(false)
              }}
              className="text-[13px] text-[#2F343A] px-3 py-2 rounded-xl hover:bg-black/[0.04] text-left transition-colors"
            >
              🏪 Créer une boutique
            </button>
            <button
              type="button"
              onClick={() => {
                router.push('/creer/texte')
                setMenu(false)
              }}
              className="text-[13px] text-[#2F343A] px-3 py-2 rounded-xl hover:bg-black/[0.04] text-left transition-colors"
            >
              ➕ Créer un post
            </button>
          </div>
        )}
      </div>

      {/* items à droite */}
      <div className="flex-1 flex justify-around items-center">
        {items.slice(leftCount).map((item) => (
          <NavBtn
            key={item.key}
            item={item}
            active={isActive(item)}
            shopMode={shopMode}
            immersive={immersive}
            onClick={() => router.push(item.href)}
          />
        ))}
      </div>

      <CreateCardSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onBoutique={() => setBoutiqueOpen(true)}
        onPlat={() => setPlatOpen(true)}
        onService={() => setServiceOpen(true)}
        onEmploi={() => setEmploiOpen(true)}
        onRencontre={() => setRencontreOpen(true)}
        onArticle={() => setAnnonce({})}
        onImmo={() => setAnnonce({ category: 'Immobilier' })}
        onAuto={() => setAnnonce({ category: 'Véhicules' })}
      />
      <BoutiqueQuickSheet open={boutiqueOpen} onClose={() => setBoutiqueOpen(false)} />
      <CreateServiceSheet open={serviceOpen} onClose={() => setServiceOpen(false)} />
      <CreateEmploiSheet open={emploiOpen} onClose={() => setEmploiOpen(false)} />
      <CreateRencontreSheet open={rencontreOpen} onClose={() => setRencontreOpen(false)} />
      {platOpen && <AddPlatMaisonSheet onClose={() => setPlatOpen(false)} onCreated={() => setPlatOpen(false)} />}
      {annonce && <DepositAnnonceSheet initial={annonce.category ? { category: annonce.category } : undefined} onClose={() => setAnnonce(null)} onSaved={() => setAnnonce(null)} />}
    </nav>
  )
}

function NavBtn({
  item,
  active,
  shopMode,
  onClick,
  immersive,
}: {
  item: NavItem
  active: boolean
  shopMode: boolean
  onClick: () => void
  immersive?: boolean
}) {
  // Icônes Phosphor duotone (couleur active via currentColor #FF7F11).
  const ICONS: Record<string, ComponentType<{ size?: number }>> = {
    home: Globe, // Hub = planète (rond + méridiens), pas une maison (Pascal 2026-07-08)
    friends: DiscussionsIcon, // bulle CARRÉE ≠ commentaire (ChatCircle rond)
    drafts: Layers,
    profile: User,
  }
  const Icon = ICONS[item.key]
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-0.5 transition-colors px-2 ${
        active ? 'text-[#FF7F11]' : immersive ? 'text-white' : 'text-[#9DAAB7]'
      }`}
      style={immersive ? { textShadow: '0 1px 4px rgba(0,0,0,.55)' } : undefined}
      aria-current={active ? 'page' : undefined}
      data-testid={`nav-${item.key}`}
    >
      {/* Taille = token design system --t2m-ic-nav-bottom (30px) : égalité PERÇUE avec le haut
          (--t2m-ic-nav 27px), formes du bas moins remplies. Jamais en dur. Pascal 2026-07-12. */}
      <span className="leading-none">{Icon ? <Icon style={{ width: 'var(--t2m-ic-nav-bottom)', height: 'var(--t2m-ic-nav-bottom)' }} /> : '•'}</span>
      <span className="text-[10px] font-medium leading-tight">{item.label}</span>
    </motion.button>
  )
}
