"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { calculateCouponDiscount, couponIncludesProduct, allocateCouponProductLines } = require("../feature-utils");
const { createFeatures } = require("../features");

test("coupon percentage discount is rounded to whole lira", () => {
    assert.equal(calculateCouponDiscount(12500, 0, "percent", 10), 1250);
});

test("coupon amount cannot discount more than the remaining product subtotal", () => {
    assert.equal(calculateCouponDiscount(20000, 6000, "fixed", 18000), 14000);
});

test("coupon percentage stacks on the remaining subtotal after the general discount", () => {
    assert.equal(calculateCouponDiscount(10000, 1000, "percent", 10), 900);
});

test("coupon product scopes include only selected products or exclude selected products", () => {
    assert.equal(couponIncludesProduct({ product_scope: "include", product_ids: [3, 5] }, 3), true);
    assert.equal(couponIncludesProduct({ product_scope: "include", product_ids: [3, 5] }, 4), false);
    assert.equal(couponIncludesProduct({ product_scope: "exclude", product_ids: [3] }, 3), false);
    assert.equal(couponIncludesProduct({ product_scope: "exclude", product_ids: [3] }, 4), true);
    assert.equal(couponIncludesProduct({ product_scope: "all", product_ids: [] }, 99), true);
});

test("a broad coupon applies only to products left after product-only coupons", () => {
    const lines = [{ product_id: 7 }, { product_id: 8 }, { product_id: 9 }];
    const coupons = [
        { code: "ONLY7", product_scope: "include", product_ids: [7] },
        { code: "ALL", product_scope: "all", product_ids: [] }
    ];
    const allocations = allocateCouponProductLines(coupons, lines);
    assert.deepEqual(allocations.map(({ coupon, lines: eligible }) => [coupon.code, eligible.map((line) => line.product_id)]), [
        ["ONLY7", [7]], ["ALL", [8, 9]]
    ]);
});

test("overlapping product coupons allocate each product to one coupon", () => {
    const lines = [{ product_id: 7 }, { product_id: 8 }, { product_id: 9 }];
    const coupons = [
        { code: "FIRST", product_scope: "include", product_ids: [7, 8] },
        { code: "SECOND", product_scope: "include", product_ids: [8, 9] }
    ];
    const allocations = allocateCouponProductLines(coupons, lines);
    assert.deepEqual(allocations.map(({ coupon, lines: eligible }) => [coupon.code, eligible.map((line) => line.product_id)]), [
        ["FIRST", [7, 8]], ["SECOND", [9]]
    ]);
});

test("a zero or invalid coupon value adds no discount", () => {
    assert.equal(calculateCouponDiscount(12000, 0, "percent", 0), 0);
    assert.equal(calculateCouponDiscount(12000, 0, "percent", NaN), 0);
});

test("removed business tools are not exposed by the admin feature script or API", () => {
    const registeredRoutes = new Set();
    const app = new Proxy({}, { get: (_target, method) => (route) => registeredRoutes.add(`${method} ${route}`) });
    createFeatures(app, { dbp: {}, pool: {}, requireAdmin: () => {}, webpush: null });
    for (const route of [
        "get /api/admin/features/reports", "get /api/admin/features/products-cost",
        "put /api/admin/features/products-cost/:id", "get /api/admin/features/expenses",
        "post /api/admin/features/expenses", "delete /api/admin/features/expenses/:id",
        "get /api/admin/features/loyalty", "put /api/admin/features/loyalty",
        "post /api/admin/features/loyalty/redeem"
    ]) assert.equal(registeredRoutes.has(route), false, route);
    const adminScript = fs.readFileSync(path.join(__dirname, "..", "..", "admin-features.js"), "utf8");
    assert.doesNotMatch(adminScript, /تقارير المبيعات والأرباح|تكلفة المنتجات|نقاط ومكافآت الزبائن|المصاريف/);
});

