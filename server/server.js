require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mysql = require("mysql2");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const session = require("express-session");
const { v2: cloudinary } = require("cloudinary");
const { CloudinaryStorage } = require("multer-storage-cloudinary");

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const app = express();



// ========================================
// Middleware
// ========================================

app.use(
    cors({
        origin: [
            "http://127.0.0.1:5500",
            "http://localhost:5500"
        ],
        credentials: true
    })
);
app.use(express.json());

app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: "lax",
            maxAge: 1000 * 60 * 60 * 8
        }
    })
);
function requireAdmin(req, res, next) {
    if (req.session && req.session.isAdmin) {
        return next();
    }

    return res.status(401).json({
        message: "يجب تسجيل الدخول إلى لوحة الإدارة"
    });
}


// ========================================
// Cloudinary - رفع الصور
// ========================================

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: "mahmasa-catalog",
        allowed_formats: ["jpg", "jpeg", "png", "webp"]
    }
});

const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
        cb(null, true);
    } else {
        cb(new Error("يُسمح برفع الصور فقط"), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024
    }
});
// ========================================
// Cloudinary - حذف الصور
// ========================================

async function deleteImage(imageUrl) {
    if (!imageUrl) return;

    try {
        // نتأكد أن الصورة أصلًا من Cloudinary
        if (!imageUrl.includes("cloudinary.com")) {
            return;
        }

        // استخراج public_id من رابط Cloudinary
        const parts = imageUrl.split("/");
        const uploadIndex = parts.indexOf("upload");

        if (uploadIndex === -1) return;

        let publicId = parts
            .slice(uploadIndex + 2)
            .join("/");

        // إزالة امتداد الصورة
        publicId = publicId.replace(/\.[^/.]+$/, "");

        await cloudinary.uploader.destroy(publicId);

        console.log("Image deleted from Cloudinary:", publicId);
    } catch (error) {
        console.error("Failed to delete image from Cloudinary:", error);
    }
}


// ========================================
// الاتصال بقاعدة البيانات
// ========================================



const db = mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: {
        rejectUnauthorized: false
    }
});



// ========================================
// ADMIN AUTH
// ========================================

app.post("/api/admin/login", (req, res) => {

    const { username, password } = req.body;

    if (
        username === process.env.ADMIN_USERNAME &&
        password === process.env.ADMIN_PASSWORD
    ) {
        req.session.isAdmin = true;

        return res.json({
            message: "تم تسجيل الدخول بنجاح"
        });
    }

    return res.status(401).json({
        message: "اسم المستخدم أو كلمة المرور غير صحيحة"
    });
});


app.get("/api/admin/check", (req, res) => {

    if (req.session && req.session.isAdmin) {
        return res.json({
            loggedIn: true
        });
    }

    return res.status(401).json({
        loggedIn: false
    });
});


app.post("/api/admin/logout", (req, res) => {

    req.session.destroy(() => {

        res.json({
            message: "تم تسجيل الخروج"
        });

    });

});


// ========================================
// PRODUCTS
// ========================================


// جلب المنتجات

app.get("/api/products", (req, res) => {

    const sql =
        "SELECT * FROM products ORDER BY id DESC";

    db.query(sql, (err, results) => {

        if (err) {
            console.error(err);

            return res.status(500).json({
                message: "حدث خطأ في قاعدة البيانات"
            });
        }

        res.json(results);
    });
});


// إضافة منتج

