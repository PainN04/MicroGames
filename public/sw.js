// Service worker mínimo: só existe pra o navegador oferecer "Instalar app" (ícone na tela, abre em tela cheia).
// Não guarda nada em cache: o ranking e a atualização automática da página continuam iguais.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
