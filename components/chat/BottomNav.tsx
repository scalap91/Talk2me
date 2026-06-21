'use client'

import { Globe, MessageSquare, Layers, ShoppingBag, Plus } from 'lucide-react'
import { useRouter, usePathname } from 'next/navigation'
import { useCardCreationStore } from '@/lib/card-creation-store'
import { useState, useRef, useEffect } from 'react'

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
// - Shop n'est PAS un onglet de barre : c'est un SOUS-ONGLET du Hub.
// - Wallet tout à la fin (icône deux pièces).
// - Profil accessible via la bulle photo du header (pas dans la barre).
// Doctrine [[talk2me-hub-universel]] + [[talktome-design-premium]].
const sideItems: NavItem[] = [
  { icon: MessageSquare, label: 'Discussions', key: 'friends', href: '/friends' },
  { icon: Globe, label: 'Hub', key: 'home', href: '/home' },
  { icon: Layers, label: 'Card', key: 'drafts', href: '/drafts' },
  // Wallet/Monétisation retirés de la barre (Pascal 2026-06-19) → via Profil.
  // À la place : Shop (Pascal 2026-06-19) — cohérent avec l'axe monétisation.
  { icon: ShoppingBag, label: 'Shop', key: 'shop', href: '/shop' },
]

export default function BottomNav() {
  const router = useRouter()
  const pathname = usePathname()
  const shopMode = useCardCreationStore((s) => s.shopMode)
  const openBoutique = useCardCreationStore((s) => s.openBoutique)
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

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
      className="sticky bottom-0 left-0 right-0 z-50 h-16 bg-[#0e0e12]/85 backdrop-blur-xl border-t border-white/8 flex items-center px-2"
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
            onClick={() => router.push(item.href)}
          />
        ))}
      </div>

      {/* Bouton central + (sphère neon, élevée) */}
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            if (shopMode) setMenu((v) => !v)
            else router.push('/creer/texte')
          }}
          aria-label="Créer une card"
          data-testid="bottom-nav-create"
          className="relative -mt-7 w-14 h-14 rounded-full flex items-center justify-center text-white border border-white/15 transition-transform active:scale-95 hover:scale-[1.04] flex-shrink-0"
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
                    'radial-gradient(circle at 30% 30%, #ff8d99 0%, #ff3344 45%, #e6253a 75%, #7a1623 100%)',
                  boxShadow:
                    '0 6px 20px rgba(255,51,68,0.35), inset 0 1px 0 rgba(255,255,255,0.18)',
                }
          }
        >
          <Plus className="w-6 h-6" />
        </button>

        {/* Popover menu contextuel (mode Shop) */}
        {menu && (
          <div
            ref={menuRef}
            className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 z-50 bg-[#15151c] rounded-2xl border border-white/12 shadow-lg p-1.5 flex flex-col gap-1 min-w-[180px]"
          >
            <button
              type="button"
              onClick={() => {
                router.push('/boutique/creer')
                setMenu(false)
              }}
              className="text-[13px] text-white px-3 py-2 rounded-xl hover:bg-white/10 text-left transition-colors font-semibold"
            >
              ⚡ Boutique en 1 clic
            </button>
            <button
              type="button"
              onClick={() => {
                openBoutique()
                setMenu(false)
              }}
              className="text-[13px] text-white px-3 py-2 rounded-xl hover:bg-white/10 text-left transition-colors"
            >
              🏪 Créer une boutique
            </button>
            <button
              type="button"
              onClick={() => {
                router.push('/creer/texte')
                setMenu(false)
              }}
              className="text-[13px] text-white px-3 py-2 rounded-xl hover:bg-white/10 text-left transition-colors"
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
            onClick={() => router.push(item.href)}
          />
        ))}
      </div>
    </nav>
  )
}

function NavBtn({
  item,
  active,
  shopMode,
  onClick,
}: {
  item: NavItem
  active: boolean
  shopMode: boolean
  onClick: () => void
}) {
  const Icon = item.icon
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-0.5 transition-colors px-2 ${
        active
          ? shopMode
            ? 'text-red-400'
            : 'text-red-400'
          : 'text-white/45'
      }`}
      aria-current={active ? 'page' : undefined}
      data-testid={`nav-${item.key}`}
    >
      <Icon className="w-7 h-7" strokeWidth={2.2} />
      <span className="text-[13px] font-medium leading-tight">{item.label}</span>
    </button>
  )
}
