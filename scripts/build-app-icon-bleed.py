#!/usr/bin/env python3
"""Build a full-bleed 1024px iOS app icon (no black corner matte)."""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = Path(
    "/Users/samynaoum/.cursor/projects/Users-samynaoum-Desktop-musician-ai-studio/assets/"
    "30BE2907-D5AB-4A9C-A815-CE22E55DC0D1-d67c8c1c-57e5-4cf4-bdbb-94ae81ce4174.png"
)
SIZE = 1024
# Slightly over-fill so the colorful card reaches iOS icon edges (cover crop).
ZOOM_COVER = 1.12
# Gradient sampled from the white-N app icon artwork (purple → blue → cyan)
C_TL = (155, 21, 242)
C_TR = (10, 108, 215)
C_BL = (140, 21, 237)
C_BR = (4, 136, 218)


def lerp(a: tuple[int, ...], b: tuple[int, ...], t: float) -> tuple[int, int, int]:
    t = max(0.0, min(1.0, t))
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def make_bleed_background(size: int) -> Image.Image:
    im = Image.new("RGBA", (size, size))
    px = im.load()
    for y in range(size):
        ty = y / (size - 1)
        for x in range(size):
            tx = x / (size - 1)
            top = lerp(C_TL, C_TR, tx)
            bottom = lerp(C_BL, C_BR, tx)
            rgb = lerp(top, bottom, ty)
            px[x, y] = rgb + (255,)
    return im


def is_foreground(r: int, g: int, b: int) -> bool:
    return (r + g + b) > 38


def alpha_from_rgb(r: int, g: int, b: int) -> int:
    lum = r + g + b
    if lum > 60:
        return 255
    if lum < 18:
        return 0
    return min(255, int((lum - 18) * 6.2))


def is_white_mark(r: int, g: int, b: int, a: int) -> bool:
    return a > 48 and r > 185 and g > 185 and b > 205


def mark_centroid(im: Image.Image) -> tuple[float, float]:
    """Visual center of the white N (not the gradient card bbox)."""
    px = im.load()
    w, h = im.size
    sx = sy = n = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if is_white_mark(r, g, b, a):
                sx += x
                sy += y
                n += 1
    if n:
        return sx / n, sy / n
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 40 and (r + g + b) > 80:
                sx += x
                sy += y
                n += 1
    return (sx / n, sy / n) if n else (w / 2, h / 2)


def center_layer_on_canvas(layer: Image.Image, size: int) -> Image.Image:
    cx, cy = mark_centroid(layer)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ox = int(round(size / 2 - cx))
    oy = int(round(size / 2 - cy))
    out.paste(layer, (ox, oy), layer)
    return out


def build_icon(src: Path, size: int = SIZE) -> Image.Image:
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    px = im.load()
    minx, miny, maxx, maxy = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            r, g, b, _a = px[x, y]
            if is_foreground(r, g, b):
                minx = min(minx, x)
                miny = min(miny, y)
                maxx = max(maxx, x)
                maxy = max(maxy, y)
    crop = im.crop((minx, miny, maxx + 1, maxy + 1))
    scale = max(size / crop.width, size / crop.height) * ZOOM_COVER
    new_w = max(1, int(crop.width * scale))
    new_h = max(1, int(crop.height * scale))
    fg = crop.resize((new_w, new_h), Image.Resampling.LANCZOS)
    alpha = Image.new("L", fg.size, 0)
    apx = alpha.load()
    fpx = fg.load()
    for y in range(fg.height):
        for x in range(fg.width):
            r, g, b, _a = fpx[x, y]
            apx[x, y] = alpha_from_rgb(r, g, b)
    fg.putalpha(alpha)
    left = max(0, (new_w - size) // 2)
    top = max(0, (new_h - size) // 2)
    fg = fg.crop((left, top, left + size, top + size))
    fg = center_layer_on_canvas(fg, size)
    bg = make_bleed_background(size)
    bg.paste(fg, (0, 0), fg)
    out = Image.new("RGB", (size, size))
    out.paste(bg, mask=bg.split()[3])
    return out


def main() -> None:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else SRC
    icon = build_icon(src)
    targets = [
        ROOT / "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png",
        ROOT / "assets/icons/app-icon-master.png",
    ]
    for path in targets:
        path.parent.mkdir(parents=True, exist_ok=True)
        icon.save(path, "PNG", optimize=True)
        print("wrote", path)
    sizes = {
        "icon-512.png": 512,
        "icon-192.png": 192,
        "apple-touch-icon.png": 180,
        "favicon-32.png": 32,
        "favicon-16.png": 16,
    }
    for name, dim in sizes.items():
        out = ROOT / "assets/icons" / name
        icon.resize((dim, dim), Image.Resampling.LANCZOS).save(out, "PNG", optimize=True)
        print("wrote", out)


if __name__ == "__main__":
    main()
