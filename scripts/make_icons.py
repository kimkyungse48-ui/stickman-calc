#!/usr/bin/env python3
"""스틱맨 계산기 앱 아이콘 생성 (1024px로 그린 뒤 축소)."""
import os

from PIL import Image, ImageDraw, ImageFont

SS = 1024
CREAM = (247, 240, 224, 255)
CREAM_HI = (255, 252, 243, 255)
INK = (59, 52, 42, 255)
ACCENT = (245, 82, 42, 255)
ACCENT_DARK = (184, 55, 19, 255)
WHITE = (255, 253, 246, 255)
FONT = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "fonts", "NotoSansCJKkr-Bold.otf")


def rounded(draw, box, radius, fill=None, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def draw_scene(img, scale=1.0, offset=(0, 0)):
    """1024 기준 좌표로 장면을 그린다."""
    layer = Image.new("RGBA", (SS, SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    # 숫자판
    rounded(d, (150, 168, 874, 398), 58, fill=WHITE, outline=INK, width=16)
    rounded(d, (176, 192, 848, 374), 42, fill=None, outline=(59, 52, 42, 70), width=5)
    font = ImageFont.truetype(FONT, 158)
    d.text((812, 372), "88", font=font, fill=INK, anchor="rs")

    # 스틱맨 둘
    def figure(cx, head_r, body_top, color=ACCENT, girl=False):
        head_cy = 476
        # 팔
        d.line([(cx - head_r * 0.5, body_top - 6), (cx - head_r * 1.55, 404)], fill=INK, width=15)
        d.line([(cx + head_r * 0.5, body_top - 6), (cx + head_r * 1.55, 404)], fill=INK, width=15)
        for hx in (cx - head_r * 1.55, cx + head_r * 1.55):
            d.ellipse((hx - 20, 386, hx + 20, 426), fill=WHITE, outline=INK, width=11)
        # 몸통
        if girl:
            d.polygon([(cx, body_top - 8), (cx - 74, body_top + 92), (cx + 74, body_top + 92)], fill=color, outline=INK)
            d.line([(cx - 74, body_top + 92), (cx + 74, body_top + 92)], fill=INK, width=14)
        else:
            d.rounded_rectangle((cx - 52, body_top - 8, cx + 52, body_top + 92), radius=10, fill=color, outline=INK, width=14)
        # 다리
        d.line([(cx - 22, body_top + 90), (cx - 30, body_top + 158)], fill=INK, width=14)
        d.line([(cx + 22, body_top + 90), (cx + 30, body_top + 158)], fill=INK, width=14)
        # 머리
        d.ellipse((cx - head_r, head_cy - head_r, cx + head_r, head_cy + head_r), fill=WHITE, outline=INK, width=15)
        if girl:
            d.pieslice((cx - head_r - 6, head_cy - head_r - 6, cx + head_r + 6, head_cy + head_r + 6), 180, 360, fill=INK)
            d.ellipse((cx - head_r + 8, head_cy - head_r + 10, cx + head_r - 8, head_cy + head_r - 10), fill=WHITE)
        else:
            d.pieslice((cx - head_r, head_cy - head_r, cx + head_r, head_cy + head_r), 185, 355, fill=INK)
        # 얼굴
        eye_y = head_cy + 4
        d.ellipse((cx - 22, eye_y - 7, cx - 8, eye_y + 7), fill=INK)
        d.ellipse((cx + 8, eye_y - 7, cx + 22, eye_y + 7), fill=INK)
        d.arc((cx - 16, eye_y + 2, cx + 16, eye_y + 30), 20, 160, fill=INK, width=8)

    figure(300, 66, 566)
    figure(724, 72, 566, girl=True)

    # 키패드
    keys = [(176, 812, 314, 916), (346, 812, 484, 916), (516, 812, 654, 916), (686, 812, 848, 916)]
    for i, box in enumerate(keys):
        rounded(d, box, 34, fill=ACCENT, outline=INK, width=13)
        if i == 3:  # 마지막 키는 '=' 표시
            d.rounded_rectangle((box[0] + 26, box[1] + 40, box[2] - 26, box[1] + 52), radius=6, fill=WHITE)
            d.rounded_rectangle((box[0] + 26, box[1] + 62, box[2] - 26, box[1] + 74), radius=6, fill=WHITE)
        else:
            for k in range(2):
                d.ellipse(
                    (box[0] + 40 + k * 34, box[1] + 68, box[0] + 56 + k * 34, box[1] + 84), fill=WHITE
                )

    if scale != 1.0:
        w = int(SS * scale)
        layer = layer.resize((w, w), Image.LANCZOS)
    return layer, offset


def make_icon(size, out, rounded_corners=True, pad=0.0, bg=CREAM):
    base = Image.new("RGBA", (SS, SS), (0, 0, 0, 0))
    mask = Image.new("L", (SS, SS), 0)
    md = ImageDraw.Draw(mask)
    if rounded_corners:
        md.rounded_rectangle((0, 0, SS - 1, SS - 1), radius=230, fill=255)
    else:
        md.rectangle((0, 0, SS - 1, SS - 1), fill=255)
    base.paste(Image.new("RGBA", (SS, SS), bg), (0, 0), mask)

    inner_scale = 1.0 - pad
    layer, _ = draw_scene(None, inner_scale)
    # 가운데 정렬
    w = layer.size[0]
    base.alpha_composite(layer, ((SS - w) // 2, (SS - w) // 2))

    # 은은한 테두리
    if rounded_corners:
        d = ImageDraw.Draw(base)
        d.rounded_rectangle((8, 8, SS - 9, SS - 9), radius=224, outline=(59, 52, 42, 40), width=6)

    base = base.resize((size, size), Image.LANCZOS)
    base.save(out, "PNG")
    print("saved", out, base.size)


if __name__ == "__main__":
    ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    make_icon(192, os.path.join(ROOT, "icon-192.png"))
    make_icon(512, os.path.join(ROOT, "icon-512.png"))
    make_icon(180, os.path.join(ROOT, "apple-touch-icon.png"))
    make_icon(512, os.path.join(ROOT, "icon-maskable-512.png"), rounded_corners=False, pad=0.18)
