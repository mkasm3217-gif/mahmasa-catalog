const PRODUCTS_API =
    "http://localhost:3000/api/products";

const CATEGORIES_API =
    "http://localhost:3000/api/categories";

const SETTINGS_API =
    "http://localhost:3000/api/settings";

const IMAGE_URL =
    "http://localhost:3000/images/";


let allProducts = [];

let allCategories = [];

let currentCategory = "all";

let currentSearch = "";

let shopSettings = null;


// ========================================
// ELEMENTS
// ========================================

const productsGrid =
    document.getElementById(
        "productsGrid"
    );

const categoriesContainer =
    document.getElementById(
        "categoriesContainer"
    );

const productSearch =
    document.getElementById(
        "productSearch"
    );

const loadingState =
    document.getElementById(
        "loadingState"
    );

const emptyState =
    document.getElementById(
        "emptyState"
    );


const productModal =
    document.getElementById(
        "productModal"
    );

const closeProductModalButton =
    document.getElementById(
        "closeProductModal"
    );


// ========================================
// INITIALIZE
// ========================================

async function initializeCatalog() {

    showLoading(true);


    const results =
        await Promise.allSettled([

            loadSettings(),

            loadCategories(),

            loadProducts()

        ]);


    results.forEach((result) => {

        if (
            result.status ===
            "rejected"
        ) {

            console.error(
                result.reason
            );

        }

    });


    showLoading(false);

    displayCategories();

    filterProducts();

}


initializeCatalog();


// ========================================
// SETTINGS
// ========================================

async function loadSettings() {

    const response =
        await fetch(
            SETTINGS_API
        );


    if (!response.ok) {

        throw new Error(
            "فشل تحميل إعدادات المحمصة"
        );

    }


    shopSettings =
        await response.json();


    applySettings();

}


function applySettings() {

    if (!shopSettings) {
        return;
    }


    const name =
        shopSettings.shop_name ||
        "المحمصة";


    const description =
        shopSettings.description ||
        "اختر ما يناسبك من منتجاتنا بعناية.";


    document.title =
        `${name} | كتالوج المنتجات`;


    document
        .getElementById(
            "brandName"
        )
        .textContent =
            name;


    document
        .getElementById(
            "heroShopName"
        )
        .textContent =
            `أهلاً بكم في ${name}`;


    document
        .getElementById(
            "shopDescription"
        )
        .textContent =
            description;


    document
        .getElementById(
            "footerShopName"
        )
        .textContent =
            name;


    setLogo(
        "brandLogo",
        name
    );


    setLogo(
        "heroLogo",
        name
    );


    document
        .getElementById(
            "contactPhone"
        )
        .textContent =
            shopSettings.phone ||
            "—";


    document
        .getElementById(
            "contactWhatsapp"
        )
        .textContent =
            shopSettings.whatsapp ||
            "—";


    document
        .getElementById(
            "contactAddress"
        )
        .textContent =
            shopSettings.address ||
            "—";


    configureWhatsapp();

}


function setLogo(
    elementId,
    shopName
) {

    const element =
        document.getElementById(
            elementId
        );


    if (
        shopSettings &&
        shopSettings.logo
    ) {

        element.innerHTML = `

            <img
                src="${IMAGE_URL}${encodeURIComponent(shopSettings.logo)}"
                alt="${escapeHtml(shopName)}"
            >

        `;

    } else {

        element.textContent =
            shopName.charAt(0) ||
            "م";

    }

}


// ========================================
// WHATSAPP
// ========================================

function configureWhatsapp() {

    const button =
        document.getElementById(
            "whatsappButton"
        );


    const whatsapp =
        String(
            shopSettings.whatsapp ||
            ""
        );


    const cleanNumber =
        whatsapp.replace(
            /\D/g,
            ""
        );


    if (!cleanNumber) {

        button.classList.add(
            "hidden"
        );

        return;

    }


    const message =
        `مرحباً، أريد الاستفسار عن منتجات ${shopSettings.shop_name || "المحمصة"}`;


    button.href =
        `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`;


    button.classList.remove(
        "hidden"
    );

}


