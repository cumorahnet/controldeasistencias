(() => {
  "use strict";
  let ready = false;
  let failure = "";
  const render = () => {
    if (ready || !failure || !document.body) return;
    for (const id of ["conn-text", "conn-text-mini"]) {
      const label = document.getElementById(id);
      if (label) label.textContent = "No se pudo iniciar";
    }
    let notice = document.getElementById("startup-error");
    if (!notice) {
      notice = document.createElement("div");
      notice.id = "startup-error";
      notice.setAttribute("role", "alert");
      notice.style.cssText = "position:fixed;inset:12px 12px auto;z-index:10000;padding:16px;background:#fff7ed;color:#7c2d12;border:2px solid #fb923c;border-radius:12px;font:16px/1.5 sans-serif";
      document.body.prepend(notice);
    }
    notice.replaceChildren();
    const message = document.createElement("p");
    message.textContent = failure;
    const retry = document.createElement("button");
    retry.type = "button"; retry.textContent = "Reintentar";
    retry.style.cssText = "padding:8px 16px;margin-top:8px;border:1px solid currentColor;border-radius:8px;cursor:pointer";
    retry.addEventListener("click", () => location.reload());
    notice.append(message, retry);
  };
  const fail = (message) => {if (!ready) {failure = message; render();}};
  const timer = setTimeout(() => fail(navigator.onLine === false
    ? "No hay conexión a Internet. Firebase necesita conexión para iniciar; conéctese y pulse Reintentar."
    : "La aplicación no terminó de cargar. Compruebe la conexión y que el servidor local sirva app.js y sus dependencias; después pulse Reintentar."), 20000);
  window.AppStartup = {
    ready() {ready = true; clearTimeout(timer); document.getElementById("startup-error")?.remove();},
  };
  window.addEventListener("error", (event) => {
    if (event.target?.id === "app-runtime") fail("No se pudo cargar la aplicación o sus dependencias de Firebase. Compruebe la conexión y la dirección del servidor local; después pulse Reintentar.");
    else if (event.error) fail(`La aplicación no pudo iniciar: ${event.message || "error de JavaScript"}. Recargue la página; si persiste, comparta este mensaje.`);
  }, true);
  document.addEventListener("DOMContentLoaded", () => {
    const version = document.title.match(/VERSI[ÓO]N\s+(\d+(?:\.\d+)+)/i)?.[1];
    const versionButton = document.getElementById("btn-super-access");
    if (version && versionButton) {
      versionButton.textContent = `VERSIÓN ${version}`;
      versionButton.setAttribute("aria-label", `Versión ${version}`);
    }
    render();
  });
  if (location.protocol === "file:") {
    clearTimeout(timer);
    fail("La aplicación no puede iniciarse abriendo index.html como archivo. Ábrala mediante un servidor local HTTP (http://localhost:…) o use el sitio publicado.");
  }
})();
