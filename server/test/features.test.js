"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
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
