-- Additive migration for optional Kramish order features.
-- For local testing, select mahmasa_catalog_test in MySQL Workbench before running this file.
-- This script adds columns/tables only; it does not drop or replace existing data.

SET @feature_ddl = IF(
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'products' AND column_name = 'cost_price') = 0,
    'ALTER TABLE products ADD COLUMN cost_price DECIMAL(12,2) NOT NULL DEFAULT 0.00',
    'SELECT 1'
);
PREPARE feature_stmt FROM @feature_ddl;
EXECUTE feature_stmt;
DEALLOCATE PREPARE feature_stmt;

SET @feature_ddl = IF(
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'order_items' AND column_name = 'unit_cost') = 0,
    'ALTER TABLE order_items ADD COLUMN unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0.00',
    'SELECT 1'
);
PREPARE feature_stmt FROM @feature_ddl;
EXECUTE feature_stmt;
DEALLOCATE PREPARE feature_stmt;

SET @feature_ddl = IF(
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'coupon_code') = 0,
    'ALTER TABLE orders ADD COLUMN coupon_code VARCHAR(255) NULL',
    'SELECT 1'
);
PREPARE feature_stmt FROM @feature_ddl;
EXECUTE feature_stmt;
DEALLOCATE PREPARE feature_stmt;

SET @feature_ddl = IF(
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'coupon_code' AND CHARACTER_MAXIMUM_LENGTH < 255) > 0,
    'ALTER TABLE orders MODIFY coupon_code VARCHAR(255) NULL',
    'SELECT 1'
);
PREPARE feature_stmt FROM @feature_ddl;
EXECUTE feature_stmt;
DEALLOCATE PREPARE feature_stmt;

SET @feature_ddl = IF(
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'coupon_discount_amount') = 0,
    'ALTER TABLE orders ADD COLUMN coupon_discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00',
    'SELECT 1'
);
PREPARE feature_stmt FROM @feature_ddl;
EXECUTE feature_stmt;
DEALLOCATE PREPARE feature_stmt;

SET @feature_ddl = IF(
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'staff_claim_token') = 0,
    'ALTER TABLE orders ADD COLUMN staff_claim_token CHAR(36) NULL UNIQUE, ADD COLUMN staff_claimed_by VARCHAR(120) NULL, ADD COLUMN staff_claimed_at TIMESTAMP NULL DEFAULT NULL',
    'SELECT 1'
);
PREPARE feature_stmt FROM @feature_ddl;
EXECUTE feature_stmt;
DEALLOCATE PREPARE feature_stmt;

CREATE TABLE IF NOT EXISTS feature_settings (
    id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
    points_per_10000 INT UNSIGNED NOT NULL DEFAULT 0,
    point_value DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    coupon_stack_auto TINYINT(1) NOT NULL DEFAULT 0,
    staff_whatsapp_numbers JSON NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO feature_settings (id) VALUES (1)
ON DUPLICATE KEY UPDATE id = VALUES(id);

CREATE TABLE IF NOT EXISTS coupons (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(40) NOT NULL,
    title VARCHAR(120) NOT NULL,
    discount_type ENUM('percent','fixed') NOT NULL DEFAULT 'percent',
    discount_value DECIMAL(12,2) NOT NULL,
    product_scope ENUM('all','include','exclude') NOT NULL DEFAULT 'all',
    minimum_subtotal DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    starts_at DATETIME NULL,
    ends_at DATETIME NULL,
    usage_limit INT UNSIGNED NULL,
    usage_count INT UNSIGNED NOT NULL DEFAULT 0,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_coupons_code (code),
    KEY idx_coupons_active_dates (active, starts_at, ends_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET @feature_ddl = IF(
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'coupons' AND column_name = 'product_scope') = 0,
    'ALTER TABLE coupons ADD COLUMN product_scope ENUM(''all'',''include'',''exclude'') NOT NULL DEFAULT ''all''',
    'SELECT 1'
);
PREPARE feature_stmt FROM @feature_ddl;
EXECUTE feature_stmt;
DEALLOCATE PREPARE feature_stmt;

CREATE TABLE IF NOT EXISTS coupon_products (
    coupon_id BIGINT UNSIGNED NOT NULL,
    product_id INT NOT NULL,
    PRIMARY KEY (coupon_id, product_id),
    KEY idx_coupon_products_product (product_id),
    CONSTRAINT fk_coupon_products_coupon FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE CASCADE,
    CONSTRAINT fk_coupon_products_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS coupon_redemptions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    coupon_id BIGINT UNSIGNED NOT NULL,
    order_id BIGINT NOT NULL,
    phone VARCHAR(50) NOT NULL,
    discount_amount DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_coupon_order (coupon_id, order_id),
    KEY idx_coupon_phone (coupon_id, phone),
    CONSTRAINT fk_coupon_redemptions_coupon FOREIGN KEY (coupon_id) REFERENCES coupons(id),
    CONSTRAINT fk_coupon_redemptions_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS customer_push_subscriptions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    order_id BIGINT NOT NULL,
    endpoint_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    endpoint TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    p256dh VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    auth VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_success_at TIMESTAMP NULL DEFAULT NULL,
    UNIQUE KEY uq_customer_push_order_endpoint (order_id, endpoint_hash),
    KEY idx_customer_push_endpoint_hash (endpoint_hash),
    KEY idx_customer_push_order (order_id),
    CONSTRAINT fk_customer_push_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS loyalty_accounts (
    phone VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    points_balance BIGINT UNSIGNED NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS loyalty_ledger (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    phone VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    order_id BIGINT NULL,
    event_type ENUM('earned','redeemed','adjustment') NOT NULL,
    points BIGINT NOT NULL,
    note VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_loyalty_order_event (order_id, event_type),
    KEY idx_loyalty_phone_created (phone, created_at),
    CONSTRAINT fk_loyalty_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS business_expenses (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    description VARCHAR(255) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    expense_date DATE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_business_expenses_date (expense_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
