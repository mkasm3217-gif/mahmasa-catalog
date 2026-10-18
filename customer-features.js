(() => {
    "use strict";
    const button = document.getElementById("enableOrderNotifications");
    const feedback = document.getElementById("orderNotificationsFeedback");
    if (!button || !feedback) return;

    function decodeBase64Url(value) {
        const padding = "=".repeat((4 - value.length % 4) % 4);
        const raw = atob(value.replace(/-/g, "+").replace(/_/g, "/") + padding);
        return Uint8Array.from(raw, (char) => char.charCodeAt(0));
    }
    async function getCustomerSubscription({ create = false } = {}) {
        if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
            throw new Error("متصفحك لا يدعم إشعارات الطلبات.");
        }
        if (Notification.permission === "denied") throw new Error("إشعارات الموقع محظورة من إعدادات المتصفح.");
        let registration = await navigator.serviceWorker.getRegistration("./");
        if (!registration && !create) return null;
        if (!registration) registration = await navigator.serviceWorker.register("./service-worker.js", { scope: "./" });
        registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();
        if (subscription || !create) return subscription;
        const keyInfo = await fetch(`${API_BASE_URL}/api/features/push-key`, { cache: "no-store" }).then(async (r) => {
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.message || "تعذر تحميل إعداد الإشعارات.");
            return d;
        });
        if (!keyInfo.enabled || !keyInfo.public_key) throw new Error("إشعارات المتصفح غير مهيأة على السيرفر بعد.");
        const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
        if (permission !== "granted") throw new Error("لم تسمح بإشعارات حالة الطلب.");
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeBase64Url(keyInfo.public_key) });
        return subscription;
    }

    async function linkSubscriptionToOrder(token, subscription) {
        if (!token || !subscription) return false;
        const response = await fetch(`${API_BASE_URL}/api/customer/features/push-subscription`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tracking_token: token, subscription: subscription.toJSON() }),
            cache: "no-store"
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || "تعذر ربط الإشعار بطلبك.");
        return true;
    }

    window.linkCustomerPushToOrder = async (token) => {
        try {
            const subscription = await getCustomerSubscription();
            if (!subscription) {
                button.disabled = false;
                button.textContent = "🔔 فعّل إشعارات حالة طلبك";
                return false;
            }
            await linkSubscriptionToOrder(token, subscription);
            button.disabled = true;
            button.textContent = "✅ الإشعارات مفعّلة لهذا الجهاز";
            feedback.textContent = "ربطنا طلبك الجديد تلقائيًا بإشعارات هذا الجهاز.";
            return true;
        } catch (error) {
            feedback.textContent = error.message || "تعذر ربط الإشعار بطلبك.";
            button.disabled = false;
            button.textContent = "🔔 فعّل إشعارات حالة طلبك";
            return false;
        }
    };

    button.addEventListener("click", async () => {
        button.disabled = true;
        feedback.textContent = "جاري تفعيل الإشعارات...";
        try {
            if (!lastOrderToken) throw new Error("لا يوجد طلب محفوظ لهذا الجهاز.");
            const subscription = await getCustomerSubscription({ create: true });
            const orderTokens = typeof window.getCustomerOrderTokensForPush === "function"
                ? window.getCustomerOrderTokensForPush()
                : [lastOrderToken];
            await Promise.all(orderTokens.map((token) => linkSubscriptionToOrder(token, subscription)));
            feedback.textContent = "تم تفعيل إشعارات هذا الجهاز. ربطنا طلباتك المحفوظة، وستُربط طلباتك الجديدة تلقائيًا.";
            button.textContent = "✅ الإشعارات مفعّلة لهذا الجهاز";
        } catch (error) {
            feedback.textContent = error.message || "تعذر تفعيل الإشعارات.";
            button.disabled = false;
        }
    });
})();
