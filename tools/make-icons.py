"""Erzeugt die Icons der Erweiterung (16/48/128 px): rote Karte mit weißem „%“, wie das Logo der Webseite.

Aufruf: python tools/make-icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROT = (227, 6, 19, 255)
WEISS = (255, 255, 255, 255)
FONT = "C:/Windows/Fonts/arialbd.ttf"
ZIEL = Path(__file__).resolve().parent.parent / "extension" / "icons"
SS = 8  # Supersampling für glatte Kanten


def icon(size: int) -> Image.Image:
    # Chrome empfiehlt bei 128 px ca. 16 px Rand um die eigentliche Grafik; kleine Größen nutzen die Fläche voll.
    rand = round(size * 0.125) if size >= 48 else 0
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = rand * SS
    w = s - 2 * r
    h = round(w * 0.78)
    top = (s - h) // 2
    d.rounded_rectangle((r, top, r + w, top + h), radius=round(w * 0.16), fill=ROT)
    font = ImageFont.truetype(FONT, round(h * 0.72))
    d.text((s / 2, s / 2), "%", font=font, fill=WEISS, anchor="mm")
    return img.resize((size, size), Image.LANCZOS)


ZIEL.mkdir(parents=True, exist_ok=True)
for size in (16, 32, 48, 128):
    icon(size).save(ZIEL / f"icon{size}.png")
    print("icon", size)
