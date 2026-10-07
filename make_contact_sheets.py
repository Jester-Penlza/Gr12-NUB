from pathlib import Path
from PIL import Image, ImageDraw
import sys

src = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('tmp/render_system_guide')
out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path('tmp/render_system_guide_contacts')
out.mkdir(parents=True, exist_ok=True)
pages = sorted(src.glob('page-*.png'), key=lambda p: int(p.stem.split('-')[1]))
thumb_w = 820
for start in range(0, len(pages), 4):
    group = pages[start:start + 4]
    first = Image.open(group[0]).convert('RGB')
    ratio = thumb_w / first.width
    thumb_h = int(first.height * ratio)
    canvas = Image.new('RGB', (thumb_w * 2 + 60, thumb_h * 2 + 100), 'white')
    draw = ImageDraw.Draw(canvas)
    for index, path in enumerate(group):
        img = Image.open(path).convert('RGB')
        img.thumbnail((thumb_w, thumb_h), Image.Resampling.LANCZOS)
        x = 20 + (index % 2) * (thumb_w + 20)
        y = 35 + (index // 2) * (thumb_h + 30)
        canvas.paste(img, (x, y))
        draw.text((x, y - 22), path.stem, fill='black')
    canvas.save(out / f'contact-{start + 1:02d}-{start + len(group):02d}.png')
print(f'{len(pages)} pages -> {len(list(out.glob("contact-*.png")))} contact sheets')
