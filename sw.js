/* =========================================================
   Service Worker – משחק זיכרון חנוכה
   מאפשר למשחק לעבוד בלי אינטרנט אחרי הטעינה הראשונה.

   אסטרטגיה:
   - בהתקנה: שמירת כל קבצי המשחק במטמון (precache).
   - דף ה-HTML: קודם רשת (כדי לקבל עדכונים), ואם אין חיבור – מהמטמון.
   - שאר הקבצים שלנו (אייקונים, מניפסט): קודם מטמון, ואם אין – רשת.
   - גופן Google Fonts: מוגש מהמטמון ומתעדכן ברקע. אם הוא לא נשמר,
     המשחק פשוט משתמש בגופן מערכת – בלי שום תקלה.

   כשמעדכנים קבצים במאגר – מעלים את מספר הגרסה ב-CACHE_VERSION.
   ========================================================= */

const CACHE_VERSION = 'v1';
const APP_CACHE = `hanukkah-app-${CACHE_VERSION}`;
const FONT_CACHE = 'hanukkah-fonts';

// נתיבים יחסיים – עובד גם בכתובת משנה של GitHub Pages (/hanukkah-memory-game/)
const APP_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

/* ---------- התקנה: שמירת קבצי המשחק ---------- */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then(cache => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

/* ---------- הפעלה: מחיקת מטמונים של גרסאות ישנות ---------- */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith('hanukkah-app-') && key !== APP_CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

/* ---------- בקשות רשת ---------- */
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // גופנים מ-Google: מטמון + עדכון ברקע
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(req, FONT_CACHE));
    return;
  }

  // כל שאר הבקשות החיצוניות – לא נוגעים
  if (url.origin !== self.location.origin) return;

  // דף המשחק עצמו: קודם רשת, ואם אין חיבור – מהמטמון
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
    return;
  }

  // אייקונים, מניפסט וכו': קודם מטמון
  event.respondWith(cacheFirst(req));
});

/** קודם רשת; בכישלון – המטמון (ובסוף index.html השמור) */
async function networkFirst(req) {
  const cache = await caches.open(APP_CACHE);
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) cache.put('./index.html', fresh.clone());
    return fresh;
  } catch (err) {
    return (await cache.match(req, { ignoreSearch: true }))
        || (await cache.match('./index.html'))
        || (await cache.match('./'))
        || Response.error();
  }
}

/** קודם מטמון; אם אין – רשת, ושמירה לפעם הבאה */
async function cacheFirst(req) {
  const cache = await caches.open(APP_CACHE);
  const cached = await cache.match(req, { ignoreSearch: true });
  if (cached) return cached;
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch (err) {
    return Response.error();
  }
}

/** מגיש מהמטמון מיד, ומעדכן את המטמון מהרשת ברקע */
async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then(res => {
      // תגובות opaque (cross-origin בלי CORS) הן בסדר לשמירה עבור גופנים
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  return cached || (await network) || Response.error();
}
