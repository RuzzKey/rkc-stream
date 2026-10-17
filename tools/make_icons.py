"""Erzeugt die App-Icons aus logo.jpg (Logo wird nur skaliert, nicht verändert).

Aufruf im Projektordner:  python tools/make_icons.py
Benötigt: pip install pillow
"""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
logo = Image.open(root / "logo.jpg").convert("RGB")
out = root / "icons"
out.mkdir(exist_ok=True)

for size in (192, 512):
    logo.resize((size, size), Image.LANCZOS).save(out / f"icon-{size}.png", optimize=True)
logo.resize((64, 64), Image.LANCZOS).save(out / "favicon-64.png", optimize=True)

# Maskable: Logo auf 72 % verkleinert, Rand in der Hintergrundfarbe des Logos (Mittel der vier Ecken)
w, h = logo.size
corners = [logo.getpixel(p) for p in ((2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3))]
bg = tuple(sum(c[i] for c in corners) // 4 for i in range(3))
canvas = Image.new("RGB", (512, 512), bg)
inner = round(512 * 0.72)
canvas.paste(logo.resize((inner, inner), Image.LANCZOS), ((512 - inner) // 2, (512 - inner) // 2))
canvas.save(out / "icon-maskable-512.png", optimize=True)
print("Fertig:", ", ".join(p.name for p in sorted(out.glob("*.png"))), "| Randfarbe", "#%02x%02x%02x" % bg)
