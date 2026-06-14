/* Talk2Me — Widget "messagerie entreprise" (Pascal 2026-06-09).
 * Usage (à coller sur le site du client) :
 *   <script src="https://talk2me.fr/biz-widget.js" data-key="LA_CLE" async></script>
 * Injecte une bulle flottante + un iframe vers /embed/biz/<clé>.
 */
(function () {
  var me = document.currentScript;
  var key = me && me.getAttribute('data-key');
  if (!key) { try { console.warn('[t2m] biz-widget : data-key manquant'); } catch (e) {} return; }
  var origin = (function () { try { return new URL(me.src).origin; } catch (e) { return ''; } })();
  var accent = (me.getAttribute('data-accent')) || '#7c3aed';
  if (document.getElementById('t2m-biz-root')) return;

  var root = document.createElement('div');
  root.id = 't2m-biz-root';
  root.style.cssText = 'position:fixed;z-index:2147483000;right:18px;bottom:18px;';

  var panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;right:18px;bottom:88px;width:370px;max-width:calc(100vw - 36px);height:560px;max-height:calc(100vh - 120px);border:0;border-radius:18px;overflow:hidden;box-shadow:0 16px 50px rgba(0,0,0,.28);background:#fff;display:none;';
  var iframe = document.createElement('iframe');
  iframe.style.cssText = 'width:100%;height:100%;border:0;';
  iframe.setAttribute('title', 'Chat');
  iframe.setAttribute('allow', 'clipboard-write');
  panel.appendChild(iframe);

  var btn = document.createElement('button');
  btn.setAttribute('aria-label', 'Ouvrir le chat');
  btn.style.cssText = 'width:60px;height:60px;border:0;border-radius:50%;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.25);background:' + accent + ';color:#fff;display:flex;align-items:center;justify-content:center;';
  btn.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

  var open = false;
  var loaded = false;
  function toggle() {
    open = !open;
    if (open && !loaded) { iframe.src = origin + '/embed/biz/' + encodeURIComponent(key); loaded = true; }
    panel.style.display = open ? 'block' : 'none';
    btn.innerHTML = open
      ? '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>'
      : '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  }
  btn.addEventListener('click', toggle);

  root.appendChild(btn);
  document.body.appendChild(panel);
  document.body.appendChild(root);
})();
