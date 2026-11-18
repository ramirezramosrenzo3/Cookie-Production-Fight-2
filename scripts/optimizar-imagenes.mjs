// Convierte las imágenes originales (PNG) a WebP redimensionado.
// Uso: node scripts/optimizar-imagenes.mjs <carpeta-origen-v1>
// Resultado en public/img y public/avatares. Los íconos de la PWA se mantienen en PNG.
import sharp from 'sharp';
import { readdir, mkdir, stat } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';

const origen = process.argv[2] || '../juego-reposicion';
const destino = 'public';

// ancho máximo por carpeta (las imágenes se muestran pequeñas; 2x para pantallas retina)
const reglas = [
  { dir: 'img', max: 320, out: 'img' },
  { dir: 'img/eventos', max: 360, out: 'img/eventos' },
  { dir: 'img/habilidades', max: 320, out: 'img/habilidades' },
  { dir: 'avatares', max: 256, out: 'avatares' },
];
const especiales = { 'logo.png': 760 };
const iconos = new Set(['icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'favicon-32.png']);

let antes = 0, despues = 0;
for (const r of reglas) {
  const dirIn = join(origen, r.dir);
  const dirOut = join(destino, r.out);
  await mkdir(dirOut, { recursive: true });
  for (const f of await readdir(dirIn)) {
    if (extname(f) !== '.png') continue;
    const src = join(dirIn, f);
    antes += (await stat(src)).size;
    if (iconos.has(f)) {
      const out = join(dirOut, f);
      await sharp(src).png({ compressionLevel: 9, palette: true }).toFile(out);
      despues += (await stat(out)).size;
      continue;
    }
    const out = join(dirOut, basename(f, '.png') + '.webp');
    await sharp(src).resize({ width: especiales[f] || r.max, withoutEnlargement: true }).webp({ quality: 82, alphaQuality: 90, effort: 6 }).toFile(out);
    despues += (await stat(out)).size;
  }
}
console.log(`Antes: ${(antes / 1024).toFixed(0)} KB · Después: ${(despues / 1024).toFixed(0)} KB · Ahorro ${Math.round((1 - despues / antes) * 100)}%`);
