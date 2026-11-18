// Prueba de humo en navegador: juega una partida completa "solo vs bots".
// Uso: npm run build && node scripts/smoke.mjs [carpeta-capturas]
import { createRequire } from 'node:module';
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';

// Playwright se resuelve con require (en CI se instala como devDependency; aquí puede venir global)
const { chromium } = createRequire(import.meta.url)('playwright');

const salida = process.argv[2] || 'test-results';
await mkdir(salida, { recursive: true });
const server = await preview({ preview: { port: 4179, strictPort: true }, logLevel: 'silent' });
const url = 'http://localhost:4179/?semilla=4';   // semilla 4: evento Navidad en la semana 5
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: Number(process.env.DSF) || 1, hasTouch: true });
const page = await ctx.newPage();
const errores = [];
page.on('pageerror', (e) => errores.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
const foto = (n) => page.screenshot({ path: `${salida}/${n}.png`, fullPage: false });

try {
  await page.goto(url);
  await page.getByText('Jugar solo vs bots').click();
  // perfil
  await page.getByRole('radio', { name: /Avatar 3/ }).first().click();
  await page.getByLabel('Tu nombre').fill('Tester');
  await foto('01-perfil');
  await page.getByText('¡Listo!').click();
  // setup solo: tienda, 3 sabores, 5 semanas, sin reloj
  await page.getByRole('button', { name: /Tienda/ }).click();
  await page.locator('input[aria-label="Semanas"]').fill('6');
  await page.locator('input[aria-label="Semanas"]').blur();
  await foto('02-solo');
  await page.getByText('¡A producir!').click();
  await page.waitForSelector('.hud');
  await page.waitForTimeout(500);
  await foto('03-juego');
  for (let s = 1; s <= 6; s++) {
    if (s === 2) {
      await page.getByRole('button', { name: 'Sumar 0.1' }).first().click();
      await page.getByText('💡 Sugerencia').click();
      await page.getByRole('button', { name: 'Usar' }).click();
      await page.waitForTimeout(400);
      await foto('03b-habilidad');
      await page.getByText('¡Hacerlo!').click();
    }
    if (s === 5) {
      await page.waitForSelector('.evento-modal', { timeout: 3000 });
      await page.waitForTimeout(700);
      await foto('05b-evento');
    }
    if (s === 3) { await page.getByRole('tab', { name: /Cadena/ }).click(); await foto('04-cadena'); await page.getByRole('tab', { name: /Decidir/ }).click(); }
    if (s === 4) { await page.getByRole('tab', { name: /Mercado/ }).click(); await foto('05-mercado'); await page.getByRole('tab', { name: /Decidir/ }).click(); }
    // cierra un posible popup de evento
    const ent = page.getByText('Entendido');
    if (await ent.isVisible().catch(() => false)) await ent.click();
    await page.locator('.barra-envio .btn').click();
    await page.waitForFunction((n) => {
      const b = document.querySelector('.hud-sem b');
      return document.querySelector('.fin') || (b && Number(b.firstChild.textContent) >= n);
    }, s + 1, { timeout: 5000 });
  }
  await page.waitForSelector('.fin', { timeout: 5000 });
  await page.waitForTimeout(800);
  await foto('06-fin');
  await page.screenshot({ path: `${salida}/07-fin-completo.png`, fullPage: true });
  // home en modo oscuro
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.getByText('Inicio').click();
  await foto('08-home-oscuro');
  console.log(errores.length ? 'ERRORES:\n' + errores.join('\n') : 'SMOKE OK: partida completa sin errores');
  process.exitCode = errores.length ? 1 : 0;
} catch (e) {
  await foto('99-fallo');
  console.error('FALLÓ:', e.message, '\n', errores.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.httpServer.close();
}