// ========================================
// CATEGORIES
// ========================================

async function loadCategories() {

    const response =
        await fetch(
            CATEGORIES_API
        );


    if (!response.ok) {

        throw new Error(
            "فشل تحميل الأقسام"
        );

    }


    allCategories =
        await response.json();

}


function displayCategories() {

    categoriesContainer.innerHTML = `

        <button
            type="button"
            class="category-button active"
            data-category="all"
        >
            الكل
        </button>

    `;


    allCategories.forEach(
        (category) => {

            const button =
                document.createElement(
                    "button"
                );


            button.type =
                "button";


            button.className =
                "category-button";


            button.dataset.category =
                category.name;


            button.textContent =
                category.name;


            categoriesContainer
                .appendChild(
                    button
                );

        }
    );

}


// ========================================
// PRODUCTS
// ========================================

async function loadProducts() {

    const response =
        await fetch(
            PRODUCTS_API
        );


    if (!response.ok) {

        throw new Error(
            "فشل تحميل المنتجات"
        );

    }


    allProducts =
        await response.json();

}


function filterProducts() {

    let filtered =
        [...allProducts];


    if (
        currentCategory !==
        "all"
    ) {

        filtered =
            filtered.filter(
                (product) =>
                    product.category ===
                    currentCategory
            );

    }


    if (currentSearch) {

        const search =
            currentSearch
                .toLowerCase();


        filtered =
            filtered.filter(
                (product) => {

                    const fields = [

                        product.name,

                        product.description,

                        product.category,

                        product.weight

                    ];


                    return fields.some(
                        (field) =>
                            String(
                                field || ""
                            )
                            .toLowerCase()
                            .includes(
                                search
                            )
                    );

                }
            );

    }


    displayProducts(
        filtered
    );

}


function displayProducts(products) {

    productsGrid.innerHTML = "";


    if (
        products.length === 0
    ) {

        emptyState
            .classList
            .remove(
                "hidden"
            );

        return;

    }


    emptyState
        .classList
        .add(
            "hidden"
        );


    products.forEach(
        (product) => {

            const card =
                document.createElement(
                    "article"
                );


            card.className =
                "product-card";


            let imageHtml;


            if (product.image) {

                imageHtml = `

                    <img
                        class="product-image"
                       src="${product.image.startsWith('http') ? product.image : IMAGE_URL + encodeURIComponent(product.image)}"
                        alt="${escapeHtml(product.name || "")}"
                        loading="lazy"
                    >

                `;

            } else {

                imageHtml = `

                    <div
                        class="product-image-placeholder"
                    >
                        ${escapeHtml(
                            String(
                                product.name ||
                                "م"
                            ).charAt(0)
                        )}
                    </div>

                `;

            }


            card.innerHTML = `

                <div
                    class="product-image-wrapper"
                >

                    ${imageHtml}

                    <span
                        class="product-category"
                    >
                        ${escapeHtml(
                            product.category ||
                            "منتج"
                        )}
                    </span>

                </div>


                <div
                    class="product-content"
                >

                    <h3>
                        ${escapeHtml(
                            product.name ||
                            ""
                        )}
                    </h3>


                    <p
                        class="product-description"
                    >
                        ${escapeHtml(
                            product.description ||
                            "منتج مختار بعناية."
                        )}
                    </p>


                    <div
                        class="product-bottom"
                    >

                        <div
                            class="product-price"
                        >

                            <span>
                                السعر
                            </span>

                            <strong>
                                ${formatPrice(
                                    product.price
                                )} ل.س
                            </strong>

                        </div>


                        <div
                            class="product-weight"
                        >

                            <span>
                                الوزن
                            </span>

                            <strong>
                                ${escapeHtml(
                                    product.weight ||
                                    "—"
                                )}
                            </strong>

                        </div>

                    </div>

                </div>


                <button
                    type="button"
                    class="product-details-button"
                    data-product-id="${product.id}"
                >
                    عرض التفاصيل
                </button>

            `;


            productsGrid
                .appendChild(
                    card
                );

        }
    );

}


// ========================================
// CATEGORY FILTER
// ========================================

