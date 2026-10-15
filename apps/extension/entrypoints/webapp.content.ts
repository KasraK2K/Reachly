/**
 * Injected into the Reachly web app (registered at runtime by the background, since the URL comes from env).
 * Bridges window.postMessage from the Settings page to the extension: pairing + presence detection.
 */
export default defineContentScript({
  registration: 'runtime',
  main() {
    const announce = () => window.postMessage({ source: 'reachly-ext', type: 'hello', version: browser.runtime.getManifest().version }, location.origin);
    announce();
    window.addEventListener('message', async (e) => {
      if (e.source !== window || e.origin !== location.origin || e.data?.source !== 'reachly-web') return;
      if (e.data.type === 'ping') announce();
      if (e.data.type === 'pair' && typeof e.data.token === 'string') {
        const res = await browser.runtime.sendMessage({ type: 'pair', token: e.data.token });
        window.postMessage({ source: 'reachly-ext', type: 'paired', ok: !!res?.ok }, location.origin);
      }
    });
  },
});
