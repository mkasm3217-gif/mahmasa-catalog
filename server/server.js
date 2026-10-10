require("dotenv").config();







const express = require("express");



const cors = require("cors");



const mysql = require("mysql2");



const multer = require("multer");



const path = require("path");



const fs = require("fs");
const crypto = require("crypto");



const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);



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



            "http://localhost:5500",



            "http://9.9.9.84:5500",



            "https://mahmasa-catalog-1.onrender.com"



        ],



        credentials: true



    })



);



app.use(express.json());







app.set("trust proxy",1);

// Local development runs over HTTP; Render uses HTTPS behind its trusted proxy.
// Keep cross-site secure cookies in production while allowing localhost login.
const SECURE_SESSION_COOKIES = process.env.RENDER === "true" || process.env.NODE_ENV === "production";



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



        allowed_formats: ["jpg", "jpeg", "png", "webp"],



        // أي صيغة أخرى مدعومة من Cloudinary مثل HEIC/HEIF

        // تتحول تلقائياً إلى JPG قبل الحفظ.

        format: "jpg"



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



        fileSize: 20 * 1024 * 1024



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















// Aiven MySQL uses a project CA. Verify its certificate instead of disabling TLS checks.
// Locally: server/certs/ca.pem. On Render: set AIVEN_CA_CERT_BASE64 in the environment.
// Fail closed if the CA is missing or malformed; never fall back to insecure TLS.
function loadAivenDatabaseSsl() {
    const envCa = String(process.env.AIVEN_CA_CERT_BASE64 || "").trim();
    let ca;
    if (envCa) {
        ca = Buffer.from(envCa, "base64").toString("utf8");
    } else {
        const caPath = path.join(__dirname, "certs", "ca.pem");
        try {
            ca = fs.readFileSync(caPath, "utf8");
        } catch (error) {
            throw new Error(
                "Aiven CA certificate not found. Put ca.pem in server/certs/ " +
                "or set AIVEN_CA_CERT_BASE64 on the hosting service.",
                { cause: error }
            );
        }
    }

    if (!/-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----/.test(ca)) {
        throw new Error("Invalid Aiven CA certificate: expected PEM certificate content.");
    }
    return {
        ca,
        rejectUnauthorized: true,
        servername: process.env.DB_HOST
    };
}

const AIVEN_DATABASE_SSL = loadAivenDatabaseSsl();

const db = mysql.createConnection({



    host: process.env.DB_HOST,



    port: Number(process.env.DB_PORT),



    user: process.env.DB_USER,



    password: process.env.DB_PASSWORD,



    database: process.env.DB_NAME,



    ssl: AIVEN_DATABASE_SSL



});

// Promise wrapper للقراءات الحديثة الخاصة بنظام الطلبات.
const dbp = db.promise();

// Pool منفصل للعمليات التي تحتاج Transaction (إنشاء الطلب وتغيير حالته).
const commercePool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    ssl: AIVEN_DATABASE_SSL
}).promise();

// نخزّن جلسات الإدارة في MySQL بدل MemoryStore الافتراضي غير المناسب للإنتاج.
// نستخدم نفس pool الذي يحتوي إعداد SSL لاتصال Aiven. المكتبة لا تنقل خيار SSL
// عند إنشائها pool خاصًّا بها، لذا تمرير الاتصال الموجود ضروري.
const adminSessionStore = new MySQLStore({
    createDatabaseTable: true,
    clearExpired: true,
    checkExpirationInterval: 15 * 60 * 1000,
    expiration: 8 * 60 * 60 * 1000,
    endConnectionOnClose: false,
    schema: { tableName: "admin_sessions" }
}, commercePool);

app.use(session({
    secret: process.env.SESSION_SECRET,
    store: adminSessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: SECURE_SESSION_COOKIES,
        sameSite: SECURE_SESSION_COOKIES ? "none" : "lax",
        maxAge: 1000 * 60 * 60 * 8
    }
}));
















// ========================================



// ADMIN AUTH



// ========================================







// حماية أساسية من محاولات تخمين كلمة المرور. هذا الحد على مستوى العملية الواحدة،
// وستُضاف حماية مشتركة مستمرة عبر قاعدة البيانات/الـproxy قبل التسليم التجاري.
const ADMIN_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_LOGIN_MAX_FAILURES = 8;
const adminLoginFailures = new Map();

function adminLoginClientKey(req) {
    return String(req.ip || req.socket?.remoteAddress || "unknown");
}

function recordAdminLoginFailure(clientKey) {
    const now = Date.now();
    const previous = adminLoginFailures.get(clientKey);
    const current = previous && previous.expiresAt > now
        ? { failures: previous.failures + 1, expiresAt: previous.expiresAt }
        : { failures: 1, expiresAt: now + ADMIN_LOGIN_WINDOW_MS };

    // لا نسمح بزيادة حجم الذاكرة بلا حد عند التعرض لمحاولات آلية بعناوين كثيرة.
    if (!adminLoginFailures.has(clientKey) && adminLoginFailures.size >= 5000) {
        const firstKey = adminLoginFailures.keys().next().value;
        adminLoginFailures.delete(firstKey);
    }
    adminLoginFailures.set(clientKey, current);
}

