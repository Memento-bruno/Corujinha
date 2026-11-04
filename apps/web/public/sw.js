// Service worker mínimo do Corujinha: permite instalar como app (PWA).
// Não guarda em cache nenhuma resposta de API (dados financeiros ficam só no servidor/Drive).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
