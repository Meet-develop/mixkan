self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => {
      if (event.request.mode === "navigate") {
        return new Response("Offline", {
          status: 503,
          statusText: "Offline",
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }

      return Response.error();
    })
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "mixkan";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/pwa-icon-192.png",
      badge: "/pwa-icon-192.png",
      tag: payload.tag,
      renotify: Boolean(payload.tag),
      data: { url: payload.url || "/notifications" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = new URL(
    (event.notification.data && event.notification.data.url) || "/notifications",
    self.location.origin
  ).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (new URL(client.url).origin === self.location.origin && "focus" in client) {
            return client.focus().then((focused) =>
              "navigate" in focused ? focused.navigate(targetUrl) : focused
            );
          }
        }
        return self.clients.openWindow(targetUrl);
      })
  );
});
