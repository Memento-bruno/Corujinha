// Gera um único HTML autocontido do app em modo demonstração
// (JS, fontes e imagens embutidos), para abrir no navegador sem servidor.
// Uso: node scripts/build-web-demo.mjs <pasta-do-expo-export> <saida.html>
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";

const [, , dir, out] = process.argv;
if (!dir || !out) {
  console.error("uso: node scripts/build-web-demo.mjs <export-dir> <saida.html>");
  process.exit(1);
}

const jsDir = join(dir, "_expo/static/js/web");
const entry = readdirSync(jsDir).find((f) => f.startsWith("entry-") && f.endsWith(".js"));
if (!entry) throw new Error("bundle web não encontrado (rode expo export --platform web)");
let js = readFileSync(join(jsDir, entry), "utf8");

const mime = { ".png": "image/png", ".ttf": "font/ttf", ".otf": "font/otf", ".jpg": "image/jpeg" };
js = js.replace(/"(\/assets\/[^"]+)"/g, (m, path) => {
  const type = mime[extname(path)];
  if (!type) return m;
  const data = readFileSync(join(dir, decodeURI(path))).toString("base64");
  return JSON.stringify(`data:${type};base64,${data}`);
});
js = js.replace(/<\/script/gi, "<\\/script");

const html = `<title>Corujinha</title>
<meta name="description" content="Versão de teste do Corujinha com dados fictícios">
<style>
  :root { --bg: #FAF9FC; }
  html, body { height: 100%; background: var(--bg); }
  body { overflow: hidden; }
  #root { display: flex; height: 100%; flex: 1; }
</style>
<div id="root"></div>
<script>
  // O roteador do app lê o caminho da URL; começamos sempre na tela inicial.
  try { history.replaceState(null, "", "/"); } catch (e) {}
</script>
<script>${js}</script>
`;
writeFileSync(out, html);
console.log(`ok: ${out} (${(html.length / 1024 / 1024).toFixed(2)} MB)`);