app.post(
    "/api/products",
    requireAdmin,
    upload.single("image"),
    (req, res) => {

        const {
            name,
            price,
            description,
            category,
            weight
        } = req.body;


        if (!name || price === undefined || price === "") {

            if (req.file) {
                deleteImage(req.file.path);
            }

            return res.status(400).json({
                message: "اسم المنتج والسعر مطلوبان"
            });
        }


        const numericPrice = Number(price);

        if (
            Number.isNaN(numericPrice) ||
            numericPrice < 0
        ) {

            if (req.file) {
                deleteImage(req.file.path);
            }

            return res.status(400).json({
                message: "السعر غير صحيح"
            });
        }


        const image =
            req.file
                ? req.file.path
                : null;


        const sql = `
            INSERT INTO products
            (
                name,
                price,
                description,
                image,
                category,
                weight
            )
            VALUES (?, ?, ?, ?, ?, ?)
        `;


        db.query(
            sql,
            [
                name.trim(),
                numericPrice,
                description || null,
                image,
                category || null,
                weight || null
            ],
            (err, result) => {

                if (err) {

                    if (image) {
                        deleteImage(image);
                    }

                    console.error(err);

                    return res.status(500).json({
                        message: "فشل إضافة المنتج"
                    });
                }


                res.status(201).json({
                    message: "تمت إضافة المنتج بنجاح",
                    id: result.insertId
                });
            }
        );
    }
);


// تعديل منتج

app.put(
    "/api/products/:id",
    requireAdmin,
    upload.single("image"),
    (req, res) => {

        const productId = req.params.id;

        const {
            name,
            price,
            description,
            category,
            weight
        } = req.body;


        if (!name || price === undefined || price === "") {

            if (req.file) {
                deleteImage(req.file.path);
            }

            return res.status(400).json({
                message: "اسم المنتج والسعر مطلوبان"
            });
        }


        const numericPrice = Number(price);

        if (
            Number.isNaN(numericPrice) ||
            numericPrice < 0
        ) {

            if (req.file) {
                deleteImage(req.file.path);
            }

            return res.status(400).json({
                message: "السعر غير صحيح"
            });
        }


        db.query(
            "SELECT * FROM products WHERE id = ?",
            [productId],
            (err, results) => {

                if (err) {

                    if (req.file) {
                        deleteImage(req.file.path);
                    }

                    return res.status(500).json({
                        message: "حدث خطأ في قاعدة البيانات"
                    });
                }


                if (results.length === 0) {

                    if (req.file) {
                        deleteImage(req.file.path);
                    }

                    return res.status(404).json({
                        message: "المنتج غير موجود"
                    });
                }


                const oldProduct = results[0];

                const newImage =
                    req.file
                        ? req.file.path
                        : oldProduct.image;


                const sql = `
                    UPDATE products
                    SET
                        name = ?,
                        price = ?,
                        description = ?,
                        image = ?,
                        category = ?,
                        weight = ?
                    WHERE id = ?
                `;


                db.query(
                    sql,
                    [
                        name.trim(),
                        numericPrice,
                        description || null,
                        newImage,
                        category || null,
                        weight || null,
                        productId
                    ],
                    (updateErr) => {

                        if (updateErr) {

                            if (req.file) {
                                deleteImage(req.file.path);
                            }

                            console.error(updateErr);

                            return res.status(500).json({
                                message: "فشل تعديل المنتج"
                            });
                        }


                        if (
                            req.file &&
                            oldProduct.image
                        ) {
                            deleteImage(oldProduct.image);
                        }


                        res.json({
                            message: "تم تعديل المنتج بنجاح"
                        });
                    }
                );
            }
        );
    }
);


// حذف منتج

app.delete(
    "/api/products/:id",
    requireAdmin,
     (req, res) => {

    const productId = req.params.id;


    db.query(
        "SELECT * FROM products WHERE id = ?",
        [productId],
        (err, results) => {

            if (err) {
                return res.status(500).json({
                    message: "حدث خطأ في قاعدة البيانات"
                });
            }


            if (results.length === 0) {
                return res.status(404).json({
                    message: "المنتج غير موجود"
                });
            }


            const product = results[0];


            db.query(
                "DELETE FROM products WHERE id = ?",
                [productId],
                (deleteErr) => {

                    if (deleteErr) {
                        return res.status(500).json({
                            message: "فشل حذف المنتج"
                        });
                    }


                    if (product.image) {
                        deleteImage(product.image);
                    }


                    res.json({
                        message: "تم حذف المنتج بنجاح"
                    });
                }
            );
        }
    );
});


// ========================================
// CATEGORIES
// ========================================


// جلب الأقسام

