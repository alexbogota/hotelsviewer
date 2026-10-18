"""Makes public/og-image.png (1200x630), the picture shown when a HotelsViewer link is shared.

Run once after changing the brand: python3 scripts/make-og.py
Uses the site's own fonts from node_modules (Newsreader, Public Sans), so run `npm install` first.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "node_modules" / "@fontsource-variable"
OUT = ROOT / "public" / "og-image.png"

PAPER = (243, 246, 248)
INK = (28, 38, 51)
ZINC = (86, 100, 119)
BRASS = (168, 117, 42)
SKY_TOP = (185, 205, 221)
SKY_MID = (219, 229, 237)
SKY_LOW = (234, 217, 189)

W, H = 1200, 630


def serif(size, weight=600):
    f = ImageFont.truetype(str(FONTS / "newsreader/files/newsreader-latin-opsz-normal.woff2"), size)
    f.set_variation_by_axes([weight, 72])
    return f


def sans(size, weight=500):
    f = ImageFont.truetype(str(FONTS / "public-sans/files/public-sans-latin-wght-normal.woff2"), size)
    f.set_variation_by_axes([weight])
    return f


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def sky(w, h):
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        t = y / (h - 1)
        c = lerp(SKY_TOP, SKY_MID, t / 0.58) if t < 0.58 else lerp(SKY_MID, SKY_LOW, (t - 0.58) / 0.42)
        for x in range(w):
            px[x, y] = c
    return img


def arch_mask(w, h):
    m = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(m)
    r = w // 2
    d.rectangle((0, r, w, h), fill=255)
    d.ellipse((0, 0, w, 2 * r), fill=255)
    return m


def main():
    img = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(img)

    # The arched window with a sky, a horizon and a brass sun.
    aw, ah = 330, 470
    ax, ay = 836, 80
    window = sky(aw, ah)
    wd = ImageDraw.Draw(window)
    horizon = int(ah * 0.66)
    wd.line((0, horizon, aw, horizon), fill=(120, 132, 146), width=2)
    wd.ellipse((aw * 0.62 - 26, horizon - 120 - 26, aw * 0.62 + 26, horizon - 120 + 26), fill=BRASS)
    img.paste(window, (ax, ay), arch_mask(aw, ah))
    # thin frame around the window
    frame = Image.new("L", (aw + 12, ah + 12), 0)
    outer = arch_mask(aw + 12, ah + 12)
    inner = Image.new("L", (aw + 12, ah + 12), 0)
    inner.paste(arch_mask(aw, ah), (6, 6))
    frame.paste(outer)
    frame.paste(0, mask=inner)
    img.paste(INK, (ax - 6, ay - 6), frame)

    # Headline.
    head = serif(80, 600)
    y = 112
    for line in ["Which hotel room", "actually has", "the view?"]:
        d.text((80, y), line, font=head, fill=INK)
        y += 90

    body = sans(28, 450)
    d.text((82, y + 22), "The exact room category to book, and the", font=body, fill=ZINC)
    d.text((82, y + 60), "look-alikes to skip.", font=body, fill=ZINC)

    # Logo mark + address.
    mx, my = 82, 548
    d.rounded_rectangle((mx, my, mx + 40, my + 40), radius=8, fill=INK)
    d.arc((mx + 10, my + 7, mx + 30, my + 27), 180, 360, fill=PAPER, width=3)
    d.line((mx + 10, my + 17, mx + 10, my + 34), fill=PAPER, width=3)
    d.line((mx + 30, my + 17, mx + 30, my + 34), fill=PAPER, width=3)
    d.line((mx + 10, my + 34, mx + 30, my + 34), fill=PAPER, width=3)
    d.line((mx + 11, my + 27, mx + 29, my + 27), fill=PAPER, width=2)
    d.ellipse((mx + 21, my + 16, mx + 27, my + 22), fill=(214, 164, 87))
    d.text((mx + 56, my + 4), "hotelsviewer.com", font=sans(28, 600), fill=INK)

    img.save(OUT, optimize=True)
    print(f"saved {OUT.relative_to(ROOT)} ({W}x{H})")


if __name__ == "__main__":
    main()
