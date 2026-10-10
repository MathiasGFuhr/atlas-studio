from PIL import Image
import os

src = os.environ.get("ATLAS_AI_LOGO_SRC") or r"C:\Users\MATHIA~1\AppData\Local\Temp\atlas-ai-logo-src.jpg"
out = r"D:\meus Projetos\altas Studio\src\renderer\assets\brand\logo-ai.png"

img = Image.open(src).convert("RGBA")
pixels = img.load()
w, h = img.size

for y in range(h):
    for x in range(w):
        r, g, b, _a = pixels[x, y]
        mx = max(r, g, b)
        # Outer pure black -> transparent
        if mx < 12:
            pixels[x, y] = (r, g, b, 0)
            continue
        # Soft edge around icon
        if mx < 28 and g < 45:
            alpha = int(255 * (mx - 12) / (28 - 12))
            pixels[x, y] = (r, g, b, max(0, min(255, alpha)))

bbox = img.getbbox()
if bbox:
    img = img.crop(bbox)

# Make square with transparent pad
side = max(img.width, img.height)
sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
sq.paste(img, ((side - img.width) // 2, (side - img.height) // 2), img)
sq = sq.resize((256, 256), Image.Resampling.LANCZOS)
sq.save(out, "PNG", optimize=True)
print("saved", out, sq.size, os.path.getsize(out))
