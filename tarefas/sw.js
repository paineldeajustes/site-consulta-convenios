const CACHE = "clareza-shell-v7";
const ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg", "./settings.css", "./settings.js"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith("clareza-shell-") && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(req).then(response => {
      if (response.ok && (req.mode === "navigate" || url.pathname.endsWith(".html") || url.pathname.endsWith(".webmanifest") || url.pathname.endsWith(".svg") || url.pathname.endsWith(".js") || url.pathname.endsWith(".css"))) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(req, copy)).catch(() => {});
      }
      return response;
    }).catch(() => caches.match(req).then(cached => {
      if (cached) return cached;
      if (req.mode === "navigate") return caches.match("./index.html");
      return Response.error();
    }))
  );
});

self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch { data = { body: event.data ? event.data.text() : "" }; }
  const title = data.title || "Lembrete do Clareza";
  const options = {
    body: data.body || "Você tem uma tarefa para revisar.",
    icon: "./icon.svg",
    badge: "./icon.svg",
    tag: data.tag || "clareza-lembrete",
    renotify: true,
    data: { url: data.url || new URL("./", self.registration.scope).href, taskId: data.taskId || null }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : new URL("./", self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ("focus" in client && new URL(client.url).origin === new URL(target).origin) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
