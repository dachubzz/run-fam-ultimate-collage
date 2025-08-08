const CACHE='flappy-fam-v1';
const ASSETS=[
  './','./index.html','./style.css','./game.js','./manifest.webmanifest',
  './favicon.png','./og-image.jpg',
  './icon-64.png','./icon-128.png','./icon-192.png','./icon-256.png','./icon-512.png',
  './characters/chicken.png','./characters/frog.png','./characters/cat.png','./characters/duck.png','./characters/pig.png',
  './assets/sfx/quack.wav','./assets/sfx/oink.wav','./assets/sfx/ribbit.wav','./assets/sfx/boom.wav','./assets/sfx/bruh.wav','./assets/sfx/point.wav','./assets/sfx/flap.wav'
];
self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
});
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
});
self.addEventListener('fetch', e=>{
  e.respondWith(
    caches.match(e.request).then(resp=>resp || fetch(e.request).then(r=>{
      const copy=r.clone();
      caches.open(CACHE).then(c=>c.put(e.request, copy));
      return r;
    }).catch(()=>caches.match('./index.html')))
  );
});