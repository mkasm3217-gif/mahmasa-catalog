"use strict";

// Isolated add-on routes for loyalty, campaigns, reports, WhatsApp sharing and push.
// The core order routes call the returned lifecycle hooks after their transaction commits.
const crypto = require("node:crypto");

function createFeatures(app, { dbp, pool, requireAdmin, webpush }) {
    const vapidPublic = String(process.env.VAPID_PUBLIC_KEY || "").trim();
    const vapidPrivate = String(process.env.VAPID_PRIVATE_KEY || "").trim();
    const vapidSubject = String(process.env.VAPID_SUBJECT || "").trim();
    const pushReady = Boolean(webpush && vapidPublic && vapidPrivate && vapidSubject);
    if (pushReady) webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

    const cleanPhone = (value) => String(value || "").replace(/\D/g, "").slice(0, 20);
    const storedArray = (value) => {
        if (Array.isArray(value)) return value;
        if (typeof value !== "string" || !value) return [];
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    };
    const cleanText = (value, max = 255) => {
        const result = String(value ?? "").trim();
        return result ? result.slice(0, max) : null;
    };
    const money = (value) => Math.round(Number(value) || 0);
    const endpointHash = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
    const errorResponse = (res, error, fallback) => {
        console.error(error);
        return res.status(error.status || 500).json({ message: error.status ? error.message : fallback });
    };

    async function pushToRows(rows, payload) {
        if (!pushReady || !rows.length) return;
        await Promise.all(rows.map(async (row) => {
            try {
                const subscription = {
                    endpoint: row.endpoint,
                    keys: { p256dh: row.p256dh, auth: row.auth }
                };
                await webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 60 * 60 });
                await dbp.query("UPDATE admin_push_subscriptions SET last_success_at = CURRENT_TIMESTAMP WHERE id = ?", [row.id]);
            } catch (error) {
                if (error.statusCode === 404 || error.statusCode === 410) {
                    await dbp.query("DELETE FROM admin_push_subscriptions WHERE id = ?", [row.id]);
                } else {
                    console.error("Admin push delivery failed:", error.statusCode || error.message);
                }
            }
        }));
    }

    async function pushToCustomer(orderId, payload) {
        if (!pushReady) return;
        const [rows] = await dbp.query("SELECT id, endpoint, p256dh, auth FROM customer_push_subscriptions WHERE order_id = ?", [orderId]);
        await Promise.all(rows.map(async (row) => {
            try {
                await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, JSON.stringify(payload), { TTL: 60 * 60 });
                await dbp.query("UPDATE customer_push_subscriptions SET last_success_at = CURRENT_TIMESTAMP WHERE id = ?", [row.id]);
            } catch (error) {
                if (error.statusCode === 404 || error.statusCode === 410) {
                    await dbp.query("DELETE FROM customer_push_subscriptions WHERE id = ?", [row.id]);
                } else console.error("Customer push delivery failed:", error.statusCode || error.message);
            }
        }));
    }

    async function getOrder(orderId) {
        const [rows] = await dbp.query("SELECT id, order_code, tracking_token, customer_name, customer_phone, fulfillment_type, delivery_address, delivery_lat, delivery_lng, status, total, delivery_fee, staff_claim_token, staff_claimed_by FROM orders WHERE id = ? LIMIT 1", [orderId]);
        return rows[0] || null;
    }

    async function onOrderCreated(orderId) {
        const order = await getOrder(orderId);
        if (!order) return;
        const [rows] = await dbp.query("SELECT id, endpoint, p256dh, auth FROM admin_push_subscriptions");
        await pushToRows(rows, {
            title: "طلب جديد من المحمصة",
            body: `${order.order_code} — ${order.customer_name} — ${money(order.total).toLocaleString("en-US")} ل.س`,
            url: "/admin.html",
            tag: `order-${order.id}`
        });
    }

    async function onOrderStatusChanged(orderId, status) {
        const order = await getOrder(orderId);
        if (!order) return;
        if (status === "preparing" || status === "ready" || status === "out_for_delivery" || status === "completed") {
            await pushToCustomer(orderId, {
                title: "تحديث طلبك من المحمصة",
                body: status === "preparing" ? "بدأنا تجهيز طلبك." : status === "ready" ? "طلبك جاهز للاستلام من المحمصة." : status === "out_for_delivery" ? "خرج طلبك للتوصيل." : "تم تسليم طلبك. شكرًا لطلبك!",
                url: "/",
                tag: `order-status-${order.id}-${status}`
            });
        }
    }

    app.get("/api/features/push-key", (_req, res) => {
        res.json({ enabled: pushReady, public_key: pushReady ? vapidPublic : null });
    });

    app.post("/api/admin/features/push-subscription", requireAdmin, async (req, res) => {
        if (!pushReady) return res.status(503).json({ message: "إعداد إشعارات المتصفح غير مكتمل على السيرفر" });
        const sub = req.body?.subscription;
        if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return res.status(400).json({ message: "بيانات الإشعار غير مكتملة" });
        try {
            const hash = endpointHash(sub.endpoint);
            await dbp.query(`INSERT INTO admin_push_subscriptions (endpoint_hash, endpoint, p256dh, auth)
                VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE endpoint = VALUES(endpoint), p256dh = VALUES(p256dh), auth = VALUES(auth), updated_at = CURRENT_TIMESTAMP`,
                [hash, sub.endpoint, sub.keys.p256dh, sub.keys.auth]);
            res.json({ message: "تم تفعيل إشعارات الطلبات على هذا الجهاز" });
        } catch (error) { errorResponse(res, error, "تعذر حفظ إعداد الإشعار"); }
    });

    app.delete("/api/admin/features/push-subscription", requireAdmin, async (req, res) => {
        const endpoint = String(req.body?.endpoint || "").trim();
        if (!endpoint || endpoint.length > 4096) return res.status(400).json({ message: "بيانات الجهاز غير صحيحة" });
        try {
            const hash = endpointHash(endpoint);
            await dbp.query("DELETE FROM admin_push_subscriptions WHERE endpoint_hash = ?", [hash]);
            res.json({ message: "تم إيقاف إشعارات هذا الجهاز" });
        } catch (error) { errorResponse(res, error, "تعذر إيقاف إشعارات هذا الجهاز"); }
    });

    app.post("/api/customer/features/push-subscription", async (req, res) => {
        if (!pushReady) return res.status(503).json({ message: "إعداد إشعارات المتصفح غير مكتمل على السيرفر" });
        const token = String(req.body?.tracking_token || "").trim();
        const sub = req.body?.subscription;
        if (!/^[0-9a-f-]{36}$/i.test(token) || !sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return res.status(400).json({ message: "بيانات الإشعار غير صحيحة" });
        try {
            const [orders] = await dbp.query("SELECT id FROM orders WHERE tracking_token = ? LIMIT 1", [token]);
            if (!orders.length) return res.status(404).json({ message: "الطلب غير موجود" });
            const hash = endpointHash(sub.endpoint);
            await dbp.query(`INSERT INTO customer_push_subscriptions (order_id, endpoint_hash, endpoint, p256dh, auth)
                VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE order_id = VALUES(order_id), endpoint = VALUES(endpoint), p256dh = VALUES(p256dh), auth = VALUES(auth)`,
                [orders[0].id, hash, sub.endpoint, sub.keys.p256dh, sub.keys.auth]);
            res.json({ message: "تم تفعيل إشعارات حالة الطلب" });
        } catch (error) { errorResponse(res, error, "تعذر حفظ إعداد الإشعار"); }
    });

    app.post("/api/orders/staff-claim", async (req, res) => {
        const token = String(req.body?.token || "").trim();
        const claimant = cleanText(req.body?.name, 120);
        if (!/^[0-9a-f-]{36}$/i.test(token) || !claimant || claimant.length < 2) return res.status(400).json({ message: "اكتب اسمك وتأكد من رابط استلام الطلب" });
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            const [orders] = await connection.query("SELECT id, order_code, status, staff_claimed_by FROM orders WHERE staff_claim_token = ? FOR UPDATE", [token]);
            if (!orders.length) { await connection.rollback(); return res.status(404).json({ message: "رابط استلام الطلب غير صالح" }); }
            const order = orders[0];
            if (order.status !== "pending" && order.status !== "preparing") { await connection.rollback(); return res.status(409).json({ message: "لم يعد هذا الطلب متاحًا للاستلام" }); }
            if (order.staff_claimed_by) { await connection.rollback(); return res.status(409).json({ message: `سبقك ${order.staff_claimed_by} واستلم الطلب ${order.order_code}` }); }
            await connection.query("UPDATE orders SET staff_claimed_by = ?, staff_claimed_at = CURRENT_TIMESTAMP WHERE id = ?", [claimant, order.id]);
            await connection.commit();
            res.json({ message: `تم تسجيلك لاستلام الطلب ${order.order_code}`, order_code: order.order_code, claimed_by: claimant });
        } catch (error) {
            try { await connection.rollback(); } catch {}
            errorResponse(res, error, "تعذر استلام الطلب");
        } finally { connection.release(); }
    });

    app.get("/api/admin/features/contacts", requireAdmin, async (_req, res) => {
        try {
            const [rows] = await dbp.query("SELECT staff_whatsapp_numbers FROM feature_settings WHERE id = 1 LIMIT 1");
            res.set("Cache-Control", "no-store").json({ numbers: storedArray(rows[0]?.staff_whatsapp_numbers) });
        } catch (error) { errorResponse(res, error, "تعذر تحميل أرقام الموظفين"); }
    });

    app.put("/api/admin/features/contacts", requireAdmin, async (req, res) => {
        const numbers = [...new Set((Array.isArray(req.body?.numbers) ? req.body.numbers : [])
            .map(cleanPhone).filter((n) => n.length >= 8 && n.length <= 15))].slice(0, 20);
        try {
            await dbp.query("INSERT INTO feature_settings (id, staff_whatsapp_numbers) VALUES (1, ?) ON DUPLICATE KEY UPDATE staff_whatsapp_numbers = VALUES(staff_whatsapp_numbers)", [JSON.stringify(numbers)]);
            res.json({ message: "تم حفظ أرقام الموظفين", numbers });
        } catch (error) { errorResponse(res, error, "تعذر حفظ أرقام الموظفين"); }
    });

    app.get("/api/admin/features/orders/:id/whatsapp", requireAdmin, async (req, res) => {
        try {
            let order = await getOrder(Number(req.params.id));
            if (!order) return res.status(404).json({ message: "الطلب غير موجود" });
            if (!order.staff_claim_token && !order.staff_claimed_by && ["pending", "preparing"].includes(order.status)) {
                await dbp.query("UPDATE orders SET staff_claim_token = ? WHERE id = ? AND staff_claim_token IS NULL", [crypto.randomUUID(), order.id]);
                order = await getOrder(order.id);
            }
            const [items] = await dbp.query("SELECT product_name, quantity, weight_grams, unit_label, line_total FROM order_items WHERE order_id = ? ORDER BY id", [order.id]);
            const [settings] = await dbp.query("SELECT staff_whatsapp_numbers FROM feature_settings WHERE id = 1 LIMIT 1");
            const numbers = storedArray(settings[0]?.staff_whatsapp_numbers);
            const lines = items.map((item) => `• ${item.product_name} × ${item.quantity ?? `${item.weight_grams || 0} غ`} — ${money(item.line_total).toLocaleString("en-US")} ل.س`);
            const claimUrl = order.staff_claim_token && !order.staff_claimed_by
                ? `${req.protocol}://${req.get("host")}/claim.html?token=${encodeURIComponent(order.staff_claim_token)}`
                : null;
            const deliveryLines = order.fulfillment_type === "delivery"
                ? [`عنوان التوصيل: ${order.delivery_address || "لم يضف الزبون عنوانًا"}`, ...(order.delivery_lat !== null && order.delivery_lng !== null ? [`الموقع: https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${order.delivery_lat},${order.delivery_lng}`)}`] : [])]
                : [];
            const message = [`طلب ${order.order_code}`, `الزبون: ${order.customer_name} (${order.customer_phone})`, `طريقة الاستلام: ${order.fulfillment_type === "delivery" ? "توصيل" : "استلام"}`, ...deliveryLines, ...lines, `الإجمالي: ${money(order.total).toLocaleString("en-US")} ل.س`, ...(order.staff_claimed_by ? [`استلمه: ${order.staff_claimed_by}`] : []), ...(claimUrl ? [`استلام تجهيز الطلب (الأسبق يثبته): ${claimUrl}`] : [])].join("\n");
            res.set("Cache-Control", "no-store").json({ numbers, message, claim_url: claimUrl, claimed_by: order.staff_claimed_by });
        } catch (error) { errorResponse(res, error, "تعذر تجهيز رسالة واتساب"); }
    });

    app.get("/api/coupons/active", async (_req, res) => {
        try {
            const [rows] = await dbp.query("SELECT id, code, title, discount_type, discount_value, minimum_subtotal, product_scope FROM coupons WHERE active = 1 AND (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP) AND (ends_at IS NULL OR ends_at >= CURRENT_TIMESTAMP) AND (usage_limit IS NULL OR usage_count < usage_limit) ORDER BY id DESC");
            const ids = rows.map((coupon) => Number(coupon.id));
            const productIdsByCoupon = new Map(ids.map((id) => [id, []]));
            if (ids.length) {
                const placeholders = ids.map(() => "?").join(",");
                const [rules] = await dbp.query(`SELECT coupon_id, product_id FROM coupon_products WHERE coupon_id IN (${placeholders})`, ids);
                rules.forEach((rule) => productIdsByCoupon.get(Number(rule.coupon_id))?.push(Number(rule.product_id)));
            }
            res.set("Cache-Control", "no-store").json(rows.map((coupon) => ({ ...coupon, product_ids: productIdsByCoupon.get(Number(coupon.id)) || [] })));
        } catch (error) { errorResponse(res, error, "تعذر تحميل العروض"); }
    });

    app.get("/api/admin/features/coupons", requireAdmin, async (_req, res) => {
        try {
            const [rows] = await dbp.query("SELECT c.id, c.code, c.title, c.discount_type, c.discount_value, c.product_scope, c.minimum_subtotal, c.starts_at, c.ends_at, c.usage_limit, c.usage_count, c.active, (SELECT GROUP_CONCAT(p.name ORDER BY p.name SEPARATOR '، ') FROM coupon_products cp JOIN products p ON p.id = cp.product_id WHERE cp.coupon_id = c.id) AS product_names FROM coupons c ORDER BY c.id DESC");
            res.json(rows);
        } catch (error) { errorResponse(res, error, "تعذر تحميل العروض والكوبونات"); }
    });

    app.post("/api/admin/features/coupons", requireAdmin, async (req, res) => {
        const code = String(req.body?.code || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 40);
        const title = cleanText(req.body?.title, 120);
        const type = req.body?.discount_type === "fixed" ? "fixed" : "percent";
        const value = Number(req.body?.discount_value);
        const scope = ["all", "include", "exclude"].includes(req.body?.product_scope) ? req.body.product_scope : "all";
        const productIds = [...new Set((Array.isArray(req.body?.product_ids) ? req.body.product_ids : []).map(Number))];
        const minimum = Number(req.body?.minimum_subtotal || 0);
        const limit = req.body?.usage_limit === "" || req.body?.usage_limit == null ? null : Number(req.body.usage_limit);
        const start = req.body?.starts_at || null;
        const end = req.body?.ends_at || null;
        if (!/^[A-Z0-9_-]{3,40}$/.test(code) || !title || !Number.isFinite(value) || value <= 0 || (type === "percent" && value > 100) || !Number.isInteger(minimum) || minimum < 0 || productIds.some((id) => !Number.isInteger(id) || id < 1) || (scope !== "all" && !productIds.length) || (limit !== null && (!Number.isInteger(limit) || limit < 1))) return res.status(400).json({ message: "تحقق من رمز العرض وقيمته والحد الأدنى واختيار المنتجات" });
        if (start && end && new Date(start) >= new Date(end)) return res.status(400).json({ message: "تاريخ الانتهاء يجب أن يأتي بعد تاريخ البداية" });
        let connection;
        try {
            if (scope !== "all") {
                const placeholders = productIds.map(() => "?").join(",");
                const [productRows] = await dbp.query(`SELECT id FROM products WHERE id IN (${placeholders})`, productIds);
                if (productRows.length !== productIds.length) return res.status(400).json({ message: "تأكد من أن كل المنتجات المحددة موجودة" });
            }
            connection = await pool.getConnection();
            await connection.beginTransaction();
            const [result] = await connection.query("INSERT INTO coupons (code, title, discount_type, discount_value, product_scope, minimum_subtotal, starts_at, ends_at, usage_limit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [code, title, type, value, scope, minimum, start, end, limit]);
            if (scope !== "all") {
                const values = productIds.map((productId) => [result.insertId, productId]);
                await connection.query("INSERT INTO coupon_products (coupon_id, product_id) VALUES ?", [values]);
            }
            await connection.commit();
            res.status(201).json({ id: result.insertId, message: "تمت إضافة العرض" });
        } catch (error) {
            if (connection) { try { await connection.rollback(); } catch {} }
            if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "رمز العرض مستخدم من قبل" });
            errorResponse(res, error, "تعذرت إضافة العرض");
        } finally { if (connection) connection.release(); }
    });

    app.patch("/api/admin/features/coupons/:id", requireAdmin, async (req, res) => {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id < 1 || ![0, 1, true, false].includes(req.body?.active)) return res.status(400).json({ message: "بيانات العرض غير صحيحة" });
        try {
            const [result] = await dbp.query("UPDATE coupons SET active = ? WHERE id = ?", [req.body.active ? 1 : 0, id]);
            if (!result.affectedRows) return res.status(404).json({ message: "العرض غير موجود" });
            res.json({ message: "تم تحديث حالة العرض" });
        } catch (error) { errorResponse(res, error, "تعذر تحديث العرض"); }
    });

    app.delete("/api/admin/features/coupons/:id", requireAdmin, async (req, res) => {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "رقم الكوبون غير صحيح" });
        let connection;
        try {
            connection = await pool.getConnection();
            await connection.beginTransaction();
            const [coupons] = await connection.query("SELECT id, usage_count FROM coupons WHERE id = ? FOR UPDATE", [id]);
            if (!coupons.length) {
                await connection.rollback();
                return res.status(404).json({ message: "الكوبون غير موجود" });
            }
            const [redemptions] = await connection.query("SELECT COUNT(*) AS total FROM coupon_redemptions WHERE coupon_id = ?", [id]);
            if (Number(coupons[0].usage_count) > 0 || Number(redemptions[0]?.total || 0) > 0) {
                await connection.rollback();
                return res.status(409).json({ message: "ما فينا نحذف كوبون استُخدم بطلب سابق حتى نحافظ على سجل الطلبات. أوقفه بدل حذفه." });
            }
            await connection.query("DELETE FROM coupons WHERE id = ?", [id]);
            await connection.commit();
            res.json({ message: "تم حذف الكوبون" });
        } catch (error) {
            if (connection) { try { await connection.rollback(); } catch {} }
            errorResponse(res, error, "تعذر حذف الكوبون");
        } finally { if (connection) connection.release(); }
    });

    return { onOrderCreated, onOrderStatusChanged, pushReady };
}

module.exports = { createFeatures };
