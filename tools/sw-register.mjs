// The <script> every lane's index.html carries to register the site's one
// service worker (dist/sw.js, written by build-shell.mjs). Shared by
// build-desktop.mjs and build-mobile.mjs (and so /t/, which is /m/'s page),
// because the two halves below only work if every lane does them the same way.
//
//   1. Register at once, not on `load`. The worker precaches only the shell
//      and caches everything else as it is used; it claims the page as soon
//      as it activates, so the sooner it is up, the more of THIS load it
//      sees. Flutter's loader starts main.dart.wasm and the engine's .wasm
//      after its bootstrap script runs — the bulk of the lane.
//   2. Whatever the page fetched before the worker took over never passed
//      through it. Once the page has loaded (and again after Flutter's first
//      frame), hand the worker the list of what was fetched; it stores
//      whichever of those it does not have yet. Without this the first
//      reload would download the whole lane a second time — exactly the
//      13.8 MB /m/ reload tools/perf.mjs measured (Procress 19 part 5).
//
// `swUrl` and `scope` are relative to the page's base URL: '../sw.js' from
// /d/, and from /m/ and /t/, whose <base href> is /m/.
export const swRegisterScript = (swUrl = '../sw.js', scope = '../') => `<script>
  // The site's service worker — see tools/sw-register.mjs for why it is
  // registered this early and why the page reports what it loaded.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('${swUrl}', { scope: '${scope}' }).then(function () {
      return navigator.serviceWorker.ready;
    }).then(function (reg) {
      function report() {
        if (!reg.active) return;
        var urls = performance.getEntriesByType('resource').map(function (e) { return e.name; });
        urls.push(location.href);
        reg.active.postMessage({ type: 'cache-loaded', urls: urls });
      }
      if (document.readyState === 'complete') report(); else addEventListener('load', report);
      addEventListener('flutter-first-frame', report);
    }).catch(function (e) { console.warn('[sw]', e); });
  }
</script>`;
