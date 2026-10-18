(() => {
    "use strict";

    const API = window.location.origin;
    const money = (value) => `${Math.round(Number(value) || 0).toLocaleString("en-US")} ل.س`;
    const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
    const el = (id) => document.getElementById(id);
    const json = (value) => JSON.stringify(value);

    async function api(path, options = {}) {
        const response = await fetch(`${API}${path}`, {
            ...options,
            credentials: "include",
            headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) }
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || "تعذر إكمال العملية");
        return data;
    }

    const nav = document.querySelector(".sidebar nav");
    const main = document.querySelector(".main-content");
    if (!nav || !main || el("featureToolsPage")) return;

    const featureNav = document.createElement("button");
    featureNav.type = "button";
    featureNav.className = "nav-item";
    featureNav.dataset.featurePage = "featureTools";
    featureNav.innerHTML = "<span>✦</span> الكوبونات والإشعارات";
    nav.insertBefore(featureNav, nav.querySelector('[data-page="settings"]'));

    const page = document.createElement("section");
    page.className = "page-section feature-tools-page";
    page.id = "featureToolsPage";
    page.innerHTML = `
      <header class="topbar"><div><span class="page-label">إضافات المحمصة</span><h1>الكوبونات والإشعارات</h1><p>إدارة كوبونات المنتجات والعروض وأرقام الموظفين.</p></div><button type="button" class="primary-button" id="featureRefresh">تحديث البيانات</button></header>
      <section class="content-card feature-panel coupon-admin-panel"><div class="card-header"><div><h2>الكوبونات والعروض المحددة بمدة</h2><p>تُطبّق كوبونات المنتجات والعروض الشاملة تلقائيًا في سلة الزبون حسب المنتجات وشروط العرض، دون كتابة أي رمز.</p><p class="coupon-delete-note">الكوبون المستخدم بطلب سابق لا يمكن حذفه حفاظًا على سجل الطلبات؛ أوقفه بدل حذفه.</p></div></div><form id="couponForm" class="feature-form feature-form-grid coupon-form-grid"><label>رمز الكوبون<input class="coupon-code-admin" name="code" required maxlength="40" placeholder="مثال: AUTUMN10" autocomplete="off"></label><label>اسم العرض<input name="title" required maxlength="120" placeholder="عرض الخريف"></label><label>نطاق الكوبون<select name="product_scope" id="couponScope"><option value="all">كل المنتجات</option><option value="include">منتجات أحددها فقط</option><option value="exclude">كل المنتجات ما عدا التي أحددها</option></select><small>تُطبّق الكوبونات المحددة لمنتجات فقط تلقائيًا على المنتجات المختارة.</small></label><label class="coupon-products-field">المنتجات التي يشملها أو يستثنيها الكوبون<select name="product_ids" id="couponProducts" multiple size="5" aria-label="اختيار منتجات الكوبون"></select><small>على الكمبيوتر، اضغط Ctrl أثناء الاختيار لتحديد أكثر من منتج. الاختيار مطلوب للنطاق المحدد أو الاستثناء.</small></label><label>نوع الخصم<select name="discount_type"><option value="percent">نسبة مئوية</option><option value="fixed">مبلغ ثابت</option></select></label><label>قيمة الخصم<input name="discount_value" type="number" min="1" step="1" required></label><label>أقل مجموع منتجات للاستفادة (ل.س)<input name="minimum_subtotal" type="number" min="0" step="1" value="0" aria-describedby="couponMinimumHelp"><small id="couponMinimumHelp">ضع 0 للسماح باستخدامه مهما كان المجموع.</small></label><label>يبدأ بتاريخ<input name="starts_at" type="text" inputmode="numeric" maxlength="10" pattern="[0-9]{4}/[0-9]{2}/[0-9]{2}" dir="ltr" placeholder="سنة/شهر/يوم" aria-label="تاريخ البداية بصيغة سنة/شهر/يوم" autocomplete="off"></label><label>ينتهي بتاريخ<input name="ends_at" type="text" inputmode="numeric" maxlength="10" pattern="[0-9]{4}/[0-9]{2}/[0-9]{2}" dir="ltr" placeholder="سنة/شهر/يوم" aria-label="تاريخ الانتهاء بصيغة سنة/شهر/يوم" autocomplete="off"></label><label>حد الاستخدام<input name="usage_limit" type="number" min="1" placeholder="فارغ = بلا حد"></label><button class="primary-button coupon-submit" type="submit">إضافة الكوبون</button></form><div id="couponsList" class="feature-table-wrap coupon-list-wrap"></div><p id="couponFeedback" class="feature-feedback" role="status"></p></section>
      <section class="content-card feature-panel"><div class="card-header"><div><h2>مشاركة الطلب عبر واتساب</h2><p>أضف أرقام الموظفين مع مفتاح البلد، رقم واحد بكل سطر. المشاركة يدوية من تفاصيل الطلب.</p></div></div><form id="staffForm" class="feature-inline"><label class="feature-wide">أرقام الموظفين<textarea id="staffNumbers" rows="4" placeholder="9639xxxxxxxx&#10;9639xxxxxxxx"></textarea></label><button class="primary-button" type="submit">حفظ الأرقام</button></form><p id="staffFeedback" class="feature-feedback" role="status"></p><div class="feature-push"><div><strong>إشعار المدير عند الطلب الجديد</strong><p>فعّل الإشعارات على هذا الجهاز. يحتاج السيرفر مفاتيح Web Push.</p></div><button type="button" id="enableAdminPush" class="primary-button" aria-pressed="false" data-enabled="0">جارٍ التحقق من حالة الإشعارات...</button></div><p id="pushFeedback" class="feature-feedback" role="status"></p></section>`;
    main.appendChild(page);

    // Add separators while typing so the date stays readable on mobile numeric keyboards.
    for (const input of el("couponForm").querySelectorAll('[name="starts_at"], [name="ends_at"]')) {
        input.addEventListener("input", () => {
            const digitsBeforeCursor = input.value.slice(0, input.selectionStart).replace(/\D/g, "").length;
            const digits = input.value.replace(/\D/g, "").slice(0, 8);
            const year = digits.slice(0, 4);
            const month = digits.slice(4, 6);
            const day = digits.slice(6, 8);
            input.value = year + (digits.length > 4 ? `/${month}` : "") + (digits.length > 6 ? `/${day}` : "");
            if (document.activeElement === input) {
                let seenDigits = 0;
                let caret = 0;
                while (caret < input.value.length && seenDigits < digitsBeforeCursor) {
                    if (/\d/.test(input.value[caret])) seenDigits += 1;
                    caret += 1;
                }
                input.setSelectionRange(caret, caret);
            }
        });
    }

    async function loadCouponProducts() {
        const products = await api("/api/products");
        el("couponProducts").innerHTML = products.map((product) => `<option value="${Number(product.id)}">${esc(product.name)}</option>`).join("");
    }

    async function loadCoupons() {
        const rows = await api("/api/admin/features/coupons");
        const displayDate = (value) => String(value || "").replace(/^(\d{4})-(\d{2})-(\d{2})/, "$1/$2/$3");
        el("couponsList").innerHTML = rows.length ? `<table class="coupon-admin-table"><thead><tr><th>الكوبون</th><th>المنتجات</th><th>الخصم</th><th>الحد الأدنى</th><th>المدة</th><th>الاستخدام</th><th>التحكم</th></tr></thead><tbody>${rows.map((coupon) => `<tr><td><strong class="coupon-code-label" dir="ltr">${esc(coupon.code)}</strong><span class="coupon-title-label">${esc(coupon.title)}</span></td><td>${coupon.product_scope === "all" ? "كل المنتجات" : `${coupon.product_scope === "exclude" ? "كل المنتجات عدا: " : "فقط: "}${esc(coupon.product_names || "لا توجد منتجات")}`}</td><td><strong>${coupon.discount_type === "percent" ? `${coupon.discount_value}%` : money(coupon.discount_value)}</strong></td><td>${Number(coupon.minimum_subtotal || 0) > 0 ? money(coupon.minimum_subtotal) : "بلا حد"}</td><td>${esc(displayDate(coupon.starts_at) || "دائم")}${coupon.ends_at ? ` — ${esc(displayDate(coupon.ends_at))}` : ""}</td><td>${coupon.usage_count}${coupon.usage_limit ? ` / ${coupon.usage_limit}` : ""}</td><td><div class="coupon-actions"><button class="coupon-toggle-button ${Number(coupon.active) ? "is-active" : "is-paused"}" type="button" data-toggle-coupon="${coupon.id}" data-active="${Number(coupon.active) ? 1 : 0}">${Number(coupon.active) ? "إيقاف" : "تفعيل"}</button><button class="coupon-delete-button" type="button" data-delete-coupon="${coupon.id}" data-code="${esc(coupon.code)}">حذف</button></div></td></tr>`).join("")}</tbody></table>` : `<div class="coupon-empty-state"><strong>ما في كوبونات مضافة لسه</strong><span>عبّي النموذج فوق واضغط «إضافة الكوبون».</span></div>`;
    }

    el("couponForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const values = new FormData(form);
        const dateValue = (name, end = false) => {
            const value = String(values.get(name) || "").trim();
            if (!value) return null;
            const match = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(value);
            if (!match) throw new Error("اكتب التاريخ بصيغة سنة/شهر/يوم، مثل 2026/10/18.");
            const [, year, month, day] = match;
            const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
            if (parsed.getUTCFullYear() !== Number(year) || parsed.getUTCMonth() + 1 !== Number(month) || parsed.getUTCDate() !== Number(day)) {
                throw new Error("التاريخ غير صحيح. استخدم صيغة سنة/شهر/يوم.");
            }
            return `${year}-${month}-${day} ${end ? "23:59:59" : "00:00:00"}`;
        };
        try {
            const productIds = Array.from(el("couponProducts").selectedOptions, (option) => Number(option.value));
            await api("/api/admin/features/coupons", { method: "POST", body: json({
                code: values.get("code"), title: values.get("title"), product_scope: values.get("product_scope"), product_ids: productIds,
                discount_type: values.get("discount_type"), discount_value: Number(values.get("discount_value")),
                minimum_subtotal: Number(values.get("minimum_subtotal") || 0), starts_at: dateValue("starts_at"),
                ends_at: dateValue("ends_at", true), usage_limit: values.get("usage_limit") || null
            }) });
            form.reset();
            el("couponFeedback").textContent = "تمت إضافة العرض.";
            await loadCoupons();
        } catch (error) { el("couponFeedback").textContent = error.message; }
    });

    el("couponsList").addEventListener("click", async (event) => {
        const deleteButton = event.target.closest("[data-delete-coupon]");
        if (deleteButton) {
            if (!confirm(`تحذف الكوبون ${deleteButton.dataset.code} نهائيًا؟ الكوبون المستخدم في طلب سابق لا يمكن حذفه حفاظًا على سجل الطلبات.`)) return;
            try {
                await api(`/api/admin/features/coupons/${deleteButton.dataset.deleteCoupon}`, { method: "DELETE" });
                el("couponFeedback").textContent = `تم حذف الكوبون ${deleteButton.dataset.code}.`;
                await loadCoupons();
            } catch (error) { el("couponFeedback").textContent = error.message; }
            return;
        }
        const toggleButton = event.target.closest("[data-toggle-coupon]");
        if (!toggleButton) return;
        try {
            await api(`/api/admin/features/coupons/${toggleButton.dataset.toggleCoupon}`, { method: "PATCH", body: json({ active: toggleButton.dataset.active !== "1" }) });
            await loadCoupons();
        } catch (error) { el("couponFeedback").textContent = error.message; }
    });

    async function loadContacts() {
        const data = await api("/api/admin/features/contacts");
        el("staffNumbers").value = data.numbers.join("\n");
    }
    el("staffForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const numbers = el("staffNumbers").value.split(/[\s,;]+/).filter(Boolean);
        try {
            const saved = await api("/api/admin/features/contacts", { method: "PUT", body: json({ numbers }) });
            el("staffNumbers").value = saved.numbers.join("\n");
            el("staffFeedback").textContent = "تم حفظ أرقام الموظفين.";
        } catch (error) { el("staffFeedback").textContent = error.message; }
    });

    function decodeBase64Url(value) {
        const padding = "=".repeat((4 - value.length % 4) % 4);
        const raw = atob(value.replace(/-/g, "+").replace(/_/g, "/") + padding);
        return Uint8Array.from(raw, (char) => char.charCodeAt(0));
    }
    async function refreshAdminPushState() {
        const button = el("enableAdminPush");
        if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
            button.dataset.enabled = "0";
            button.setAttribute("aria-pressed", "false");
            button.textContent = "الإشعارات غير مدعومة على هذا المتصفح";
            button.disabled = true;
            return null;
        }
        button.disabled = true;
        try {
            const registration = await navigator.serviceWorker.getRegistration("/");
            const subscription = registration ? await registration.pushManager.getSubscription() : null;
            const enabled = Notification.permission === "granted" && Boolean(subscription);
            button.dataset.enabled = enabled ? "1" : "0";
            button.setAttribute("aria-pressed", String(enabled));
            button.textContent = enabled ? "تعطيل إشعارات هذا الجهاز" : "تفعيل إشعارات هذا الجهاز";
            return subscription;
        } catch {
            button.dataset.enabled = "0";
            button.setAttribute("aria-pressed", "false");
            button.textContent = "تفعيل إشعارات هذا الجهاز";
            return null;
        } finally {
            button.disabled = false;
        }
    }

    async function enableAdminPush() {
        const feedback = el("pushFeedback");
        const button = el("enableAdminPush");
        try {
            button.disabled = true;
            if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) throw new Error("هذا المتصفح لا يدعم إشعارات الويب.");
            if (Notification.permission === "denied") throw new Error("إشعارات الموقع محظورة من إعدادات المتصفح.");
            const keyInfo = await api("/api/features/push-key");
            if (!keyInfo.enabled || !keyInfo.public_key) throw new Error("مفاتيح الإشعارات غير مضبوطة على السيرفر بعد.");
            const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
            if (permission !== "granted") throw new Error("لم تسمح بالإشعارات.");
            await navigator.serviceWorker.register("/service-worker.js", { scope: "/" });
            const registration = await navigator.serviceWorker.ready;
            let subscription = await registration.pushManager.getSubscription();
            if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeBase64Url(keyInfo.public_key) });
            await api("/api/admin/features/push-subscription", { method: "POST", body: json({ subscription: subscription.toJSON() }) });
            feedback.textContent = "تم تفعيل إشعارات الطلبات على هذا الجهاز.";
        } catch (error) { feedback.textContent = error.message || "تعذر تفعيل الإشعارات."; }
        finally { await refreshAdminPushState(); }
    }
    async function disableAdminPush() {
        const feedback = el("pushFeedback");
        const button = el("enableAdminPush");
        try {
            button.disabled = true;
            const registration = await navigator.serviceWorker.getRegistration("/");
            const subscription = registration ? await registration.pushManager.getSubscription() : null;
            if (!subscription) {
                feedback.textContent = "الإشعارات غير مفعّلة على هذا الجهاز.";
                return;
            }
            const savedSubscription = subscription.toJSON();
            await api("/api/admin/features/push-subscription", { method: "DELETE", body: json({ endpoint: subscription.endpoint }) });
            let unsubscribed = false;
            try { unsubscribed = await subscription.unsubscribe(); } catch {}
            if (!unsubscribed) {
                await api("/api/admin/features/push-subscription", { method: "POST", body: json({ subscription: savedSubscription }) });
                throw new Error("تعذر إيقاف إشعارات المتصفح؛ بقي الاشتراك محفوظًا.");
            }
            feedback.textContent = "تم إيقاف إشعارات الطلبات على هذا الجهاز.";
        } catch (error) { feedback.textContent = error.message || "تعذر إيقاف الإشعارات."; }
        finally { await refreshAdminPushState(); }
    }
    el("enableAdminPush").addEventListener("click", () => {
        if (el("enableAdminPush").dataset.enabled === "1") disableAdminPush();
        else enableAdminPush();
    });
    void refreshAdminPushState();
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) void refreshAdminPushState();
    });

    function addWhatsAppActions() {
        const body = el("orderDetailsBody");
        if (!body || !el("orderStatusForm") || body.querySelector(".feature-whatsapp-actions")) return;
        const host = document.createElement("section");
        host.className = "feature-whatsapp-actions";
        host.innerHTML = "<h3>مشاركة الطلب مع الموظفين</h3><p>تُفتح رسالة واتساب جاهزة؛ اختر الموظف المتاح وأرسلها يدويًا. رابط الاستلام داخل الرسالة يثبت أول موظف يضغطه.</p><div class=\"feature-wa-links\">جاري تجهيز الروابط...</div>";
        body.appendChild(host);
        const orderId = typeof openAdminOrderId !== "undefined" ? openAdminOrderId : null;
        if (!orderId) return;
        api(`/api/admin/features/orders/${orderId}/whatsapp`).then((data) => {
            const links = host.querySelector(".feature-wa-links");
            if (!data.numbers.length) { links.textContent = "أضف أرقام الموظفين من صفحة الكوبونات والإشعارات."; return; }
            links.replaceChildren();
            data.numbers.forEach((number, index) => {
                const link = document.createElement("a");
                link.target = "_blank";
                link.rel = "noopener noreferrer";
                link.href = `https://wa.me/${number}?text=${encodeURIComponent(data.message)}`;
                link.textContent = `فتح واتساب للموظف ${index + 1}`;
                links.appendChild(link);
            });
        }).catch((error) => { host.querySelector(".feature-wa-links").textContent = error.message; });
    }
    const orderBody = el("orderDetailsBody");
    if (orderBody) new MutationObserver(addWhatsAppActions).observe(orderBody, { childList: true, subtree: true });

    async function loadAll() {
        const results = await Promise.allSettled([loadCouponProducts(), loadCoupons(), loadContacts()]);
        const failed = results.filter((result) => result.status === "rejected").map((result) => result.reason.message);
        if (failed.length) el("couponFeedback").textContent = failed.join(" — ");
    }
    function showFeaturePage() {
        document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
        document.querySelectorAll(".page-section").forEach((section) => section.classList.remove("active"));
        featureNav.classList.add("active");
        page.classList.add("active");
        window.scrollTo({ top: 0, behavior: "smooth" });
        loadAll();
    }
    featureNav.addEventListener("click", showFeaturePage);
    nav.querySelectorAll(".nav-item:not([data-feature-page])").forEach((item) => item.addEventListener("click", () => page.classList.remove("active")));
    el("featureRefresh").addEventListener("click", loadAll);
})();
