/* Register the offline service worker (AGRI DETECT). */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("service-worker.js", { scope: "./" }).catch(function () {});
  });
}