app.post("/api/admin/login", (req, res) => {
    res.set("Cache-Control", "no-store");
    const clientKey = adminLoginClientKey(req);
    const now = Date.now();
    const previous = adminLoginFailures.get(clientKey);

    if (previous && previous.expiresAt <= now) {
        adminLoginFailures.delete(clientKey);
    } else if (previous && previous.failures >= ADMIN_LOGIN_MAX_FAILURES) {
        res.set("Retry-After", String(Math.max(1, Math.ceil((previous.expiresAt - now) / 1000))));
        return res.status(429).json({
            message: "محاولات دخول كثيرة. انتظر 15 دقيقة من بداية المحاولات ثم حاول مجددًا"
        });
    }

    // مهم: إذا لم تُضبط بيانات الإدارة في البيئة، نرفض الدخول بدل مقارنة undefined.
    const expectedUsername = process.env.ADMIN_USERNAME;
    const expectedPassword = process.env.ADMIN_PASSWORD;
    if (typeof expectedUsername !== "string" || !expectedUsername.trim() ||
        typeof expectedPassword !== "string" || !expectedPassword) {
        return res.status(503).json({ message: "حساب المدير غير مهيّأ على السيرفر" });
    }

    const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const suppliedPasswordBytes = Buffer.from(password, "utf8");
    const expectedPasswordBytes = Buffer.from(expectedPassword, "utf8");
    const passwordMatches = suppliedPasswordBytes.length === expectedPasswordBytes.length &&
        crypto.timingSafeEqual(suppliedPasswordBytes, expectedPasswordBytes);

    if (username !== expectedUsername || !passwordMatches) {
        recordAdminLoginFailure(clientKey);
        return res.status(401).json({ message: "اسم المستخدم أو كلمة المرور غير صحيحة" });
    }

    // تجديد معرّف الجلسة بعد نجاح المصادقة يمنع Session Fixation.
    req.session.regenerate((regenerateError) => {
        if (regenerateError) {
            console.error("Admin session regeneration failed:", regenerateError);
            return res.status(500).json({ message: "تعذر بدء جلسة آمنة، حاول مجددًا" });
        }
        req.session.isAdmin = true;
        req.session.save((saveError) => {
            if (saveError) {
                console.error("Admin session save failed:", saveError);
                return res.status(500).json({ message: "تعذر حفظ جلسة الدخول، حاول مجددًا" });
            }
            adminLoginFailures.delete(clientKey);
            return res.json({ message: "تم تسجيل الدخول بنجاح" });
        });
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



// BANNERS



// ========================================







// جلب الإعلانات الفعالة



app.get("/api/banners", (req, res) => {



    const sql = `



        SELECT * FROM banners



        WHERE is_active = 1



        ORDER BY sort_order ASC, id DESC



    `;







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



// جلب جميع الإعلانات للوحة الإدارة

app.get("/api/admin/banners", requireAdmin, (req, res) => {

    db.query(

        "SELECT * FROM banners ORDER BY sort_order ASC, id DESC",

        (err, results) => {

            if (err) {

                console.error(err);

                return res.status(500).json({ message: "حدث خطأ في قاعدة البيانات" });

            }

            res.json(results);

        }

    );

});



// إضافة إعلان

app.post("/api/banners", requireAdmin, upload.single("image"), (req, res) => {

    const { title, description, sort_order } = req.body;



    if (!req.file) {

        return res.status(400).json({ message: "صورة الإعلان مطلوبة" });

    }



    const image = req.file.path;

    const sql = `

        INSERT INTO banners (title, description, image, sort_order, is_active)

        VALUES (?, ?, ?, ?, 1)

    `;



    db.query(

        sql,

        [title || null, description || null, image, Number(sort_order) || 0],

        (err, result) => {

            if (err) {

                deleteImage(image);

                console.error(err);

                return res.status(500).json({ message: "تعذر إضافة الإعلان" });

            }

            res.status(201).json({ message: "تمت إضافة الإعلان بنجاح", id: result.insertId, image });

        }

    );

});



// حذف إعلان



app.delete("/api/banners/:id", requireAdmin, (req, res) => {



    const { id } = req.params;







    db.query(



        "SELECT image FROM banners WHERE id = ?",



        [id],



        async (err, results) => {



            if (err) {



                console.error(err);



                return res.status(500).json({



                    message: "حدث خطأ في قاعدة البيانات"



                });



            }







            if (results.length === 0) {



                return res.status(404).json({



                    message: "الإعلان غير موجود"



                });



            }







            const imageUrl = results[0].image;







            db.query(



                "DELETE FROM banners WHERE id = ?",



                [id],



                async (err) => {



                    if (err) {



                        console.error(err);



                        return res.status(500).json({



                            message: "حدث خطأ أثناء حذف الإعلان"



                        });



                    }







                    await deleteImage(imageUrl);







                    res.json({



                        message: "تم حذف الإعلان بنجاح"



                    });



                }



            );



        }



    );



});







// تعديل الإعلان



app.put("/api/banners/:id", requireAdmin, upload.single("image"), (req, res) => {



    const { id } = req.params;



    const { title, description, sort_order, is_active } = req.body;







    db.query(



        "SELECT * FROM banners WHERE id = ?",



        [id],



        (err, results) => {



            if (err) {



                console.error(err);



                return res.status(500).json({



                    message: "حدث خطأ في قاعدة البيانات"



                });



            }







            if (results.length === 0) {



                return res.status(404).json({



                    message: "الإعلان غير موجود"



                });



            }







            const oldBanner = results[0];



            const newImage = req.file ? req.file.path : oldBanner.image;







            const sql = `



                UPDATE banners



                SET title = ?,



                    description = ?,



                    image = ?,



                    sort_order = ?,



                    is_active = ?



                WHERE id = ?



            `;







            db.query(



                sql,



                [



                    title ?? oldBanner.title,



                    description ?? oldBanner.description,



                    newImage,



                    sort_order !== undefined



                        ? Number(sort_order)



                        : oldBanner.sort_order,



                    is_active !== undefined



                        ? Number(is_active)



                        : oldBanner.is_active,



                    id



                ],



                async (err) => {



                    if (err) {



                        console.error(err);



                        return res.status(500).json({



                            message: "حدث خطأ أثناء تعديل الإعلان"



                        });



                    }







                    // إذا تم رفع صورة جديدة، نحذف القديمة من Cloudinary



                    if (req.file && oldBanner.image !== newImage) {



                        await deleteImage(oldBanner.image);



                    }







                    res.json({



                        message: "تم تعديل الإعلان بنجاح"



                    });



                }



            );



        }



    );



});











// إظهار أو إخفاء الإعلان



app.patch("/api/banners/:id/status", requireAdmin, (req, res) => {



    const { id } = req.params;



    const { is_active } = req.body;







    if (![0, 1, "0", "1"].includes(is_active)) {



        return res.status(400).json({



            message: "حالة الإعلان غير صحيحة"



        });



    }







    db.query(



        "UPDATE banners SET is_active = ? WHERE id = ?",



        [Number(is_active), id],



        (err, result) => {



            if (err) {



                console.error(err);



                return res.status(500).json({



                    message: "حدث خطأ أثناء تغيير حالة الإعلان"



                });



            }







            if (result.affectedRows === 0) {



                return res.status(404).json({



                    message: "الإعلان غير موجود"



                });



            }







            res.json({



                message: Number(is_active)



                    ? "تم إظهار الإعلان"



                    : "تم إخفاء الإعلان"



            });



        }



    );



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



            address,



            facebook,



            instagram,



            developer_whatsapp



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



                        facebook,



                        instagram,



                        developer_whatsapp,



                        logo



                    )



                    VALUES



                    (



                        1, ?, ?, ?, ?, ?, ?, ?, ?, ?



                    )



                    ON DUPLICATE KEY UPDATE



                        shop_name = VALUES(shop_name),



                        description = VALUES(description),



                        phone = VALUES(phone),



                        whatsapp = VALUES(whatsapp),



                        address = VALUES(address),



                        facebook = VALUES(facebook),



                        instagram = VALUES(instagram),



                        developer_whatsapp = VALUES(developer_whatsapp),



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



                        facebook || null,



                        instagram || null,



                        developer_whatsapp || null,



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
// COMMERCE / CART / ORDERS
// ========================================

function normalizePhone(value) {
    return String(value || "").replace(/\D/g, "");
}

function roundMoney(value) {
    const number = Number(value || 0);
    return Math.round(Number.isFinite(number) ? number : 0);
}

function clampPercent(value) {
    const number = Number(value || 0);
    if (!Number.isFinite(number)) return 0;
    return Math.min(100, Math.max(0, number));
}

function safeText(value, maxLength = 255) {
    const text = String(value || "").trim();
    return text ? text.slice(0, maxLength) : null;
}

function generateOrderCode() {
    const now = new Date();
    const date = [
        String(now.getFullYear()).slice(-2),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0")
    ].join("");
    const random = crypto.randomBytes(4).toString("hex").toUpperCase();
    return `KRM-${date}-${random}`;
}

const ORDER_STATUS_LABELS = {
    pending: "بانتظار موافقة المحمصة",
    preparing: "جاري تجهيز الطلب",
    ready: "جاهز للاستلام",
    out_for_delivery: "خرج للتوصيل",
    completed: "تم تسليم الطلب",
    rejected: "تم رفض الطلب",
    cancelled: "ألغاه الزبون"
};

function orderStatusLabel(status) {
    return ORDER_STATUS_LABELS[status] || status;
}

async function loadCommerceSettings() {
    const [rows] = await dbp.query(
        `SELECT discount_percent, discount_min_subtotal, delivery_fee, orders_enabled, delivery_enabled
         FROM settings WHERE id = 1 LIMIT 1`
    );

    const settings = rows[0] || {};

    return {
        discount_percent: clampPercent(settings.discount_percent),
        discount_min_subtotal: Math.max(0, roundMoney(settings.discount_min_subtotal)),
        delivery_fee: Math.max(0, roundMoney(settings.delivery_fee)),
        orders_enabled: Number(settings.orders_enabled ?? 1) === 1,
        delivery_enabled: Number(settings.delivery_enabled ?? 1) === 1
    };
}

async function calculateOrderQuote(rawItems, fulfillmentType = "pickup") {
    const items = Array.isArray(rawItems) ? rawItems : [];

    if (!items.length || items.length > 50) {
        const error = new Error("السلة فارغة أو تحتوي عددًا كبيرًا من الأصناف");
        error.status = 400;
        throw error;
    }

    const settings = await loadCommerceSettings();

    if (!settings.orders_enabled) {
        const error = new Error("استقبال الطلبات متوقف مؤقتًا");
        error.status = 503;
        throw error;
    }

    if (fulfillmentType === "delivery" && !settings.delivery_enabled) {
        const error = new Error("خدمة التوصيل غير متاحة حاليًا");
        error.status = 400;
        throw error;
    }

    const productIds = items.map((item) => Number(item.product_id));

    if (productIds.some((id) => !Number.isInteger(id) || id <= 0)) {
        const error = new Error("أحد المنتجات المطلوبة غير صحيح");
        error.status = 400;
        throw error;
    }

    const uniqueIds = [...new Set(productIds)];
    const placeholders = uniqueIds.map(() => "?").join(",");

    const [products] = await dbp.query(
        `SELECT id, name, price, image, sale_type, unit_label,
                min_weight_grams, weight_step_grams,
                allow_amount_order, is_orderable
         FROM products
         WHERE id IN (${placeholders})`,
        uniqueIds
    );

    const productMap = new Map(
        products.map((product) => [Number(product.id), product])
    );

    const lines = [];
    let subtotal = 0;

    for (const requested of items) {
        const product = productMap.get(Number(requested.product_id));

        if (!product) {
            const error = new Error("أحد المنتجات لم يعد موجودًا");
            error.status = 400;
            throw error;
        }

        if (Number(product.is_orderable ?? 1) !== 1) {
            const error = new Error(`المنتج «${product.name}» غير متاح للطلب حاليًا`);
            error.status = 400;
            throw error;
        }

        const saleType = product.sale_type === "weight" ? "weight" : "unit";
        const unitPrice = Number(product.price || 0);

        if (!Number.isFinite(unitPrice) || unitPrice < 0) {
            const error = new Error(`سعر المنتج «${product.name}» غير صحيح`);
            error.status = 400;
            throw error;
        }

        let selectionMode = "unit";
        let quantity = null;
        let weightGrams = null;
        let requestedAmount = null;
        let lineTotal = 0;

        if (saleType === "unit") {
            quantity = Math.floor(Number(requested.quantity || 0));

            if (!Number.isFinite(quantity) || quantity < 1 || quantity > 999) {
                const error = new Error(`الكمية المطلوبة للمنتج «${product.name}» غير صحيحة`);
                error.status = 400;
                throw error;
            }

            lineTotal = roundMoney(unitPrice * quantity);
        } else {
            if (unitPrice <= 0) {
                const error = new Error(`سعر الكيلو للمنتج «${product.name}» غير صحيح`);
                error.status = 400;
                throw error;
            }

            const minWeight = Math.max(1, Number(product.min_weight_grams || 100));
            const weightStep = Math.max(1, Number(product.weight_step_grams || 50));
            const allowAmountOrder = Number(product.allow_amount_order || 0) === 1;

            selectionMode = requested.selection_mode === "amount" ? "amount" : "weight";

            if (selectionMode === "amount") {
                if (!allowAmountOrder) {
                    const error = new Error(`الطلب حسب المبلغ غير متاح للمنتج «${product.name}»`);
                    error.status = 400;
                    throw error;
                }

                requestedAmount = roundMoney(requested.requested_amount);
                const minimumAmount = Math.max(1, roundMoney(unitPrice * minWeight / 1000));

                if (
                    !Number.isFinite(requestedAmount) ||
                    requestedAmount < minimumAmount ||
                    requestedAmount > 1000000000
                ) {
                    const error = new Error(
                        `أقل مبلغ للمنتج «${product.name}» هو ${minimumAmount} ل.س`
                    );
                    error.status = 400;
                    throw error;
                }

                lineTotal = requestedAmount;
                weightGrams = Math.round((requestedAmount / unitPrice) * 1000 * 10) / 10;
            } else {
                weightGrams = Number(requested.weight_grams || 0);

                if (
                    !Number.isFinite(weightGrams) ||
                    weightGrams < minWeight ||
                    weightGrams > 100000
                ) {
                    const error = new Error(
                        `أقل وزن للمنتج «${product.name}» هو ${minWeight} غرام`
                    );
                    error.status = 400;
                    throw error;
                }

                const stepDifference = Math.abs(weightGrams / weightStep - Math.round(weightGrams / weightStep));
                if (stepDifference > 0.000001) {
                    const error = new Error(
                        `وزن «${product.name}» يجب أن يكون بمضاعفات ${weightStep} غرام`
                    );
                    error.status = 400;
                    throw error;
                }

                lineTotal = roundMoney(unitPrice * weightGrams / 1000);
            }
        }

        subtotal += lineTotal;

        lines.push({
            product_id: Number(product.id),
            product_name: product.name,
            product_image: product.image || null,
            sale_type: saleType,
            selection_mode: selectionMode,
            unit_label: product.unit_label || (saleType === "weight" ? "كغ" : "قطعة"),
            unit_price: unitPrice,
            quantity,
            weight_grams: weightGrams,
            requested_amount: requestedAmount,
            item_note: safeText(requested.item_note, 255),
            line_total: lineTotal
        });
    }

    subtotal = roundMoney(subtotal);
    // شرط الخصم يُحسب على مجموع المنتجات فقط، دون إضافة رسوم التوصيل.
    const discountMinimum = settings.discount_min_subtotal;
    const discountEligible = settings.discount_percent > 0 && subtotal >= discountMinimum;
    const discountPercent = discountEligible ? settings.discount_percent : 0;
    const discountAmount = roundMoney(subtotal * discountPercent / 100);
    // أجرة التوصيل تُضاف بعد حساب الخصم، ولا تُخصم منها أي نسبة.
    const deliveryFee = fulfillmentType === "delivery" ? settings.delivery_fee : 0;
    const totalAfterDiscount = Math.max(0, roundMoney(subtotal - discountAmount));
    const finalTotal = Math.max(0, roundMoney(totalAfterDiscount + deliveryFee));

    return {
        items: lines,
        subtotal,
        discount_percent: discountPercent,
        discount_min_subtotal: discountMinimum,
        discount_eligible: discountEligible,
        discount_remaining: Math.max(0, roundMoney(discountMinimum - subtotal)),
        discount_amount: discountAmount,
        total_after_discount: totalAfterDiscount,
        delivery_fee: deliveryFee,
        total: finalTotal
    };
}

// إعداد طريقة بيع المنتج: قطعة/علبة أو وزن، مع إمكانية الطلب حسب المبلغ.
app.patch("/api/admin/products/:id/sale-config", requireAdmin, async (req, res) => {
    const productId = Number(req.params.id);

    if (!Number.isInteger(productId) || productId <= 0) {
        return res.status(400).json({ message: "رقم المنتج غير صحيح" });
    }

    const saleType = req.body.sale_type === "weight" ? "weight" : "unit";
    const unitLabel = saleType === "weight"
        ? "كغ"
        : (safeText(req.body.unit_label, 40) || "قطعة");
    const minWeightGrams = saleType === "weight"
        ? Math.max(1, Math.floor(Number(req.body.min_weight_grams || 100)))
        : 100;
    const weightStepGrams = saleType === "weight"
        ? Math.max(1, Math.floor(Number(req.body.weight_step_grams || 50)))
        : 50;
    const allowAmountOrder = saleType === "weight" && Number(req.body.allow_amount_order) === 1 ? 1 : 0;
    const isOrderable = Number(req.body.is_orderable) === 0 ? 0 : 1;

    if (
        !Number.isFinite(minWeightGrams) || minWeightGrams > 100000 ||
        !Number.isFinite(weightStepGrams) || weightStepGrams > 100000
    ) {
        return res.status(400).json({ message: "إعدادات الوزن غير صحيحة" });
    }

    try {
        const [result] = await dbp.query(
            `UPDATE products
             SET sale_type = ?, unit_label = ?, min_weight_grams = ?,
                 weight_step_grams = ?, allow_amount_order = ?, is_orderable = ?
             WHERE id = ?`,
            [
                saleType,
                unitLabel,
                minWeightGrams,
                weightStepGrams,
                allowAmountOrder,
                isOrderable,
                productId
            ]
        );

        if (!result.affectedRows) {
            return res.status(404).json({ message: "المنتج غير موجود" });
        }

        res.json({ message: "تم حفظ طريقة بيع المنتج" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "تعذر حفظ طريقة بيع المنتج" });
    }
});

app.get("/api/commerce/settings", async (req, res) => {
    try {
        res.json(await loadCommerceSettings());
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "تعذر تحميل إعدادات الطلبات" });
    }
});

app.put("/api/admin/commerce/settings", requireAdmin, async (req, res) => {
    const discountPercent = clampPercent(req.body.discount_percent);
    // حفظ الإعدادات القديمة لا يمسح الحد الأدنى إن لم يُرسل الحقل الجديد.
    const hasMinimum = Object.prototype.hasOwnProperty.call(req.body || {}, "discount_min_subtotal");
    const rawMinimum = hasMinimum ? Number(req.body.discount_min_subtotal) : null;
    if (hasMinimum && (!Number.isFinite(rawMinimum) || rawMinimum < 0 || rawMinimum > 1000000000)) {
        return res.status(400).json({ message: "الحد الأدنى للخصم يجب أن يكون مبلغًا بين 0 ومليار ليرة" });
    }
    const discountMinimum = hasMinimum ? roundMoney(rawMinimum) : null;
    const deliveryFee = Math.max(0, roundMoney(req.body.delivery_fee));
    const ordersEnabled = Number(req.body.orders_enabled) === 0 ? 0 : 1;
    const deliveryEnabled = Number(req.body.delivery_enabled) === 0 ? 0 : 1;

    if (!Number.isFinite(deliveryFee) || deliveryFee > 1000000000) {
        return res.status(400).json({ message: "رسوم التوصيل غير صحيحة" });
    }

    try {
        const [result] = await dbp.query(
            `UPDATE settings
             SET discount_percent = ?, discount_min_subtotal = COALESCE(?, discount_min_subtotal),
                 delivery_fee = ?, orders_enabled = ?, delivery_enabled = ?
             WHERE id = 1`,
            [discountPercent, discountMinimum, deliveryFee, ordersEnabled, deliveryEnabled]
        );

        if (!result.affectedRows) {
            return res.status(404).json({ message: "إعدادات المحمصة غير موجودة" });
        }

        res.json({
            message: "تم حفظ إعدادات الطلبات",
            ...await loadCommerceSettings()
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "تعذر حفظ إعدادات الطلبات" });
    }
});

// تسعير السلة من السيرفر: السعر الكامل + الحسم + رسوم التوصيل + النهائي.
app.post("/api/orders/quote", async (req, res) => {
    const fulfillmentType = req.body.fulfillment_type === "delivery" ? "delivery" : "pickup";

    try {
        const quote = await calculateOrderQuote(req.body.items, fulfillmentType);
        res.json(quote);
    } catch (error) {
        console.error(error);
        res.status(error.status || 500).json({
            message: error.status ? error.message : "تعذر حساب السلة"
        });
    }
});

app.post("/api/orders", async (req, res) => {
    const customerName = safeText(req.body.customer_name, 120);
    const customerPhone = safeText(req.body.customer_phone, 50);
    const fulfillmentType = req.body.fulfillment_type === "delivery" ? "delivery" : "pickup";
    const deliveryAddress = safeText(req.body.delivery_address, 500);
    const deliveryLat = [null, undefined, ""].includes(req.body.delivery_lat)
        ? null
        : Number(req.body.delivery_lat);
    const deliveryLng = [null, undefined, ""].includes(req.body.delivery_lng)
        ? null
        : Number(req.body.delivery_lng);
    const notes = safeText(req.body.notes, 1000);

    if (!customerName || !customerPhone) {
        return res.status(400).json({ message: "الاسم ورقم الهاتف مطلوبان" });
    }

    const cleanPhone = normalizePhone(customerPhone);
    if (cleanPhone.length < 6 || cleanPhone.length > 20) {
        return res.status(400).json({ message: "رقم الهاتف غير صحيح" });
    }

    if (fulfillmentType === "delivery") {
        const validCoords =
            Number.isFinite(deliveryLat) &&
            Number.isFinite(deliveryLng) &&
            Math.abs(deliveryLat) <= 90 &&
            Math.abs(deliveryLng) <= 180;

        // إذا تعذر GPS، نسمح بوصف عنوان واضح كبديل حتى لا نخسر الطلب.
        if (!validCoords && !deliveryAddress) {
            return res.status(400).json({
                message: "للتوصيل أرسل موقعك الحالي أو اكتب وصفًا واضحًا للعنوان"
            });
        }
    }

    try {
        // لا نثق بأي سعر قادم من المتصفح. كل الأسعار والحسم يعاد حسابها من قاعدة البيانات.
        const quote = await calculateOrderQuote(req.body.items, fulfillmentType);
        const orderCode = generateOrderCode();
        const trackingToken = crypto.randomUUID();
        const connection = await commercePool.getConnection();

        try {
            await connection.beginTransaction();

            const [orderResult] = await connection.query(
                `INSERT INTO orders
                (order_code, tracking_token, customer_name, customer_phone,
                 fulfillment_type, delivery_address, delivery_lat, delivery_lng,
                 notes, payment_method, status, subtotal, discount_percent,
                 discount_amount, delivery_fee, total)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'cash', 'pending', ?, ?, ?, ?, ?)`,
                [
                    orderCode,
                    trackingToken,
                    customerName,
                    customerPhone,
                    fulfillmentType,
                    fulfillmentType === "delivery" ? deliveryAddress : null,
                    fulfillmentType === "delivery" && Number.isFinite(deliveryLat) ? deliveryLat : null,
                    fulfillmentType === "delivery" && Number.isFinite(deliveryLng) ? deliveryLng : null,
                    notes,
                    quote.subtotal,
                    quote.discount_percent,
                    quote.discount_amount,
                    quote.delivery_fee,
                    quote.total
                ]
            );

            const orderId = orderResult.insertId;

            for (const line of quote.items) {
                await connection.query(
                    `INSERT INTO order_items
                    (order_id, product_id, product_name, product_image,
                     sale_type, selection_mode, unit_label, unit_price,
                     quantity, weight_grams, requested_amount, item_note, line_total)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        orderId,
                        line.product_id,
                        line.product_name,
                        line.product_image,
                        line.sale_type,
                        line.selection_mode,
                        line.unit_label,
                        line.unit_price,
                        line.quantity,
                        line.weight_grams,
                        line.requested_amount,
                        line.item_note,
                        line.line_total
                    ]
                );
            }

            await connection.query(
                `INSERT INTO order_status_history (order_id, status, note)
                 VALUES (?, 'pending', 'تم إرسال الطلب من الزبون')`,
                [orderId]
            );

            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

        res.status(201).json({
            message: "تم إرسال الطلب للمحمصة",
            order_code: orderCode,
            tracking_token: trackingToken,
            status: "pending",
            status_label: orderStatusLabel("pending"),
            payment_method: "cash",
            fulfillment_type: fulfillmentType,
            subtotal: quote.subtotal,
            discount_percent: quote.discount_percent,
            discount_amount: quote.discount_amount,
            total_after_discount: quote.total_after_discount,
            delivery_fee: quote.delivery_fee,
            total: quote.total
        });
    } catch (error) {
        console.error(error);
        res.status(error.status || 500).json({
            message: error.status ? error.message : "تعذر إنشاء الطلب، حاول مرة أخرى"
        });
    }
});

async function getOrderBundle(whereSql, params) {
    const [orders] = await dbp.query(
        `SELECT * FROM orders WHERE ${whereSql} LIMIT 1`,
        params
    );

    if (!orders.length) return null;

    const order = orders[0];
    order.status_label = orderStatusLabel(order.status);

    const [items] = await dbp.query(
        "SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC",
        [order.id]
    );

    const [history] = await dbp.query(
        `SELECT status, note, created_at
         FROM order_status_history
         WHERE order_id = ?
         ORDER BY id ASC`,
        [order.id]
    );

    return {
        order,
        items,
        history: history.map((entry) => ({
            ...entry,
            status_label: orderStatusLabel(entry.status)
        }))
    };
}

// التتبع الأساسي يتم بالتوكن المخزن عند الزبون داخل الـPWA.
app.get("/api/orders/track/:token", async (req, res) => {
    const token = String(req.params.token || "").trim();

    if (!/^[0-9a-f-]{36}$/i.test(token)) {
        return res.status(400).json({ message: "رمز تتبع الطلب غير صحيح" });
    }

    try {
        const bundle = await getOrderBundle("tracking_token = ?", [token]);

        if (!bundle) {
            return res.status(404).json({ message: "الطلب غير موجود" });
        }

        res.json(bundle);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "تعذر جلب حالة الطلب" });
    }
});

// بديل في حال فتح الزبون الموقع من جهاز آخر: رقم الطلب + رقم الهاتف.
app.post("/api/orders/lookup", async (req, res) => {
    const code = String(req.body.order_code || "").trim().toUpperCase().slice(0, 40);
    const phone = normalizePhone(req.body.phone);

    if (!code || !phone) {
        return res.status(400).json({ message: "رقم الطلب ورقم الهاتف مطلوبان" });
    }

    try {
        const bundle = await getOrderBundle("UPPER(order_code) = ?", [code]);

        if (!bundle || normalizePhone(bundle.order.customer_phone) !== phone) {
            return res.status(404).json({ message: "لم يتم العثور على طلب بهذه البيانات" });
        }

        res.json(bundle);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "تعذر البحث عن الطلب" });
    }
});

// تعديل محتويات الطلب محمي برمز التتبع السري، ومسموح فقط قبل قبول المحمصة.
// لا نسمح للمتصفح بتحديد المجموع؛ الحساب يتم مجددًا على السيرفر.
function validOrderTrackingToken(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        String(value || "")
    );
}

app.put("/api/orders/track/:token/items", async (req, res) => {
    const token = String(req.params.token || "").trim();
    if (!validOrderTrackingToken(token)) {
        return res.status(400).json({ message: "رمز الطلب غير صحيح" });
    }

    const items = req.body?.items;
    if (!Array.isArray(items) || !items.length || items.length > 50) {
        return res.status(400).json({ message: "اختر منتجًا واحدًا على الأقل (حتى 50 صنفًا)" });
    }

    let connection;
    try {
        connection = await commercePool.getConnection();
        await connection.beginTransaction();
        // قفل الصف يمنع قبول الطلب في الوقت نفسه الذي يغيّره فيه الزبون.
        const [rows] = await connection.query(
            "SELECT id, status, fulfillment_type FROM orders WHERE tracking_token = ? FOR UPDATE",
            [token]
        );
        if (!rows.length) {
            await connection.rollback();
            return res.status(404).json({ message: "الطلب غير موجود" });
        }
        const order = rows[0];
        if (order.status !== "pending") {
            await connection.rollback();
            return res.status(409).json({
                message: "لا يمكن تعديل الطلب بعد قبوله أو إلغائه"
            });
        }

        const quote = await calculateOrderQuote(items, order.fulfillment_type);
        // الحذف وإعادة الإدراج ضمن معاملة واحدة؛ عند الفشل يبقى الطلب القديم كما هو.
        await connection.query("DELETE FROM order_items WHERE order_id = ?", [order.id]);
        for (const line of quote.items) {
            await connection.query(
                `INSERT INTO order_items
                 (order_id, product_id, product_name, product_image,
                  sale_type, selection_mode, unit_label, unit_price,
                  quantity, weight_grams, requested_amount, item_note, line_total)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    order.id, line.product_id, line.product_name, line.product_image,
                    line.sale_type, line.selection_mode, line.unit_label, line.unit_price,
                    line.quantity, line.weight_grams, line.requested_amount,
                    line.item_note, line.line_total
                ]
            );
        }
        await connection.query(
            `UPDATE orders SET subtotal = ?, discount_percent = ?, discount_amount = ?,
                 delivery_fee = ?, total = ? WHERE id = ?`,
            [
                quote.subtotal, quote.discount_percent, quote.discount_amount,
                quote.delivery_fee, quote.total, order.id
            ]
        );
        await connection.query(
            `INSERT INTO order_status_history (order_id, status, note)
             VALUES (?, 'pending', 'عدّل الزبون محتويات الطلب قبل الموافقة')`,
            [order.id]
        );
        await connection.commit();
        res.set("Cache-Control", "no-store");
        res.json({ message: "تم تعديل طلبك بنجاح", status: "pending", quote });
    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch (rollbackError) { console.error(rollbackError); }
        }
        console.error(error);
        res.status(error.status || 500).json({
            message: error.status ? error.message : "تعذر تعديل الطلب، حاول مجددًا"
        });
    } finally {
        if (connection) connection.release();
    }
});

app.post("/api/orders/track/:token/cancel", async (req, res) => {
    const token = String(req.params.token || "").trim();
    if (!validOrderTrackingToken(token)) {
        return res.status(400).json({ message: "رمز الطلب غير صحيح" });
    }

    let connection;
    try {
        connection = await commercePool.getConnection();
        await connection.beginTransaction();
        const [rows] = await connection.query(
            "SELECT id, status FROM orders WHERE tracking_token = ? FOR UPDATE",
            [token]
        );
        if (!rows.length) {
            await connection.rollback();
            return res.status(404).json({ message: "الطلب غير موجود" });
        }
        if (rows[0].status !== "pending") {
            await connection.rollback();
            return res.status(409).json({ message: "لا يمكن إلغاء الطلب بعد قبوله أو إلغائه" });
        }
        await connection.query(
            "UPDATE orders SET status = 'cancelled' WHERE id = ?",
            [rows[0].id]
        );
        await connection.query(
            `INSERT INTO order_status_history (order_id, status, note)
             VALUES (?, 'cancelled', 'ألغى الزبون الطلب قبل الموافقة')`,
            [rows[0].id]
        );
        await connection.commit();
        res.set("Cache-Control", "no-store");
        res.json({ message: "تم إلغاء طلبك", status: "cancelled", status_label: "ألغاه الزبون" });
    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch (rollbackError) { console.error(rollbackError); }
        }
        console.error(error);
        res.status(500).json({ message: "تعذر إلغاء الطلب، حاول مجددًا" });
    } finally {
        if (connection) connection.release();
    }
});

app.get("/api/admin/orders", requireAdmin, async (req, res) => {
    const requestedStatus = String(req.query.status || "").trim();
    const allowedStatuses = new Set([
        "pending",
        "preparing",
        "ready",
        "out_for_delivery",
        "completed",
        "rejected",
        "cancelled"
    ]);

    try {
        let sql = `
            SELECT o.*,
                   (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
            FROM orders o
        `;
        const params = [];

        if (requestedStatus && allowedStatuses.has(requestedStatus)) {
            sql += " WHERE o.status = ? ";
            params.push(requestedStatus);
        }

        sql += `
            ORDER BY FIELD(
                o.status,
                'pending', 'preparing', 'ready', 'out_for_delivery', 'completed', 'rejected', 'cancelled'
            ), o.id DESC
            LIMIT 500
        `;

        const [rows] = await dbp.query(sql, params);
        res.json(rows.map((order) => ({
            ...order,
            status_label: orderStatusLabel(order.status)
        })));
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "تعذر جلب الطلبات" });
    }
});

app.get("/api/admin/orders/:id", requireAdmin, async (req, res) => {
    const orderId = Number(req.params.id);

    if (!Number.isInteger(orderId) || orderId <= 0) {
        return res.status(400).json({ message: "رقم الطلب غير صحيح" });
    }

    try {
        const bundle = await getOrderBundle("id = ?", [orderId]);

        if (!bundle) {
            return res.status(404).json({ message: "الطلب غير موجود" });
        }

        res.json(bundle);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "تعذر جلب الطلب" });
    }
});

