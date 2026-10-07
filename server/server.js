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

            "http://localhost:5500",

            "http://9.9.9.84:5500",

            "https://mahmasa-catalog-1.onrender.com"

        ],

        credentials: true

    })

);

app.use(express.json());



app.set("trust proxy",1);

app.use(

    session({

        secret: process.env.SESSION_SECRET,

        resave: false,

        saveUninitialized: false,

        cookie: {

            httpOnly: true,

            secure:true,

            sameSite: "none",

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



app.listen(PORT, "0.0.0.0", () => {

    console.log(`Server running on port ${PORT}`);

});