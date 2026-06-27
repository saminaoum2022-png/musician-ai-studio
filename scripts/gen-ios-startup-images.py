#!/usr/bin/env python3
"""Generate iOS apple-touch-startup-image splash PNGs.

iOS ignores the web manifest `background_color` for the home-screen (PWA)
launch screen — it only uses `apple-touch-startup-image`. Without one it paints
WHITE until the web splash renders, which is the startup flash users see in the
installed PWA.

These images are SOLID dark (#05070d) with NO logo. The logo is intentionally
left out: the in-app web boot splash (#bootSplash) already shows the N mark, and
iOS crossfades the launch image out over the web view, so a logo in BOTH would
appear as a faint "double logo" ghost during the handoff. Solid launch image →
web splash fades the single logo in once: no white flash, no double logo.

Re-run after changing the logo or device list:
    python3 scripts/gen-ios-startup-images.py
Then commit the generated PNGs under assets/splash/ios/.
"""

import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOGO = os.path.join(ROOT, "assets", "icons", "splash-mark.png")
OUT_DIR = os.path.join(ROOT, "assets", "splash", "ios")
BG = (5, 7, 13, 255)  # #05070d

# (css_width, css_height, device_pixel_ratio) for portrait iPhones we support.
DEVICES = [
    (320, 568, 2),   # SE (1st gen) / 5s
    (375, 667, 2),   # 6/7/8, SE 2/3
    (414, 736, 3),   # 6/7/8 Plus
    (375, 812, 3),   # X, XS, 11 Pro, 12/13 mini
    (390, 844, 3),   # 12, 13, 14
    (393, 852, 3),   # 14 Pro, 15, 15 Pro, 16
    (402, 874, 3),   # 16 Pro
    (360, 780, 3),   # 12 mini variant
    (414, 896, 2),   # XR, 11
    (414, 896, 3),   # XS Max, 11 Pro Max
    (428, 926, 3),   # 12/13 Pro Max, 14 Plus
    (430, 932, 3),   # 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
    (440, 956, 3),   # 16 Pro Max
]


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    for css_w, css_h, dpr in DEVICES:
        px_w, px_h = css_w * dpr, css_h * dpr
        # Solid dark, no logo (see module docstring — avoids the handoff double-logo).
        canvas = Image.new("RGB", (px_w, px_h), BG[:3])

        name = f"startup-{css_w}x{css_h}@{dpr}x.png"
        canvas.save(os.path.join(OUT_DIR, name), "PNG", optimize=True)
        print("wrote", name, f"({px_w}x{px_h})")


if __name__ == "__main__":
    main()