app.patch("/api/admin/orders/:id/status", requireAdmin, async (req, res) => {
    const orderId = Number(req.params.id);
    const nextStatus = String(req.body.status || "").trim();
    const adminNote = safeText(req.body.note, 255);
    const allowedStatuses = new Set([
        "pending", "preparing", "ready", "out_for_delivery", "completed", "rejected"
    ]);

    if (!Number.isInteger(orderId) || orderId <= 0 || !allowedStatuses.has(nextStatus)) {
        return res.status(400).json({ message: "بيانات حالة الطلب غير صحيحة" });
    }

    let connection;
    try {
        connection = await commercePool.getConnection();
        await connection.beginTransaction();
        // نفس قفل التعديل والإلغاء: إجراء واحد فقط يفوز إذا حدثا معًا.
        const [rows] = await connection.query(
            "SELECT id, status, fulfillment_type FROM orders WHERE id = ? FOR UPDATE",
            [orderId]
        );
        if (!rows.length) {
            await connection.rollback();
            return res.status(404).json({ message: "الطلب غير موجود" });
        }
        const order = rows[0];
        if (order.status === "cancelled") {
            await connection.rollback();
            return res.status(409).json({ message: "الزبون ألغى الطلب، ولا يمكن إعادة تفعيله" });
        }
        if (nextStatus === "pending" && order.status !== "pending") {
            await connection.rollback();
            return res.status(409).json({ message: "لا يمكن إعادة الطلب المقبول إلى انتظار الموافقة" });
        }
        if (nextStatus === "ready" && order.fulfillment_type === "delivery") {
            await connection.rollback();
            return res.status(400).json({ message: "طلب التوصيل استخدم له حالة «خرج للتوصيل»" });
        }
        if (nextStatus === "out_for_delivery" && order.fulfillment_type !== "delivery") {
            await connection.rollback();
            return res.status(400).json({ message: "هذا الطلب للاستلام من المحمصة وليس للتوصيل" });
        }

        let timestampSql = "";
        if (nextStatus === "preparing") {
            timestampSql = ", accepted_at = COALESCE(accepted_at, CURRENT_TIMESTAMP)";
        } else if (nextStatus === "ready" || nextStatus === "out_for_delivery") {
            timestampSql = ", ready_at = COALESCE(ready_at, CURRENT_TIMESTAMP)";
        } else if (nextStatus === "completed") {
            timestampSql = ", completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)";
        }
        await connection.query(
            `UPDATE orders SET status = ?${timestampSql} WHERE id = ?`,
            [nextStatus, orderId]
        );
        await connection.query(
            `INSERT INTO order_status_history (order_id, status, note) VALUES (?, ?, ?)`,
            [orderId, nextStatus, adminNote || `تم تحديث الحالة إلى: ${orderStatusLabel(nextStatus)}`]
        );
        await connection.commit();
        res.json({ message: "تم تحديث حالة الطلب", status: nextStatus,
            status_label: orderStatusLabel(nextStatus) });
    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch (rollbackError) { console.error(rollbackError); }
        }
        console.error(error);
        res.status(500).json({ message: "تعذر تحديث حالة الطلب" });
    } finally {
        if (connection) connection.release();
    }
});

// ========================================



// معالجة أخطاء رفع الملفات



// ========================================







app.use((err, req, res, next) => {







    if (err instanceof multer.MulterError) {







        if (err.code === "LIMIT_FILE_SIZE") {



            return res.status(400).json({



                message:



                    "حجم الصورة يجب ألا يتجاوز 20MB"



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







// لا نستقبل طلبات قبل التأكد من جاهزية جدول الجلسات واتصال Aiven.
// إذا فشلت تهيئة المخزن نوقف التشغيل بدل جلسات لا تُحفظ بصمت.
adminSessionStore.onReady().then(() => {
    console.log("Admin MySQL session store ready");
    app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on port ${PORT}`);
    });
}).catch((error) => {
    console.error("Cannot initialize admin MySQL session store:", error);
    process.exit(1);
});