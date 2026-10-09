/*
 * محمصة كراميش — PWA app-shell cache
 * الملفات العامة فقط تُخزّن للعمل دون اتصال.
 * طلبات API وصفحات الإدارة وتسجيل الدخول تبقى من الشبكة مباشرة.
 */
const CACHE_NAME = "kramish-pwa-commerce-v2-20261009";
const CACHE_PREFIX = "kramish-pwa-";
const APP_SHELL = [
    "./",
    "./index.html",
    "./style.css?v=9",
    "./script.js?v=9",
    "./manifest.webmanifest?v=1",
    "./icons/icon-192.png",
    "./icons/icon-512.png",
    "./icons/icon-maskable-512.png",
    "./icons/apple-touch-icon.png",
    "./icons/favicon-32.png"
];
const SCOPE_URL = new URL(self.registration.scope);
const INDEX_URL = new URL("./index.html", SCOPE_URL);
const CACHEABLE_URLS = new Set(
    APP_SHELL.map((path) => new URL(path, SCOPE_URL).href)
);
self.addEventListener("install", (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        // طلب الملفات من الشبكة لتجنّب تثبيت نسخة قديمة من CSS/JS.
        // إذا فقدنا أي صورة أيقونة، لا نُفشل تثبيت التطبيق بأكمله.
        await Promise.all(APP_SHELL.map(async (path) => {
            const request = new Request(new URL(path, SCOPE_URL), {
                cache: "reload"
            });
            try {
                const response = await fetch(request);
                if (response.ok && response.type !== "opaque") {
                    await cache.put(request, response);
                }
            } catch (error) {
                console.warn("PWA shell asset unavailable:", path, error);
            }
        }));
        await self.skipWaiting();
    })());
});
self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(
            keys
                .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
                .map((key) => caches.delete(key))
        );
        await self.clients.claim();
    })());
});
self.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.method !== "GET") return;
    const url = new URL(request.url);
    if (url.origin !== SCOPE_URL.origin) return;
    // مهم: لا نُخزّن الأسعار، بيانات الزبائن، الطلبات، أو جلسات الإدارة.
    if (url.pathname.startsWith("/api/")) return;
    // لا نتدخل إطلاقًا بصفحات الإدارة أو تسجيل الدخول.
    if (/(?:^|\/)(?:admin|login)\.html$/i.test(url.pathname)) return;
    const isHomeNavigation =
        request.mode === "navigate" &&
        (url.pathname === SCOPE_URL.pathname || url.pathname === INDEX_URL.pathname);
    if (isHomeNavigation) {
        event.respondWith((async () => {
            try {
                const response = await fetch(request, { cache: "no-store" });
                if (response.ok && response.type !== "opaque") {
                    const cache = await caches.open(CACHE_NAME);
                    await cache.put(INDEX_URL.href, response.clone());
                }
                return response;
            } catch (error) {
                const cached = await caches.match(INDEX_URL.href);
                if (cached) return cached;
                throw error;
            }
        })());
        return;
    }
    // نحتفظ فقط بملفات التطبيق العامة المحددة، وليس بكل طلب GET.
    if (!CACHEABLE_URLS.has(url.href)) return;
    event.respondWith((async () => {
        try {
            const response = await fetch(request, { cache: "no-store" });
            if (response.ok && response.type !== "opaque") {
                const cache = await caches.open(CACHE_NAME);
                await cache.put(request, response.clone());
            }
            return response;
        } catch (error) {
            const cached = await caches.match(request);
            if (cached) return cached;
            throw error;
        }
    })());
});