app.get("/api/categories", (req, res) => {

    db.query(
        "SELECT * FROM categories ORDER BY id ASC",
        (err, results) => {

            if (err) {
                console.error(err);

                return res.status(500).json({
                    message: "فشل جلب الأقسام"
                });
            }

            res.json(results);
        }
    );
});


// إضافة قسم

app.post("/api/categories", requireAdmin,(req, res) => {

    const name =
        String(req.body.name || "").trim();


    if (!name) {
        return res.status(400).json({
            message: "اسم القسم مطلوب"
        });
    }


    db.query(
        "INSERT INTO categories (name) VALUES (?)",
        [name],
        (err, result) => {

            if (err) {

                if (err.code === "ER_DUP_ENTRY") {
                    return res.status(400).json({
                        message: "هذا القسم موجود مسبقًا"
                    });
                }

                console.error(err);

                return res.status(500).json({
                    message: "فشل إضافة القسم"
                });
            }


            res.status(201).json({
                message: "تمت إضافة القسم بنجاح",
                id: result.insertId
            });
        }
    );
});


// تعديل قسم

app.put("/api/categories/:id",requireAdmin, (req, res) => {

    const id = req.params.id;

    const newName =
        String(req.body.name || "").trim();


    if (!newName) {
        return res.status(400).json({
            message: "اسم القسم مطلوب"
        });
    }


    db.query(
        "SELECT * FROM categories WHERE id = ?",
        [id],
        (err, results) => {

            if (err) {
                return res.status(500).json({
                    message: "حدث خطأ في قاعدة البيانات"
                });
            }


            if (results.length === 0) {
                return res.status(404).json({
                    message: "القسم غير موجود"
                });
            }


            const oldName = results[0].name;


            db.beginTransaction((transactionErr) => {

                if (transactionErr) {
                    return res.status(500).json({
                        message: "تعذر بدء عملية التعديل"
                    });
                }


                db.query(
                    "UPDATE categories SET name = ? WHERE id = ?",
                    [newName, id],
                    (updateCategoryErr) => {

                        if (updateCategoryErr) {

                            return db.rollback(() => {

                                if (
                                    updateCategoryErr.code ===
                                    "ER_DUP_ENTRY"
                                ) {
                                    return res.status(400).json({
                                        message:
                                            "يوجد قسم بهذا الاسم مسبقًا"
                                    });
                                }

                                res.status(500).json({
                                    message: "فشل تعديل القسم"
                                });
                            });
                        }


                        db.query(
                            `
                            UPDATE products
                            SET category = ?
                            WHERE category = ?
                            `,
                            [newName, oldName],
                            (updateProductsErr) => {

                                if (updateProductsErr) {

                                    return db.rollback(() => {
                                        res.status(500).json({
                                            message:
                                                "فشل تحديث منتجات القسم"
                                        });
                                    });
                                }


                                db.commit((commitErr) => {

                                    if (commitErr) {

                                        return db.rollback(() => {
                                            res.status(500).json({
                                                message:
                                                    "فشل حفظ التعديلات"
                                            });
                                        });
                                    }


                                    res.json({
                                        message:
                                            "تم تعديل القسم ومنتجاته بنجاح"
                                    });
                                });
                            }
                        );
                    }
                );
            });
        }
    );
});


// حذف قسم

app.delete("/api/categories/:id",requireAdmin, (req, res) => {

    const id = req.params.id;


    db.query(
        "SELECT * FROM categories WHERE id = ?",
        [id],
        (err, results) => {

            if (err) {
                return res.status(500).json({
                    message: "حدث خطأ في قاعدة البيانات"
                });
            }


            if (results.length === 0) {
                return res.status(404).json({
                    message: "القسم غير موجود"
                });
            }


            const categoryName = results[0].name;


            db.query(
                `
                SELECT COUNT(*) AS total
                FROM products
                WHERE category = ?
                `,
                [categoryName],
                (countErr, countResults) => {

                    if (countErr) {
                        return res.status(500).json({
                            message:
                                "تعذر التحقق من منتجات القسم"
                        });
                    }


                    if (countResults[0].total > 0) {
                        return res.status(400).json({
                            message:
                                "لا يمكن حذف القسم لأنه يحتوي على منتجات"
                        });
                    }


                    db.query(
                        "DELETE FROM categories WHERE id = ?",
                        [id],
                        (deleteErr) => {

                            if (deleteErr) {
                                return res.status(500).json({
                                    message: "فشل حذف القسم"
                                });
                            }


                            res.json({
                                message:
                                    "تم حذف القسم بنجاح"
                            });
                        }
                    );
                }
            );
        }
    );
});


