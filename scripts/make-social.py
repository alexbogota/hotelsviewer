"""Makes the pictures for the HotelsViewer social profiles in brand/social/.

  avatar.png            1000x1000  Bluesky, Mastodon, Quora profile photo (safe for round and rounded crops)
  banner.png            1500x500   Bluesky banner and Mastodon header (3:1)
  quora-space-cover.png 1600x400   cover of a Quora Space (Quora profiles have no cover, only Spaces do)
  quora-space-icon.png  500x500    icon of a Quora Space

Run: python3 scripts/make-social.py
Uses the site's own fonts from node_modules (Newsreader, Public Sans), so run `npm install` first.
Same drawing language as the site: arched window, sky, thin horizon, brass sun. No photos and no landmarks
on purpose: nothing here needs a licence or a credit, and nothing claims anything about a place.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "node_modules" / "@fontsource-variable"
OUT = ROOT / "brand" / "social"

PAPER = (243, 246, 248)
INK = (28, 38, 51)
ZINC = (86, 100, 119)
BRASS = (168, 117, 42)
SKY_TOP = (185, 205, 221)
SKY_MID = (219, 229, 237)
SKY_LOW = (234, 217, 189)
HORIZON_IN_WINDOW = (120, 132, 146)

SS = 2  # draw at double size, then shrink: smooth edges


def serif(size, weight=600):
    f = ImageFont.truetype(str(FONTS / "newsreader/files/newsreader-latin-opsz-normal.woff2"), round(size * SS))
    f.set_variation_by_axes([weight, 72])
    return f


def sans(size, weight=500):
    f = ImageFont.truetype(str(FONTS / "public-sans/files/public-sans-latin-wght-normal.woff2"), round(size * SS))
    f.set_variation_by_axes([weight])
    return f


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def mix(a, b, t):
    return lerp(a, b, t)


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


def window(canvas, x, y, w, h, sun_x=0.62, frame=INK, frame_px=10, sun_r=0.1):
    """An arched window with sky, horizon at 66% of its height and a brass sun. x, y, w, h in canvas pixels."""
    # frame ring (drawn first, the window covers its inside)
    fw, fh = w + 2 * frame_px, h + 2 * frame_px
    ring = arch_mask(fw, fh)
    canvas.paste(frame, (x - frame_px, y - frame_px), ring)
    # sky
    pic = sky(w, h)
    pd = ImageDraw.Draw(pic)
    horizon = int(h * 0.66)
    pd.line((0, horizon, w, horizon), fill=HORIZON_IN_WINDOW, width=max(2, round(w * 0.012)))
    sx, sy, sr = w * sun_x, h * 0.405, w * sun_r
    pd.ellipse((sx - sr, sy - sr, sx + sr, sy + sr), fill=BRASS)
    canvas.paste(pic, (x, y), arch_mask(w, h))


def finish(img, size, name):
    OUT.mkdir(parents=True, exist_ok=True)
    out = img.resize(size, Image.LANCZOS)
    path = OUT / name
    out.save(path, optimize=True)
    kb = path.stat().st_size / 1024
    print(f"saved {path.relative_to(ROOT)} ({size[0]}x{size[1]}, {kb:.0f} KB)")


def avatar(size):
    """Dark slate square, one big arched window in the middle. Fits inside a circle with room to spare."""
    s = size * SS
    img = Image.new("RGB", (s, s), INK)
    w, h = round(s * 0.46), round(s * 0.62)
    window(img, (s - w) // 2, (s - h) // 2, w, h, sun_x=0.62, frame=PAPER, frame_px=round(s * 0.018), sun_r=0.13)
    return img


def banner(W, H):
    """Paper background. Left: a sun above a thin horizon. Middle: name and tagline standing on the horizon.
    Right: three arched windows. The bottom left stays calm because the profile photo covers it."""
    k = H / 500
    w_, h_ = W * SS, H * SS
    img = Image.new("RGB", (w_, h_), PAPER)
    d = ImageDraw.Draw(img)
    K = k * SS

    # three windows on one sill line
    ww, gap, margin = round(132 * K), round(26 * K), round(70 * K)
    heights = [round(300 * K), round(380 * K), round(340 * K)]
    suns = [0.66, 0.36, 0.7]
    sill = round(440 * K)
    group_w = 3 * ww + 2 * gap
    left = w_ - margin - group_w
    for i, (hh, sx) in enumerate(zip(heights, suns)):
        window(img, left + i * (ww + gap), sill - hh, ww, hh, sun_x=sx, frame=INK, frame_px=round(5 * K), sun_r=0.1)

    # horizon line, from the left edge up to the windows
    horizon_y = round(0.60 * h_)  # a bit higher than the windows' own horizon: keeps clear of a profile photo that covers the bottom left
    line_c = mix(PAPER, INK, 0.3)
    d.line((0, horizon_y, left - round(40 * K), horizon_y), fill=line_c, width=max(2, round(2 * K)))

    # half a sun sitting on the horizon, at the left
    sx, sr = round(0.113 * w_), round(46 * K)
    d.pieslice((sx - sr, horizon_y - sr, sx + sr, horizon_y + sr), 180, 360, fill=BRASS)

    # name and tagline, standing on the horizon
    text_x = round(0.27 * w_)
    max_w = left - round(60 * K) - text_x
    size = 104 * k
    while True:
        name_font = serif(size, 600)
        if d.textlength("HotelsViewer", font=name_font) <= max_w or size < 20:
            break
        size -= 2
    tag_font = sans(34 * k, 450)
    tag = "See the view before you book."
    tag_size = 34 * k
    while d.textlength(tag, font=tag_font) > max_w and tag_size > 12:
        tag_size -= 1
        tag_font = sans(tag_size, 450)
    tag_bbox = d.textbbox((0, 0), tag, font=tag_font)
    name_bbox = d.textbbox((0, 0), "HotelsViewer", font=name_font)
    tag_bottom = horizon_y - round(30 * K)
    tag_top = tag_bottom - (tag_bbox[3] - tag_bbox[1])
    d.text((text_x - tag_bbox[0], tag_top - tag_bbox[1]), tag, font=tag_font, fill=ZINC)
    name_bottom = tag_top - round(26 * K)
    name_top = name_bottom - (name_bbox[3] - name_bbox[1])
    d.text((text_x - name_bbox[0], name_top - name_bbox[1]), "HotelsViewer", font=name_font, fill=INK)
    return img


def main():
    finish(avatar(1000), (1000, 1000), "avatar.png")
    finish(banner(1500, 500), (1500, 500), "banner.png")
    finish(banner(1600, 400), (1600, 400), "quora-space-cover.png")
    finish(avatar(500), (500, 500), "quora-space-icon.png")


if __name__ == "__main__":
    main()
