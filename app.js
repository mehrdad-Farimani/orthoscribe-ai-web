import { mountUI, render } from './ui.js';
import { createController } from './controller.js';
import { APP_CONFIG } from './config.js';

const controller = createController({ render });
mountUI(action => { void controller.dispatch(action); });
render(controller.getState());
const timer = setInterval(() => controller.tick(), 1000);
document.addEventListener('visibilitychange', () => { if (document.hidden) void controller.onHidden(); });
document.addEventListener('pointerdown', () => controller.activity(), { passive: true });
document.addEventListener('keydown', () => controller.activity());
window.addEventListener('pagehide', () => { void controller.onHidden(); });
window.addEventListener('beforeunload', event => {
  const state = controller.getState();
  if (state.mode === 'connected' && state.recording.status !== 'idle') { event.preventDefault(); event.returnValue = ''; }
});

// Only the public, static demo shell is cached. No API or recording response is cached.
if ('serviceWorker' in navigator && !APP_CONFIG.allowConnected && location.protocol === 'https:') {
  navigator.serviceWorker.register(new URL('./sw.js', import.meta.url), { scope: './', updateViaCache: 'none' }).catch(() => {});
}
window.addEventListener('unload', () => clearInterval(timer));
