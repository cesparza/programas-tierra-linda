# Reduce el peso de las imágenes del manual. Se corre despues de tools/capturas.js.
#   python3 tools/optimizar-capturas.py
from PIL import Image
from pathlib import Path

carpeta = Path(__file__).resolve().parent.parent / 'capturas'
ANCHO_MAXIMO = 1300      # el doble del ancho en que se muestran, para pantallas retina

for archivo in sorted(carpeta.glob('*.png')):
    im = Image.open(archivo).convert('RGB')
    if im.width > ANCHO_MAXIMO:
        im = im.resize((ANCHO_MAXIMO, round(ANCHO_MAXIMO * im.height / im.width)), Image.LANCZOS)
    antes = archivo.stat().st_size
    im.save(archivo, optimize=True)
    print(f'  {archivo.name:24} {antes // 1024:4} KB -> {archivo.stat().st_size // 1024:4} KB  ({im.width}x{im.height})')