test("database migration is additive and includes feature storage", () => {
    const migration = fs.readFileSync(path.join(__dirname, "..", "feature-addons.sql"), "utf8");
    assert.doesNotMatch(migration, /\bDROP\s+TABLE\b/i);
    for (const name of ["feature_settings", "coupons", "coupon_products", "coupon_redemptions", "customer_push_subscriptions", "loyalty_accounts", "loyalty_ledger", "business_expenses"]) {
        assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${name}\\s*\\(`, "i"));
    }
    assert.match(migration, /ALTER TABLE orders ADD COLUMN coupon_discount_amount/i);
    assert.match(migration, /product_scope ENUM/i);
    assert.match(migration, /ALTER TABLE coupons ADD COLUMN product_scope/i);
    assert.match(migration, /MODIFY coupon_code VARCHAR\(255\)/i);
    assert.match(migration, /ADD COLUMN staff_claim_token CHAR\(36\)/i);
    assert.match(migration, /ALTER TABLE order_items[\s\S]*unit_cost/i);
});

test("coupon dates are entered and shown in Arabic year/month/day order", () => {
    const adminScript = fs.readFileSync(path.join(__dirname, "..", "..", "admin-features.js"), "utf8");
    assert.match(adminScript, /name="starts_at" type="text"[^>]*placeholder="سنة\/شهر\/يوم"/);
    assert.match(adminScript, /name="ends_at" type="text"[^>]*placeholder="سنة\/شهر\/يوم"/);
    assert.match(adminScript, /اكتب التاريخ بصيغة سنة\/شهر\/يوم/);
    assert.match(adminScript, /return `\$\{year\}-\$\{month\}-\$\{day\}/);
});

function featureRouteHarness(dbp) {
    const routes = new Map();
    const app = new Proxy({}, { get: (_target, method) => (...args) => routes.set(`${method} ${args[0]}`, args.slice(1)) });
    createFeatures(app, { dbp, pool: {}, requireAdmin: (_req, _res, next) => next(), webpush: null });
    return routes;
}

function jsonResponse() {
    return {
        statusCode: 200,
        headers: {},
        status(code) { this.statusCode = code; return this; },
        set(name, value) { this.headers[name] = value; return this; },
        json(body) { this.body = body; return this; }
    };
}

test("staff phone numbers survive MySQL JSON values returned as arrays", async () => {
    const routes = featureRouteHarness({ query: async () => [[{ staff_whatsapp_numbers: ["963955501234"] }]] });
    const handler = routes.get("get /api/admin/features/contacts").at(-1);
    const response = jsonResponse();
    await handler({}, response);
    assert.deepEqual(response.body.numbers, ["963955501234"]);
    assert.equal(response.headers["Cache-Control"], "no-store");
});

test("employee WhatsApp order links receive numbers stored in a MySQL JSON array", async () => {
    const storedNumbers = ["963955501234", "963944401234"];
    const dbp = { query: async (sql) => {
        if (sql.startsWith("SELECT id, order_code")) return [[{
            id: 8, order_code: "K-8", tracking_token: "tracking", customer_name: "Test", customer_phone: "963900000000",
            fulfillment_type: "pickup", delivery_address: null, delivery_lat: null, delivery_lng: null,
            status: "pending", total: 12500, delivery_fee: 0, staff_claim_token: "claim-token", staff_claimed_by: null
        }]];
        if (sql.startsWith("SELECT product_name")) return [[{ product_name: "قهوة", quantity: 1, weight_grams: null, unit_label: "حبة", line_total: 12500 }]];
        if (sql.startsWith("SELECT staff_whatsapp_numbers")) return [[{ staff_whatsapp_numbers: storedNumbers }]];
        throw new Error(`Unexpected SQL in WhatsApp route test: ${sql}`);
    } };
    const routes = featureRouteHarness(dbp);
    const handler = routes.get("get /api/admin/features/orders/:id/whatsapp").at(-1);
    const response = jsonResponse();
    await handler({ params: { id: "8" }, protocol: "https", get: () => "mahmasa-catalog.onrender.com" }, response);
    assert.deepEqual(response.body.numbers, storedNumbers);
    assert.match(response.body.message, /طلب K-8/);
    assert.equal(response.headers["Cache-Control"], "no-store");
});

test("admin can remove this device's push subscription", async () => {
    let query;
    const dbp = { query: async (...args) => { query = args; return [{ affectedRows: 1 }]; } };
    const routes = featureRouteHarness(dbp);
    const handler = routes.get("delete /api/admin/features/push-subscription").at(-1);
    const response = jsonResponse();
    await handler({ body: { endpoint: "https://push.example/device-123" } }, response);
    const expectedHash = require("node:crypto").createHash("sha256").update("https://push.example/device-123").digest("hex");
    assert.equal(response.statusCode, 200);
    assert.match(query[0], /DELETE FROM admin_push_subscriptions/);
    assert.equal(query[1][0], expectedHash);
});

test("a customer device subscription links to later orders without requesting permission again", async () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "..", "customer-features.js"), "utf8");
    const calls = [];
    let permissionRequests = 0;
    let subscribeCalls = 0;
    const subscription = {
        endpoint: "https://push.example/customer-device",
        toJSON: () => ({ endpoint: "https://push.example/customer-device", keys: { p256dh: "public", auth: "secret" } })
    };
    const registration = { pushManager: {
        getSubscription: async () => subscription,
        subscribe: async () => { subscribeCalls++; return subscription; }
    } };
    const elements = {
        enableOrderNotifications: { disabled: false, textContent: "", addEventListener() {} },
        orderNotificationsFeedback: { textContent: "" }
    };
    const context = {
        document: { getElementById: (id) => elements[id] || null },
        window: { PushManager: {}, Notification: {} },
        navigator: { serviceWorker: { getRegistration: async () => registration, ready: Promise.resolve(registration) } },
        PushManager: {},
        Notification: { permission: "granted", requestPermission: async () => { permissionRequests++; return "granted"; } },
        API_BASE_URL: "https://api.example",
        lastOrderToken: "order-one",
        fetch: async (url, options) => {
            calls.push({ url, body: JSON.parse(options.body) });
            return { ok: true, json: async () => ({ message: "ok" }) };
        }
    };
    vm.runInNewContext(source, context);
    assert.equal(await context.window.linkCustomerPushToOrder("22222222-2222-4222-8222-222222222222"), true);
    assert.equal(permissionRequests, 0);
    assert.equal(subscribeCalls, 0);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.tracking_token, "22222222-2222-4222-8222-222222222222");
    assert.equal(elements.enableOrderNotifications.disabled, true);
});