// ========================================
// SETTINGS
// ========================================


// جلب الإعدادات

app.get("/api/settings", (req, res) => {

    db.query(
        "SELECT * FROM settings WHERE id = 1",
        (err, results) => {

            if (err) {
                console.error(err);

                return res.status(500).json({
                    message: "فشل جلب الإعدادات"
                });
            }


            if (results.length === 0) {
                return res.status(404).json({
                    message: "الإعدادات غير موجودة"
                });
            }


            res.json(results[0]);
        }
    );
});


// تعديل الإعدادات + الشعار

app.put(
    "/api/settings",
    requireAdmin,
    upload.single("logo"),
    (req, res) => {

        const {
            shop_name,
            description,
            phone,
            whatsapp,
            address
        } = req.body;


        const shopName =
            String(shop_name || "").trim();


        if (!shopName) {

            if (req.file) {
                deleteImage(req.file.path);
            }

            return res.status(400).json({
                message: "اسم المحمصة مطلوب"
            });
        }


        db.query(
            "SELECT * FROM settings WHERE id = 1",
            (err, results) => {

                if (err) {

                    if (req.file) {
                        deleteImage(req.file.path);
                    }

                    return res.status(500).json({
                        message: "حدث خطأ في قاعدة البيانات"
                    });
                }


                const oldSettings =
                    results.length > 0
                        ? results[0]
                        : null;


                const logo =
                    req.file
                        ? req.file.path
                        : oldSettings?.logo || null;


                const sql = `
                    INSERT INTO settings
                    (
                        id,
                        shop_name,
                        description,
                        phone,
                        whatsapp,
                        address,
                        logo
                    )
                    VALUES
                    (
                        1, ?, ?, ?, ?, ?, ?
                    )
                    ON DUPLICATE KEY UPDATE
                        shop_name = VALUES(shop_name),
                        description = VALUES(description),
                        phone = VALUES(phone),
                        whatsapp = VALUES(whatsapp),
                        address = VALUES(address),
                        logo = VALUES(logo)
                `;


                db.query(
                    sql,
                    [
                        shopName,
                        description || null,
                        phone || null,
                        whatsapp || null,
                        address || null,
                        logo
                    ],
                    (updateErr) => {

                        if (updateErr) {

                            if (req.file) {
                                deleteImage(req.file.path);
                            }

                            console.error(updateErr);

                            return res.status(500).json({
                                message:
                                    "فشل حفظ إعدادات المحمصة"
                            });
                        }


                        if (
                            req.file &&
                            oldSettings?.logo
                        ) {
                            deleteImage(oldSettings.logo);
                        }


                        res.json({
                            message:
                                "تم حفظ إعدادات المحمصة بنجاح"
                        });
                    }
                );
            }
        );
    }
);


// ========================================
// معالجة أخطاء رفع الملفات
// ========================================

app.use((err, req, res, next) => {

    if (err instanceof multer.MulterError) {

        if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({
                message:
                    "حجم الصورة يجب ألا يتجاوز 5MB"
            });
        }
    }


    if (err) {
        console.error(err);

        return res.status(400).json({
            message:
                err.message ||
                "حدث خطأ أثناء رفع الصورة"
        });
    }


    next();
});


// ========================================
// الصفحة الرئيسية
// ========================================

app.get("/", (req, res) => {
    res.send("Mahmasa Server is working!");
});


// ========================================
// تشغيل السيرفر
// ========================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});