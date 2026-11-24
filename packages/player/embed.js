// Optional same-origin layout bridge. No game state, storage, commands or
// parent DOM access. A standalone/file player never starts this protocol.
(() => {
  if (window.parent === window || !/^https?:$/.test(location.protocol)) return;
  const channel = 'retrorealm-basic-lab:layout', origin = location.origin;
  let token = null, lastHeight = 0, pending = false;
  const sendHeight = () => {
    if (!token || pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      // Measure intrinsic content, not document.scrollHeight (which is at
      // least the iframe viewport and would prevent shrinking).
      const height = Math.ceil(document.querySelector('main').getBoundingClientRect().height) + 2;
      if (height !== lastHeight) {
        lastHeight = height;
        window.parent.postMessage({ channel, version: 1, type: 'height', token, height }, origin);
      }
    });
  };
  window.addEventListener('message', event => {
    const data = event.data;
    if (event.source !== window.parent || event.origin !== origin || !data || typeof data !== 'object' || Array.isArray(data)) return;
    if (Object.keys(data).sort().join(',') !== 'channel,token,type,version' || data.channel !== channel || data.version !== 1 || data.type !== 'observe' || typeof data.token !== 'string' || !/^[a-f0-9]{32}$/.test(data.token)) return;
    token = data.token; lastHeight = 0; sendHeight();
  });
  new ResizeObserver(sendHeight).observe(document.querySelector('main'));
  window.addEventListener('pageshow', () => window.parent.postMessage({ channel, version: 1, type: 'ready' }, origin));
  window.parent.postMessage({ channel, version: 1, type: 'ready' }, origin);
})();
