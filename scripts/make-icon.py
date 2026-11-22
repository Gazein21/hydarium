#!/usr/bin/env python3
"""Régénère build/icon.ico à partir de build/icon.png (512×512).
Format STANDARD des .ico Windows : images en BMP 32 bits (avec masque) pour 16 à 128 px, PNG seulement pour 256 px.
Un .ico dont TOUTES les images sont en PNG (cas avant 0.10.61) n'est pas lu correctement par les outils Windows pour les petites tailles
(barre des tâches, explorateur, raccourcis, NSIS) : on retombe alors sur l'icône d'Electron.
Usage : python scripts/make-icon.py   (nécessite Pillow : pip install pillow)"""
import io, os, struct
from PIL import Image

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'build')
src = Image.open(os.path.join(root, 'icon.png')).convert('RGBA')
BMP_SIZES, PNG_SIZES = [16, 24, 32, 48, 64, 128], [256]

def bmp_entry(img):
    w, h = img.size
    px = img.load(); xor = bytearray()
    for y in range(h - 1, -1, -1):                     # lignes de bas en haut, pixels en BGRA
        for x in range(w):
            r, g, b, a = px[x, y]; xor += bytes((b, g, r, a))
    mask = bytes(((w + 31) // 32) * 4 * h)             # masque AND à zéro : la transparence est dans le canal alpha
    head = struct.pack('<IiiHHIIiiII', 40, w, h * 2, 1, 32, 0, len(xor) + len(mask), 0, 0, 0, 0)
    return head + bytes(xor) + mask

def png_entry(img):
    b = io.BytesIO(); img.save(b, 'PNG', optimize=True); return b.getvalue()

entries = []
for s in BMP_SIZES: entries.append((s, bmp_entry(src.resize((s, s), Image.LANCZOS))))
for s in PNG_SIZES: entries.append((s, png_entry(src.resize((s, s), Image.LANCZOS))))
out = bytearray(struct.pack('<HHH', 0, 1, len(entries))); off = 6 + 16 * len(entries); data = bytearray()
for s, d in entries:
    out += struct.pack('<BBBBHHII', 0 if s >= 256 else s, 0 if s >= 256 else s, 0, 0, 1, 32, len(d), off + len(data)); data += d
open(os.path.join(root, 'icon.ico'), 'wb').write(bytes(out) + bytes(data))
print('icon.ico :', len(out) + len(data), 'octets,', len(entries), 'tailles :', [s for s, _ in entries])
