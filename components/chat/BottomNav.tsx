'use client'

import { Globe, Users, Layers, ShoppingBag, Coins, Plus } from 'lucide-react'
import { useRouter, usePathname } from 'next/navigation'
import { useCardCreationStore } from '@/lib/card-creation-store'

interface NavItem {
  icon: React.ElementType
  label: string
  key: string
  href: string
}

// Talk2Me #424 (Pascal 2026-06-07) — Nav :
//   Hub 🌐 | Amis | Card | + (central) | Shop 🛍️ | Wallet 🪙
// - Hub (flux global + sous-onglets Tout/Amis/Populaire).
// - Amis juste après le Hub.
// - Shop (nouveau) : cards business (ProductCard), tendance, poussées par T2M
//   Officiel ; groupé côté commerce avec Wallet.
// - Wallet tout à la fin (icône deux pièces).
// - Profil accessible via la bulle photo du header (pas dans la barre).
// 5 destinations → réparties 3 gauche / 2 droite autour du bouton +.
// Doctrine [[talk2me-hub-universel]] + [[talktome-design-premium]].
const sideItems: NavItem[] = [
  { icon: Globe, label: 'Hub', key: 'home', href: '/home' },
  { icon: Users, label: 'Amis', key: 'friends', href: '/friends' },
  { icon: Layers, label: 'Card', key: 'drafts', href: '/drafts' },
  { icon: ShoppingBag, label: 'Shop', key: 'shop', href: '/shop' },
  { icon: Coins, label: 'Wallet', key: 'wallet', href: '/wallet' },
]

// Répartition adaptative autour du bouton central (gauche = moitié haute).
const LEFT_COUNT = Math.ceil(sideItems.length / 2)

export default function BottomNav() {
  const router = useRouter()
  const pathname = usePathname()
  const openSheet = useCardCreationStore((s) => s.openSheet)

  const isActive = (item: NavItem): boolean => {
    if (item.key === 'home') return pathname.endsWith('/home')
    if (item.key === 'wallet') return pathname.startsWith('/wallet')
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
        {sideItems.slice(0, LEFT_COUNT).map((item) => (
          <NavBtn
            key={item.key}
            item={item}
            active={isActive(item)}
            onClick={() => router.push(item.href)}
          />
        ))}
      </div>

      {/* Bouton central + (sphère neon, élevée) */}
      <button
        type="button"
        onClick={() => openSheet()}
        aria-label="Créer une card"
        data-testid="bottom-nav-create"
        className="relative -mt-7 w-14 h-14 rounded-full flex items-center justify-center text-white border border-white/15 transition-transform active:scale-95 hover:scale-[1.04] flex-shrink-0"
        style={{
          background:
            'radial-gradient(circle at 30% 30%, #ff8d99 0%, #ff3344 45%, #e6253a 75%, #7a1623 100%)',
          boxShadow:
            '0 6px 20px rgba(255,51,68,0.35), inset 0 1px 0 rgba(255,255,255,0.18)',
        }}
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* items à droite */}
      <div className="flex-1 flex justify-around items-center">
        {sideItems.slice(LEFT_COUNT).map((item) => (
          <NavBtn
            key={item.key}
            item={item}
            active={isActive(item)}
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
  onClick,
}: {
  item: NavItem
  active: boolean
  onClick: () => void
}) {
  const Icon = item.icon
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-0.5 transition-colors px-2 ${
        active ? 'text-red-400' : 'text-white/45'
      }`}
      aria-current={active ? 'page' : undefined}
      data-testid={`nav-${item.key}`}
    >
      <Icon className="w-5 h-5" />
      <span className="text-[10px] leading-tight">{item.label}</span>
    </button>
  )
}
