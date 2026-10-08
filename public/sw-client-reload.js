(() => {
  self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
      if (!self.clients?.matchAll) return;

      const clients = await self.clients.matchAll({ type: "window" });
      await Promise.all(clients.map((client) => {
        try {
          const url = new URL(client.url);
          const studioShell = url.pathname === "/"
            || url.pathname === "/studio"
            || url.pathname.startsWith("/studio/")
            || url.pathname === "/workbench";
          if (url.origin === self.location.origin && studioShell && client.navigate) {
            return client.navigate(client.url);
          }
        } catch {
          // Ignore malformed client URLs; they should not block activation.
        }
        return undefined;
      }));
    })());
  });
})();
