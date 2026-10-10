from PIL import Image
import os

src = os.environ.get("ATLAS_LOGO_SRC") or r"C:\Users\MATHIA~1\AppData\Local\Temp\atlas-logo-src.jpg"
brand = r"D:\meus Projetos\altas Studio\src\renderer\assets\brand"
out_h = os.path.join(brand, "logo-horizontal.png")
out_m = os.path.join(brand, "logo-mark.png")
out_sq = os.path.join(brand, "logo-mark-square.png")
out_jpg_cleanup = os.path.join(brand, "logo-horizontal.jpg")

img = Image.open(src).convert("RGBA")
pixels = img.load()
w, h = img.size

for y in range(h):
    for x in range(w):
        r, g, b, _a = pixels[x, y]
        mx = max(r, g, b)
        if mx < 18:
            pixels[x, y] = (r, g, b, 0)
            continue
        if mx < 42 and g < 80:
            greenish = g > r + 8 and g > b + 8
            if not greenish:
                alpha = int(255 * (mx - 18) / (42 - 18))
                pixels[x, y] = (r, g, b, max(0, min(255, alpha)))

bbox = img.getbbox()
if bbox:
    img = img.crop(bbox)

pad = 12
canvas = Image.new("RGBA", (img.width + pad * 2, img.height + pad * 2), (0, 0, 0, 0))
canvas.paste(img, (pad, pad), img)
canvas.save(out_h, "PNG", optimize=True)

mw, mh = canvas.size
mark_w = int(mw * 0.38)
mark = canvas.crop((0, 0, mark_w, mh))
mb = mark.getbbox()
if mb:
    mark = mark.crop(mb)
side = max(mark.width, mark.height)
sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
sq.paste(mark, ((side - mark.width) // 2, (side - mark.height) // 2), mark)
sq.resize((512, 512), Image.Resampling.LANCZOS).save(out_sq, "PNG", optimize=True)
sq.resize((256, 256), Image.Resampling.LANCZOS).save(out_m, "PNG", optimize=True)

if os.path.exists(out_jpg_cleanup):
    os.remove(out_jpg_cleanup)

print("horizontal", canvas.size, os.path.getsize(out_h))
print("mark", os.path.getsize(out_m))
print("mark-square", os.path.getsize(out_sq))
