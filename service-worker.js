const VERSION = "v10"; // cambia este valor cada vez que hagas cambios

self.addEventListener("install", () => {
  console.log("Service Worker instalado:", VERSION);
  self.skipWaiting();
});

self.addEventListener("activate", () => {
  console.log("Service Worker activado:", VERSION);
  self.clients.claim();
});
