// Service Worker der Mitglieder-App: nimmt Push-Nachrichten entgegen und
// zeigt sie als System-Benachrichtigung an. Klick öffnet die passende Seite.

self.addEventListener("push", (event) => {
  let daten = {};
  try {
    daten = event.data ? event.data.json() : {};
  } catch (e) {
    daten = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(daten.title || "TSG 08 Roth Dart", {
      body: daten.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: daten.url || "/mitglieder" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/mitglieder";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((liste) => {
      for (const fenster of liste) {
        if ("focus" in fenster) {
          fenster.navigate(url);
          return fenster.focus();
        }
      }
      return clients.openWindow(url);
    }),
  );
});
