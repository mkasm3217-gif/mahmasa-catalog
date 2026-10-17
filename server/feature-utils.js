"use strict";

function roundMoney(value) {
    const number = Number(value || 0);
    return Math.round(Number.isFinite(number) ? number : 0);
}

function calculateCouponDiscount(subtotal, existingDiscount, discountType, discountValue) {
    const base = Math.max(0, roundMoney(subtotal) - roundMoney(existingDiscount));
    const value = Number(discountValue || 0);
    if (base <= 0 || !Number.isFinite(value) || value <= 0) return 0;
    // When a general discount is active, calculate the coupon on the remaining subtotal.
    const amount = discountType === "percent" ? roundMoney(base * value / 100) : roundMoney(value);
    return Math.min(base, Math.max(0, amount));
}

function couponIncludesProduct(coupon, productId) {
    const scope = coupon?.product_scope || "all";
    const selectedIds = new Set((coupon?.product_ids || []).map(Number));
    const selected = selectedIds.has(Number(productId));
    if (scope === "include") return selected;
    if (scope === "exclude") return !selected;
    return true;
}

function allocateCouponProductLines(coupons, lines) {
    const productCoupons = coupons.filter((coupon) => coupon.product_scope === "include");
    const broadCoupons = coupons.filter((coupon) => coupon.product_scope !== "include");
    if (broadCoupons.length > 1) {
        const error = new Error("استخدم كوبونًا شاملًا واحدًا فقط مع كوبونات المنتجات");
        error.status = 400;
        throw error;
    }
    const coveredProductIds = new Set();
    const allocations = [];
    for (const coupon of productCoupons) {
        const eligibleLines = lines.filter((line) =>
            couponIncludesProduct(coupon, line.product_id) && !coveredProductIds.has(Number(line.product_id))
        );
        if (!eligibleLines.length) {
            const error = new Error(`لا توجد منتجات في السلة ينطبق عليها كوبون ${coupon.code}`);
            error.status = 400;
            throw error;
        }
        for (const line of eligibleLines) {
            const productId = Number(line.product_id);
            coveredProductIds.add(productId);
        }
        allocations.push({ coupon, lines: eligibleLines });
    }
    for (const coupon of broadCoupons) {
        const eligibleLines = lines.filter((line) =>
            couponIncludesProduct(coupon, line.product_id) && !coveredProductIds.has(Number(line.product_id))
        );
        if (!eligibleLines.length) {
            const error = new Error(`لا توجد منتجات في السلة ينطبق عليها كوبون ${coupon.code}`);
            error.status = 400;
            throw error;
        }
        allocations.push({ coupon, lines: eligibleLines });
    }
    return allocations;
}

module.exports = { calculateCouponDiscount, couponIncludesProduct, allocateCouponProductLines };
