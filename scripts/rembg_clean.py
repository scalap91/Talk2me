#!/usr/bin/env python3
# Nettoyage produit : détourage + recadrage auto (centré) + éclaircissement.
# Usage: rembg_clean.py <in> <out> [bg=white|soft|none] [square=1|0]
import sys
from PIL import Image, ImageEnhance, ImageOps

inp_path, out_path = sys.argv[1], sys.argv[2]
bg = sys.argv[3] if len(sys.argv) > 3 else 'white'
# Défaut = NON carré : on garde le ratio du produit (plus de 1:1 forcé qui écrasait).
square = (sys.argv[4] if len(sys.argv) > 4 else '0') == '1'

# Mode ENHANCE : pas de détourage (couverture/bannière) — juste éclaircir/contraster.
if bg == 'enhance':
    im = Image.open(inp_path).convert('RGB')
    im = ImageOps.autocontrast(im, cutoff=1)
    im = ImageEnhance.Brightness(im).enhance(1.08)
    im = ImageEnhance.Contrast(im).enhance(1.06)
    im = ImageEnhance.Color(im).enhance(1.08)
    im.save(out_path, 'JPEG', quality=92)
    print('ok'); sys.exit(0)

from rembg import remove
img = Image.open(inp_path).convert('RGBA')
cut = remove(img)  # RGBA, fond transparent

# 1) RECADRAGE AUTO : on garde juste la boîte du produit (alpha > 0) + marge
alpha = cut.split()[-1]
bbox = alpha.getbbox()
if bbox:
    cut = cut.crop(bbox)

# 2) ÉCLAIRCISSEMENT / CONTRASTE / COULEURS sur le produit
rgb = cut.convert('RGB')
rgb = ImageOps.autocontrast(rgb, cutoff=1)
rgb = ImageEnhance.Brightness(rgb).enhance(1.08)   # +8% luminosité
rgb = ImageEnhance.Contrast(rgb).enhance(1.06)      # +6% contraste
rgb = ImageEnhance.Color(rgb).enhance(1.10)         # +10% saturation
prod = Image.merge('RGBA', (*rgb.split(), cut.split()[-1]))  # ré-applique l'alpha

# 3) CANVAS propre, produit CENTRÉ avec marge
pw, ph = prod.size
if square:
    side = int(max(pw, ph) * 1.16)  # ~8% de marge de chaque côté
    cw = ch = side
else:
    cw = int(pw * 1.16); ch = int(ph * 1.16)

if bg == 'none':
    canvas = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
    canvas.paste(prod, ((cw - pw) // 2, (ch - ph) // 2), prod)
    canvas.save(out_path)
else:
    color = (255, 255, 255, 255) if bg == 'white' else (245, 245, 245, 255)
    canvas = Image.new('RGBA', (cw, ch), color)
    canvas.paste(prod, ((cw - pw) // 2, (ch - ph) // 2), prod)
    canvas.convert('RGB').save(out_path, 'WEBP', quality=85)
print('ok')
