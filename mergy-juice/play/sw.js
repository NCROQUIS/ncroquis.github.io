const CACHE='mergy-juice-v40';
const FILES=['./','./index.html','./style.css','./game.js','./juices.json','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png','./Resource/Shadow.png','./Resource/Back01.png','./Resource/Back01_1.png','./Resource/Table01.png','./Resource/UI/Popup01.png','./Resource/UI/Popup02.png','./Resource/UI/Button01.png','./Resource/UI/Button02.png','./Resource/UI/Button_Close.png','./Resource/UI/Button_Setting.png','./Resource/UI/SB%20%E1%84%8B%E1%85%A5%E1%84%80%E1%85%B3%E1%84%85%E1%85%A9OTF%20M.woff2'];
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);await cache.addAll(FILES);
 const response=await fetch('./juices.json',{cache:'no-store'}),definitions=await response.json();
 await cache.addAll(definitions.filter(d=>d.src).map(d=>d.src));await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const keys=await caches.keys();await Promise.all(keys.filter(key=>key.startsWith('mergy-juice-')&&key!==CACHE).map(key=>caches.delete(key)));await self.clients.claim();
})()));
// Always check the current files online; keep the last good response for offline play.
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  try{const response=await fetch(event.request,{cache:'no-store',signal:AbortSignal.timeout(5000)});
   if(response.ok)await cache.put(event.request,response.clone());return response;
  }catch(error){const cached=await cache.match(event.request);if(cached)return cached;throw error;}
 })());
});
