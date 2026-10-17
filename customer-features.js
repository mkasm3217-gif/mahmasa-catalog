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
    button.addEventListener("click", async () => {
        button.disabled = true;
        feedback.textContent = "جاري تفعيل الإشعارات...";
        try {
            if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) throw new Error("متصفحك لا يدعم إشعارات الطلبات.");
            if (!lastOrderToken) throw new Error("لا يوجد طلب محفوظ لهذا الجهاز.");
            if (Notification.permission === "denied") throw new Error("إشعارات الموقع محظورة من إعدادات المتصفح.");
            const keyInfo = await fetch(`${API_BASE_URL}/api/features/push-key`, { cache: "no-store" }).then(async (r) => {
                const d = await r.json().catch(() => ({}));
                if (!r.ok) throw new Error(d.message || "تعذر تحميل إعداد الإشعارات.");
                return d;
            });
            if (!keyInfo.enabled || !keyInfo.public_key) throw new Error("إشعارات المتصفح غير مهيأة على السيرفر بعد.");
            const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
            if (permission !== "granted") throw new Error("لم تسمح بإشعارات حالة الطلب.");
            const registration = await navigator.serviceWorker.register("./service-worker.js", { scope: "./" });
            let subscription = await registration.pushManager.getSubscription();
            if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeBase64Url(keyInfo.public_key) });
            const response = await fetch(`${API_BASE_URL}/api/customer/features/push-subscription`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tracking_token: lastOrderToken, subscription: subscription.toJSON() }),
                cache: "no-store"
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.message || "تعذر ربط الإشعار بطلبك.");
            feedback.textContent = "تم تفعيل إشعارات هذا الطلب على جهازك.";
            button.textContent = "✅ الإشعارات مفعّلة";
        } catch (error) {
            feedback.textContent = error.message || "تعذر تفعيل الإشعارات.";
            button.disabled = false;
        }
    });
})();