test("the same customer device can be linked to more than one order", async () => {
    const previousEnv = {
        VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
        VAPID_SUBJECT: process.env.VAPID_SUBJECT
    };
    process.env.VAPID_PUBLIC_KEY = "public-key";
    process.env.VAPID_PRIVATE_KEY = "private-key";
    process.env.VAPID_SUBJECT = "mailto:test@example.com";
    try {
        const inserts = [];
        const dbp = { query: async (sql, params) => {
            if (sql.startsWith("SELECT id FROM orders WHERE tracking_token")) return [[{ id: params[0] === "11111111-1111-4111-8111-111111111111" ? 11 : 12 }]];
            if (sql.startsWith("INSERT INTO customer_push_subscriptions")) { inserts.push(params); return [{ affectedRows: 1 }]; }
            throw new Error(`Unexpected SQL in customer push test: ${sql}`);
        } };
        const routes = new Map();
        const app = new Proxy({}, { get: (_target, method) => (...args) => routes.set(`${method} ${args[0]}`, args.slice(1)) });
        createFeatures(app, { dbp, pool: {}, requireAdmin: (_req, _res, next) => next(), webpush: { setVapidDetails() {} } });
        const handler = routes.get("post /api/customer/features/push-subscription").at(-1);
        const sub = { endpoint: "https://push.example/customer-device", keys: { p256dh: "public", auth: "secret" } };
        for (const token of ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"]) {
            const response = jsonResponse();
            await handler({ body: { tracking_token: token, subscription: sub } }, response);
            assert.equal(response.statusCode, 200);
        }
        assert.deepEqual(inserts.map((params) => params[0]), [11, 12]);
        assert.equal(inserts[0][1], inserts[1][1]);
    } finally {
        for (const [key, value] of Object.entries(previousEnv)) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
    }
});

function couponDeleteHarness({ coupon, redemptionCount = 0 }) {
    const routes = new Map();
    const app = new Proxy({}, { get: (_target, method) => (...args) => routes.set(`${method} ${args[0]}`, args.slice(1)) });
    const state = { deleted: false, committed: false, rolledBack: false };
    const connection = {
        beginTransaction: async () => {},
        commit: async () => { state.committed = true; },
        rollback: async () => { state.rolledBack = true; },
        release: () => {},
        query: async (sql) => {
            if (sql.startsWith("SELECT id, usage_count")) return [coupon ? [coupon] : []];
            if (sql.startsWith("SELECT COUNT(*) AS total")) return [[{ total: redemptionCount }]];
            if (sql.startsWith("DELETE FROM coupons")) { state.deleted = true; return [{ affectedRows: 1 }]; }
            throw new Error(`Unexpected SQL in test: ${sql}`);
        }
    };
    createFeatures(app, {
        dbp: { query: async () => [[]] },
        pool: { getConnection: async () => connection },
        requireAdmin: (_req, _res, next) => next(),
        webpush: null
    });
    const handler = routes.get("delete /api/admin/features/coupons/:id").at(-1);
    const response = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
    return { handler, response, state };
}

test("unused coupons can be permanently deleted", async () => {
    const { handler, response, state } = couponDeleteHarness({ coupon: { id: 12, usage_count: 0 } });
    await handler({ params: { id: "12" } }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(state.deleted, true);
    assert.equal(state.committed, true);
    assert.equal(state.rolledBack, false);
});

test("coupons with order history cannot be deleted", async () => {
    const { handler, response, state } = couponDeleteHarness({ coupon: { id: 12, usage_count: 1 }, redemptionCount: 1 });
    await handler({ params: { id: "12" } }, response);
    assert.equal(response.statusCode, 409);
    assert.match(response.body.message, /أوقفه بدل حذفه/);
    assert.equal(state.deleted, false);
    assert.equal(state.rolledBack, true);
});