categoriesContainer
    .addEventListener(
        "click",
        (event) => {

            const button =
                event.target.closest(
                    ".category-button"
                );


            if (!button) {
                return;
            }


            document
                .querySelectorAll(
                    ".category-button"
                )
                .forEach(
                    (item) => {

                        item
                            .classList
                            .remove(
                                "active"
                            );

                    }
                );


            button
                .classList
                .add(
                    "active"
                );


            currentCategory =
                button.dataset.category;


            filterProducts();

        }
    );


// ========================================
// SEARCH
// ========================================

productSearch
    .addEventListener(
        "input",
        () => {

            currentSearch =
                productSearch
                    .value
                    .trim();


            filterProducts();

        }
    );


// ========================================
// PRODUCT DETAILS
// ========================================

productsGrid
    .addEventListener(
        "click",
        (event) => {

            const button =
                event.target.closest(
                    "[data-product-id]"
                );


            if (!button) {
                return;
            }


            const id =
                Number(
                    button
                        .dataset
                        .productId
                );


            openProductDetails(
                id
            );

        }
    );


function openProductDetails(id) {

    const product =
        allProducts.find(
            (item) =>
                Number(item.id) ===
                Number(id)
        );


    if (!product) {
        return;
    }


    document
        .getElementById(
            "modalProductCategory"
        )
        .textContent =
            product.category ||
            "منتج";


    document
        .getElementById(
            "modalProductName"
        )
        .textContent =
            product.name ||
            "";


    document
        .getElementById(
            "modalProductDescription"
        )
        .textContent =
            product.description ||
            "لا يوجد وصف لهذا المنتج.";


    document
        .getElementById(
            "modalProductWeight"
        )
        .textContent =
            product.weight ||
            "—";


    document
        .getElementById(
            "modalProductPrice"
        )
        .textContent =
            `${formatPrice(product.price)} ل.س`;


    const image =
        document.getElementById(
            "modalProductImage"
        );


    const placeholder =
        document.getElementById(
            "modalImagePlaceholder"
        );


    if (product.image) {

        image.src =
            `${IMAGE_URL}${encodeURIComponent(product.image)}`;


        image.alt =
            product.name || "";


        image.style.display =
            "block";


        placeholder.style.display =
            "none";

    } else {

        image.removeAttribute(
            "src"
        );


        image.style.display =
            "none";


        placeholder.style.display =
            "flex";


        placeholder.textContent =
            String(
                product.name ||
                "م"
            ).charAt(0);

    }


    productModal
        .classList
        .add(
            "show"
        );


    document.body.style.overflow =
        "hidden";

}


function closeProductDetails() {

    productModal
        .classList
        .remove(
            "show"
        );


    document.body.style.overflow =
        "";

}


closeProductModalButton
    .addEventListener(
        "click",
        closeProductDetails
    );


productModal
    .addEventListener(
        "click",
        (event) => {

            if (
                event.target ===
                productModal
            ) {

                closeProductDetails();

            }

        }
    );


document
    .addEventListener(
        "keydown",
        (event) => {

            if (
                event.key ===
                "Escape"
            ) {

                closeProductDetails();

            }

        }
    );


// ========================================
// LOADING
// ========================================

function showLoading(show) {

    if (show) {

        loadingState
            .classList
            .remove(
                "hidden"
            );


        productsGrid
            .classList
            .add(
                "hidden"
            );

    } else {

        loadingState
            .classList
            .add(
                "hidden"
            );


        productsGrid
            .classList
            .remove(
                "hidden"
            );

    }

}


// ========================================
// HELPERS
// ========================================

function escapeHtml(value) {

    const div =
        document.createElement(
            "div"
        );


    div.textContent =
        String(
            value ?? ""
        );


    return div.innerHTML;

}


function formatPrice(value) {

    const number =
        Number(value);


    if (
        Number.isNaN(number)
    ) {

        return "0";

    }


    return number
        .toLocaleString(
            "en-US",
            {
                maximumFractionDigits: 2
            }
        );

}


document
    .getElementById(
        "currentYear"
    )
    .textContent =
        new Date()
            .getFullYear();