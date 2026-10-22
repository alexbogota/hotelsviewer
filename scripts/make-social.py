"""Makes the pictures for the HotelsViewer social profiles in brand/social/.

  avatar.jpg            1000x1000  Bluesky, Mastodon, Quora profile photo (safe for round and rounded crops)
  banner.jpg            1500x500   Bluesky banner and Mastodon header (3:1)
  quora-space-cover.jpg 1600x400   cover of a Quora Space (Quora profiles have no cover, only Spaces do)
  quora-space-icon.jpg  500x500    icon of a Quora Space

Run: python3 scripts/make-social.py
Uses the site's own fonts from node_modules (Newsreader, Public Sans), so run `npm install` first.

The picture: the view from a window at sunset. Pale sky, a brass sun resting on the horizon, a calm sea with its
glitter path, and on the horizon two soft ridges (the avatar) or a city skyline (the banner and the Quora cover: the
owner asked for a more urban picture on 21 Oct 2026). Light all over, no dark ground and no arch shapes (the first version, 18 Oct 2026,
was arches on a dark ground and the owner said it looked like headstones). Everything is drawn here: no photos and no
real landmarks, so nothing needs a licence or a credit and nothing claims anything about a place.
JPEG on purpose: a smooth gradient with light grain as PNG is over 1 MB, and Bluesky takes at most 1 MB.
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "node_modules" / "@fontsource-variable"
OUT = ROOT / "brand" / "social"

INK = (28, 38, 51)
ZINC = (86, 100, 119)

# colours of the picture (floats are fine, they are mixed)
SKY = [(0.0, (132, 168, 199)), (0.5, (205, 220, 233)), (1.0, (243, 217, 178))]  # top -> horizon
SEA = [(0.0, (196, 208, 220)), (0.10, (152, 176, 199)), (1.0, (76, 104, 134))]  # horizon -> bottom
SUN = (226, 166, 74)
GLOW = (255, 210, 150)
GLINT = (255, 240, 210)
WAVE = (226, 237, 246)
RIDGE_FAR = (176, 193, 209)
RIDGE_NEAR = (122, 148, 173)
FAR_CITY = (176, 192, 208)   # hazy row of buildings far away
NEAR_CITY = (92, 117, 144)   # the near row, darker
WINDOW = (255, 216, 148)     # a lit window at sunset

SS = 2  # draw at double size, then shrink: smooth edges
MAX_BYTES = 1_000_000  # Bluesky: 1 MB per picture


def serif(size, weight=600):
    f = ImageFont.truetype(str(FONTS / "newsreader/files/newsreader-latin-opsz-normal.woff2"), round(size * SS))
    f.set_variation_by_axes([weight, 72])
    return f


def sans(size, weight=500):
    f = ImageFont.truetype(str(FONTS / "public-sans/files/public-sans-latin-wght-normal.woff2"), round(size * SS))
    f.set_variation_by_axes([weight])
    return f


def stops(n, table):
    """n rows of colour from a table of (position 0..1, colour)."""
    t = np.linspace(0, 1, n)
    return np.stack([np.interp(t, [s[0] for s in table], [s[1][c] for s in table]) for c in range(3)], axis=1).astype(np.float32)


def mix(img, color, a):
    """img * (1 - a) + color * a, a is (h, w)."""
    img *= (1 - a)[..., None]
    img += a[..., None] * np.array(color, dtype=np.float32)


def ridge(w, rng, amp, centre, spread):
    """Height (pixels) of a soft ridge along x: a bump around `centre` (0..1 of the width), made rough by a few waves."""
    x = np.linspace(0, 1, w, dtype=np.float32)
    waves = sum(rng.uniform(0.5, 1.0) * np.sin(2 * np.pi * f * x + rng.uniform(0, 6.28)) for f in (2.1, 4.7, 9.3))
    waves = (waves - waves.min()) / (waves.max() - waves.min())
    bump = np.exp(-(((x - centre) / spread) ** 2))
    return amp * bump * (0.35 + 0.65 * waves)


def city(img, rng, w, h, hy):
    """A skyline along the horizon: a hazy far row behind a darker near row with a few lit windows, and the near row's
    reflection in the water. Tall towers stand at the left and right ends and low buildings in the middle, so the name
    in the sky keeps its room. Plain boxes with setbacks and masts: no building that anyone could recognise."""

    def curve(points):
        xs, ys = zip(*points)
        return lambda x: float(np.interp(x, xs, ys))

    # heights as a share of the picture height, along x (0..1). Low where the name stands and where the sun sets.
    far_h = curve([(0, 0.12), (0.30, 0.10), (0.50, 0.06), (0.70, 0.04), (0.80, 0.02), (0.88, 0.08), (1, 0.10)])
    near_h = curve([(0, 0.22), (0.12, 0.30), (0.25, 0.18), (0.28, 0.07), (0.50, 0.05), (0.68, 0.045), (0.72, 0.02), (0.86, 0.02), (0.90, 0.20), (1, 0.14)])

    def row(height_at, jitter):
        """Buildings side by side along the whole width: (left, width, height, setback height, mast height)."""
        out, x = [], -rng.uniform(0, 0.03 * h)
        while x < w:
            bw = rng.uniform(0.06, 0.16) * h
            bh = height_at((x + bw / 2) / w) * h * rng.uniform(*jitter)
            setback = bh * rng.uniform(0.12, 0.28) if rng.random() < 0.35 else 0.0
            mast = h * rng.uniform(0.03, 0.07) if rng.random() < 0.30 and bh > 0.11 * h else 0.0  # none on low buildings: they stand under the text
            out.append((x, bw, bh, setback, mast))
            x += bw
        return out

    def paint(buildings, color):
        layer = Image.new("L", (w, h), 0)
        d = ImageDraw.Draw(layer)
        for x, bw, bh, setback, mast in buildings:
            d.rectangle((round(x), round(hy - bh), round(x + bw), hy), fill=255)
            if setback:
                d.rectangle((round(x + bw * 0.22), round(hy - bh - setback), round(x + bw * 0.78), round(hy - bh)), fill=255)
            if mast:
                cx = x + bw / 2
                d.rectangle((round(cx - SS), round(hy - bh - setback - mast), round(cx + SS), round(hy - bh - setback)), fill=255)
        mix(img, color, np.asarray(layer, dtype=np.float32) / 255)

    far = row(far_h, (0.5, 1.0))
    near = row(near_h, (0.6, 1.0))
    paint(far, FAR_CITY)
    paint(near, NEAR_CITY)

    # a few lit windows on the taller near buildings
    lights = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(lights)
    cell, ww, wh = 0.034 * h, 0.012 * h, 0.017 * h
    for x, bw, bh, setback, mast in near:
        if bh < 0.10 * h:
            continue
        cols, rows = int((bw - 0.5 * cell) // cell), int((bh - cell) // cell)
        for c in range(cols):
            for r in range(rows):
                if rng.random() < 0.30:
                    wx, wy = x + 0.5 * cell + c * cell, hy - bh + 0.6 * cell + r * cell
                    d.rectangle((round(wx), round(wy), round(wx + ww), round(wy + wh)), fill=int(255 * rng.uniform(0.55, 0.9)))
    mix(img, WINDOW, np.asarray(lights, dtype=np.float32) / 255)

    # the reflection of the near row: soft, fading with depth
    refl = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(refl)
    for x, bw, bh, setback, mast in near:
        depth = int(0.9 * (bh + setback))
        for k in range(0, depth, 2):
            d.rectangle((round(x), hy + k, round(x + bw), hy + k + 2), fill=int(255 * 0.32 * (1 - k / depth)))
    refl = refl.filter(ImageFilter.GaussianBlur(1.5 * SS))
    mix(img, NEAR_CITY, np.asarray(refl, dtype=np.float32) / 255)


def scene(W, H, sun_x, sun_r, horizon, seed=7, landscape="hills"):
    """The view as a float image of size (H*SS, W*SS, 3). sun_r is the sun radius as a share of the height.
    landscape: "hills" (two soft ridges, the avatar) or "city" (a skyline, the banner and the cover)."""
    rng = np.random.default_rng(seed)
    w, h = W * SS, H * SS
    hy = round(h * horizon)
    img = np.zeros((h, w, 3), dtype=np.float32)
    img[:hy] = stops(hy, SKY)[:, None, :]
    img[hy:] = stops(h - hy, SEA)[:, None, :]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)

    r = sun_r * h
    sx, sy = sun_x * w, hy - 0.25 * r

    # warm glow around the sun, weaker on the water
    d = np.hypot(xx - sx, yy - sy)
    glow = np.exp(-((d / (2.6 * r + 0.18 * h)) ** 2)) * 0.62
    glow[hy:] *= 0.45
    mix(img, GLOW, glow)

    # the sun, only above the horizon
    disc = np.clip((r - d) / SS + 0.5, 0, 1)
    disc[hy:] = 0
    mix(img, SUN, disc)

    if landscape == "city":
        # its own random generator, so the glitter below does not depend on how many buildings there are
        city(img, np.random.default_rng(seed + 100), w, h, hy)
    else:
        # two ridges standing on the horizon: a far hazy one across, a nearer one on the left
        for color, amp, centre, spread in ((RIDGE_FAR, 0.050 * h, 0.30, 0.55), (RIDGE_NEAR, 0.115 * h, 0.17, 0.20)):
            top = hy - ridge(w, rng, amp, centre, spread)
            cov = np.clip(yy - top[None, :] + 0.5, 0, 1)
            cov[hy:] = 0
            mix(img, color, cov)

    # glitter path of the sun on the water, and a few waves elsewhere
    layer = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(layer)
    depth = h - hy
    for _ in range(int(depth * 0.55)):
        u = rng.random()
        y = hy + 2 * SS + u * (depth - 4 * SS)
        spread = r * (0.45 + 1.9 * u)
        cx = sx + rng.normal(0, spread)
        length = r * (0.30 + 1.5 * u) * rng.uniform(0.35, 1.0)
        thick = max(1.0, SS * (0.9 + 3.2 * u)) * rng.uniform(0.7, 1.2)
        strength = np.exp(-(((cx - sx) / (2.3 * spread)) ** 2)) * (0.95 - 0.45 * u) * rng.uniform(0.5, 1.0)
        draw.line((cx - length / 2, y, cx + length / 2, y), fill=int(255 * strength), width=round(thick))
    glitter = np.asarray(layer.filter(ImageFilter.GaussianBlur(0.5 * SS)), dtype=np.float32) / 255
    mix(img, GLINT, np.clip(glitter * 0.9, 0, 1))

    waves = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(waves)
    for _ in range(int(depth * 0.12)):
        u = rng.random()
        y = hy + 6 * SS + u * (depth - 8 * SS)
        length = r * (0.5 + 2.0 * u) * rng.uniform(0.4, 1.0)
        cx = rng.uniform(0, w)
        draw.line((cx - length / 2, y, cx + length / 2, y), fill=int(70 + 50 * u), width=max(1, round(SS * (0.7 + 1.6 * u))))
    mix(img, WAVE, np.asarray(waves.filter(ImageFilter.GaussianBlur(0.5 * SS)), dtype=np.float32) / 255 * 0.55)

    # a little grain so the gradients do not show bands
    img += rng.normal(0, 1.6, (h, w, 1)).astype(np.float32)
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))


def save(img, size, name):
    """Shrink, save as JPEG and make sure the file is under the Bluesky limit."""
    OUT.mkdir(parents=True, exist_ok=True)
    out = img.resize(size, Image.LANCZOS)
    path = OUT / name
    for quality in (94, 90, 86, 80):
        out.save(path, "JPEG", quality=quality, subsampling=0, optimize=True)
        if path.stat().st_size <= MAX_BYTES:
            break
    else:
        raise SystemExit(f"{name} is over 1 MB even at quality 80")
    print(f"saved {path.relative_to(ROOT)} ({size[0]}x{size[1]}, {path.stat().st_size / 1024:.0f} KB, quality {quality})")


def avatar(size):
    """The view, full square: nothing important near the corners, so round and rounded crops both work."""
    return scene(size, size, sun_x=0.60, sun_r=0.085, horizon=0.62, seed=11)


def banner(W, H):
    """Wide view. The name and the line stand in the sky, the sun at the right. The bottom left stays calm water:
    Bluesky and Mastodon put the profile photo over it."""
    img = scene(W, H, sun_x=0.79, sun_r=0.085, horizon=0.64, seed=5, landscape="city")
    d = ImageDraw.Draw(img)
    k = H / 500
    text_x = round(0.30 * W * SS)
    max_w = round(0.45 * W * SS)

    size = 104 * k
    name = "HotelsViewer"
    while d.textlength(name, font=serif(size, 600)) > max_w and size > 20:
        size -= 2
    name_font = serif(size, 600)
    tag = "See the view before you book."
    tag_size = 34 * k
    while d.textlength(tag, font=sans(tag_size, 480)) > max_w and tag_size > 12:
        tag_size -= 1
    tag_font = sans(tag_size, 480)

    horizon_y = round(0.64 * H * SS)
    tag_box = d.textbbox((0, 0), tag, font=tag_font)
    name_box = d.textbbox((0, 0), name, font=name_font)
    tag_bottom = horizon_y - round(0.115 * H * SS)
    tag_top = tag_bottom - (tag_box[3] - tag_box[1])
    name_bottom = tag_top - round(0.05 * H * SS)
    name_top = name_bottom - (name_box[3] - name_box[1])
    d.text((text_x - tag_box[0], tag_top - tag_box[1]), tag, font=tag_font, fill=ZINC)
    d.text((text_x - name_box[0], name_top - name_box[1]), name, font=name_font, fill=INK)
    return img


def main():
    save(avatar(1000), (1000, 1000), "avatar.jpg")
    save(banner(1500, 500), (1500, 500), "banner.jpg")
    save(banner(1600, 400), (1600, 400), "quora-space-cover.jpg")
    save(avatar(500), (500, 500), "quora-space-icon.jpg")


if __name__ == "__main__":
    main()
