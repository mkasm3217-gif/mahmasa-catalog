// عند اختبار الموقع عبر Live Server (المنفذ 5500) نستعمل السيرفر المحلي.
// الموقع المنشور يستعمل Render. لا تفتح index.html ببروتوكول file://؛ شغّل Live Server.
const LOCAL_TEST = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const API_BASE_URL = LOCAL_TEST
    ? "http://localhost:3000"
    : "https://mahmasa-catalog.onrender.com";
const PRODUCTS_API = `${API_BASE_URL}/api/products`;
const CATEGORIES_API = `${API_BASE_URL}/api/categories`;
const SETTINGS_API = `${API_BASE_URL}/api/settings`;
const BANNERS_API = `${API_BASE_URL}/api/banners`;
const IMAGE_URL = `${API_BASE_URL}/images/`;
const COMMERCE_SETTINGS_API = `${API_BASE_URL}/api/commerce/settings`;
const ORDER_QUOTE_API = `${API_BASE_URL}/api/orders/quote`;
const ORDERS_API = `${API_BASE_URL}/api/orders`;
let allProducts = [];
let allCategories = [];
let currentCategory = "all";
let currentSearch = "";
let shopSettings = null;
let allBanners = [];
let currentBannerIndex = 0;
let bannerTimer = null;
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
            loadProducts(),
            loadBanners(),
            loadCommerceSettings()
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
    const contactShopName =
        document.getElementById("contactShopName");
    if (contactShopName) {
        contactShopName.textContent = name;
    }
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
    const footerRightsName =
        document.getElementById("footerRightsName");
    if (footerRightsName) {
        footerRightsName.textContent = name;
    }
    setLogo(
        "brandLogo",
        name
    );
    setLogo(
        "heroLogo",
        name
    );
    setLogo(
        "footerLogo",
        name
    );
    document
        .getElementById(
            "contactPhone"
        )
        .textContent =
            shopSettings.phone ||
            "—";
    const phoneItem =
        document.getElementById("phoneItem");
    if (phoneItem) {
        const rawPhone =
            String(shopSettings.phone || "").trim();
        if (rawPhone) {
            const phoneForLink =
                rawPhone.replace(/[^\d+]/g, "");
            phoneItem.href =
                `tel:${phoneForLink}`;
            phoneItem.classList.remove("is-disabled");
        } else {
            phoneItem.removeAttribute("href");
            phoneItem.classList.add("is-disabled");
        }
    }
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
    configureSocialLinks();
    configureDeveloperLink();
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
                src="${shopSettings.logo.startsWith("http") ? shopSettings.logo : IMAGE_URL + encodeURIComponent(shopSettings.logo)}"
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
    const button = document.getElementById("whatsappButton");
    const footerWhatsapp = document.getElementById("footerWhatsapp");
    const whatsapp = String(
        shopSettings?.whatsapp || ""
    );
    const cleanNumber = whatsapp.replace(/\D/g, "");
    if (!cleanNumber) {
        if (button) {
            button.classList.add("hidden");
            button.href = "#";
        }
        if (footerWhatsapp) {
            footerWhatsapp.classList.add("hidden");
            footerWhatsapp.href = "#";
        }
        refreshFooterSocials();
        return;
    }
    const message =
        `مرحباً، أريد الاستفسار عن منتجات ${shopSettings?.shop_name || "المحمصة"}`;
    const href =
        `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`;
    if (button) {
        button.href = href;
        button.classList.remove("hidden");
    }
    if (footerWhatsapp) {
        footerWhatsapp.href = href;
        footerWhatsapp.classList.remove("hidden");
    }
    refreshFooterSocials();
}
// ========================================
// CATEGORIES
// ========================================
function normalizeExternalUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}
function refreshFooterSocials() {
    const socialGroups = [
        document.getElementById("contactSocials"),
        document.getElementById("footerSocials")
    ].filter(Boolean);
    socialGroups.forEach((group) => {
        const hasVisibleLink =
            [...group.querySelectorAll("a")]
                .some((item) =>
                    !item.classList.contains("hidden")
                );
        group.classList.toggle(
            "hidden",
            !hasVisibleLink
        );
    });
}
function configureSocialLinks() {
    const facebookItem =
        document.getElementById("facebookItem");
    const instagramItem =
        document.getElementById("instagramItem");
    const footerFacebook =
        document.getElementById("footerFacebook");
    const footerInstagram =
        document.getElementById("footerInstagram");
    const facebook =
        normalizeExternalUrl(
            shopSettings?.facebook
        );
    const instagram =
        normalizeExternalUrl(
            shopSettings?.instagram
        );
    [facebookItem, footerFacebook]
        .filter(Boolean)
        .forEach((item) => {
            item.href = facebook || "#";
            item.classList.toggle(
                "hidden",
                !facebook
            );
        });
    [instagramItem, footerInstagram]
        .filter(Boolean)
        .forEach((item) => {
            item.href = instagram || "#";
            item.classList.toggle(
                "hidden",
                !instagram
            );
        });
    refreshFooterSocials();
}
function configureDeveloperLink() {
    const section =
        document.getElementById(
            "developerSection"
        );
    const divider =
        document.getElementById(
            "developerDivider"
        );
    const link =
        document.getElementById(
            "developerWhatsapp"
        );
    if (!link) return;
    const cleanNumber = String(
        shopSettings?.developer_whatsapp || ""
    ).replace(/\D/g, "");
    if (!cleanNumber) {
        link.classList.add("hidden");
        link.href = "#";
        if (section) {
            section.classList.add("hidden");
        }
        if (divider) {
            divider.classList.add("hidden");
        }
        return;
    }
    const message =
        "مرحباً، تواصلت معك من خلال موقع المحمصة.";
    link.href =
        `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`;
    link.classList.remove("hidden");
    if (section) {
        section.classList.remove("hidden");
    }
    if (divider) {
        divider.classList.remove("hidden");
    }
}
async function loadBanners() {
    const response = await fetch(BANNERS_API);
    if (!response.ok) throw new Error("فشل تحميل الإعلانات");
    allBanners = await response.json();
    renderBanners();
}
function renderBanners() {
    const section = document.getElementById("adsSection");
    const track = document.getElementById("adsTrack");
    const dots = document.getElementById("adsDots");
    const prev = document.getElementById("adsPrev");
    const next = document.getElementById("adsNext");
    if (!section || !track || !dots) return;
    stopBannerTimer();
    if (!Array.isArray(allBanners) || !allBanners.length) {
        section.classList.add("hidden");
        track.innerHTML = "";
        dots.innerHTML = "";
        return;
    }
    section.classList.remove("hidden");
    currentBannerIndex = 0;
    track.innerHTML = allBanners.map((banner) => {
        const rawImage = String(banner.image || "");
        const imageSrc = rawImage.startsWith("http") ? rawImage : IMAGE_URL + encodeURIComponent(rawImage);
        const title = banner.title ? `<h3>${escapeHtml(banner.title)}</h3>` : "";
        const description = banner.description ? `<p>${escapeHtml(banner.description)}</p>` : "";
        const content = title || description ? `<div class="ad-slide-content">${title}${description}</div>` : "";
        return `<article class="ad-slide"><img class="ad-slide-image" src="${imageSrc}" alt="${escapeHtml(banner.title || "إعلان المحمصة")}">${content}</article>`;
    }).join("");
    track.querySelectorAll(".ad-slide").forEach((slide, index) => {
        const banner = allBanners[index];
        const rawImage = String(banner?.image || "");
        const imageSrc = rawImage.startsWith("http")
            ? rawImage
            : IMAGE_URL + encodeURIComponent(rawImage);
        slide.style.setProperty(
            "--banner-image",
            `url("${imageSrc}")`
        );
    });
    dots.innerHTML = allBanners.map((_, index) =>
        `<button type="button" class="ads-dot${index === 0 ? " active" : ""}" data-banner-index="${index}" aria-label="الإعلان ${index + 1}"></button>`
    ).join("");
    const multiple = allBanners.length > 1;
    if (prev) prev.style.display = multiple ? "" : "none";
    if (next) next.style.display = multiple ? "" : "none";
    dots.style.display = multiple ? "" : "none";
    showBanner(0);
    if (multiple) startBannerTimer();
}
function showBanner(index) {
    const track = document.getElementById("adsTrack");
    if (!track || !allBanners.length) return;
    currentBannerIndex = (index + allBanners.length) % allBanners.length;
    track.style.transform = `translateX(${currentBannerIndex * 100}%)`;
    document.querySelectorAll(".ads-dot").forEach((dot, i) => {
        dot.classList.toggle("active", i === currentBannerIndex);
    });
}
function nextBanner() { showBanner(currentBannerIndex + 1); }
function previousBanner() { showBanner(currentBannerIndex - 1); }
function startBannerTimer() {
    stopBannerTimer();
    bannerTimer = window.setInterval(nextBanner, 5000);
}
function stopBannerTimer() {
    if (bannerTimer) {
        window.clearInterval(bannerTimer);
        bannerTimer = null;
    }
}
function resetBannerTimer() {
    if (allBanners.length > 1) startBannerTimer();
}
document.getElementById("adsNext")?.addEventListener("click", () => { nextBanner(); resetBannerTimer(); });
document.getElementById("adsPrev")?.addEventListener("click", () => { previousBanner(); resetBannerTimer(); });
document.getElementById("adsDots")?.addEventListener("click", (event) => {
    const dot = event.target.closest("[data-banner-index]");
    if (!dot) return;
    showBanner(Number(dot.dataset.bannerIndex));
    resetBannerTimer();
});
document.getElementById("adsSlider")?.addEventListener("mouseenter", stopBannerTimer);
document.getElementById("adsSlider")?.addEventListener("mouseleave", resetBannerTimer);
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
                       src="${product.image.startsWith("http") ? product.image : IMAGE_URL + encodeURIComponent(product.image)}"
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
        image.src = product.image.startsWith("http")
    ? product.image
    : IMAGE_URL + encodeURIComponent(product.image);
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
    setupPurchasePanel(product);
    productModal
        .classList
        .add(
            "show"
        );
    document.body.style.overflow =
        "hidden";
}
function closeProductDetails() {
    selectedPurchaseProduct = null;
    document.getElementById("productPurchasePanel")?.classList.add("hidden");
    document.getElementById("cartNotice")?.classList.add("hidden");
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
// ========================================
// PWA INSTALL
// ========================================
let deferredInstallPrompt = null;
const pwaInstallCard =
    document.getElementById("pwaInstallCard");
const pwaInstallButton =
    document.getElementById("pwaInstallButton");
const pwaInstallClose =
    document.getElementById("pwaInstallClose");
const pwaInstallFab =
    document.getElementById("pwaInstallFab");
const pwaInstallTitle =
    document.getElementById("pwaInstallTitle");
const pwaInstallText =
    document.getElementById("pwaInstallText");
const PWA_DISMISS_KEY =
    "kramish-pwa-install-dismissed-at";
function isPwaStandalone() {
    return (
        window.matchMedia("(display-mode: standalone)").matches ||
        window.navigator.standalone === true
    );
}
function isIosDevice() {
    return /iphone|ipad|ipod/i.test(
        window.navigator.userAgent
    );
}
function hidePwaInstallUi() {
    pwaInstallCard?.classList.add("hidden");
    pwaInstallFab?.classList.add("hidden");
}
function showPwaInstallFab() {
    if (!isPwaStandalone()) {
        pwaInstallFab?.classList.remove("hidden");
    }
}
function setDefaultInstallCopy() {
    if (pwaInstallTitle) {
        pwaInstallTitle.textContent =
            "ثبّت التطبيق على هاتفك";
    }
    if (pwaInstallText) {
        pwaInstallText.textContent =
            "وصول أسرع للمحمصة من الشاشة الرئيسية بدون البحث عن الرابط كل مرة.";
    }
    const label =
        pwaInstallButton?.querySelector("span");
    if (label) {
        label.textContent =
            isIosDevice()
                ? "طريقة التثبيت"
                : "تثبيت التطبيق";
    }
}
function showPwaInstallCard(force = false) {
    if (
        isPwaStandalone() ||
        !pwaInstallCard
    ) {
        hidePwaInstallUi();
        return;
    }
    if (!force) {
        const dismissedAt =
            Number(
                localStorage.getItem(
                    PWA_DISMISS_KEY
                ) || 0
            );
        const oneDay =
            24 * 60 * 60 * 1000;
        if (
            dismissedAt &&
            Date.now() - dismissedAt < oneDay
        ) {
            showPwaInstallFab();
            return;
        }
    }
    setDefaultInstallCopy();
    pwaInstallCard.classList.remove("hidden");
    showPwaInstallFab();
}
function showManualInstallInstructions() {
    if (!pwaInstallCard) return;
    pwaInstallCard.classList.remove("hidden");
    if (isIosDevice()) {
        if (pwaInstallTitle) {
            pwaInstallTitle.textContent =
                "أضف التطبيق إلى الشاشة الرئيسية";
        }
        if (pwaInstallText) {
            pwaInstallText.textContent =
                "اضغط زر المشاركة في Safari، ثم اختر «إضافة إلى الشاشة الرئيسية».";
        }
    } else {
        if (pwaInstallTitle) {
            pwaInstallTitle.textContent =
                "ثبّت تطبيق محمصة كراميش";
        }
        if (pwaInstallText) {
            pwaInstallText.textContent =
                "إذا لم تظهر نافذة التثبيت، افتح قائمة المتصفح واختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».";
        }
    }
    const label =
        pwaInstallButton?.querySelector("span");
    if (label) {
        label.textContent = "حسنًا";
    }
}
window.addEventListener(
    "beforeinstallprompt",
    (event) => {
        event.preventDefault();
        deferredInstallPrompt = event;
        if (!isPwaStandalone()) {
            showPwaInstallFab();
            showPwaInstallCard();
        }
    }
);
pwaInstallButton?.addEventListener(
    "click",
    async () => {
        if (isPwaStandalone()) {
            hidePwaInstallUi();
            return;
        }
        if (deferredInstallPrompt) {
            deferredInstallPrompt.prompt();
            const choice =
                await deferredInstallPrompt
                    .userChoice;
            deferredInstallPrompt = null;
            if (
                choice.outcome === "accepted"
            ) {
                hidePwaInstallUi();
                localStorage.removeItem(
                    PWA_DISMISS_KEY
                );
            } else {
                pwaInstallCard?.classList.add(
                    "hidden"
                );
                showPwaInstallFab();
            }
            return;
        }
        if (
            pwaInstallButton
                ?.querySelector("span")
                ?.textContent === "حسنًا"
        ) {
            pwaInstallCard?.classList.add(
                "hidden"
            );
            showPwaInstallFab();
            return;
        }
        showManualInstallInstructions();
    }
);
pwaInstallClose?.addEventListener(
    "click",
    () => {
        pwaInstallCard?.classList.add(
            "hidden"
        );
        localStorage.setItem(
            PWA_DISMISS_KEY,
            String(Date.now())
        );
        showPwaInstallFab();
    }
);
pwaInstallFab?.addEventListener(
    "click",
    () => {
        showPwaInstallCard(true);
    }
);
window.addEventListener(
    "appinstalled",
    () => {
        deferredInstallPrompt = null;
        hidePwaInstallUi();
        localStorage.removeItem(
            PWA_DISMISS_KEY
        );
    }
);
window.addEventListener(
    "DOMContentLoaded",
    () => {
        if (isPwaStandalone()) {
            hidePwaInstallUi();
            return;
        }
        showPwaInstallFab();
        window.setTimeout(
            () => showPwaInstallCard(),
            900
        );
    }
);
// Service Worker
if ("serviceWorker" in navigator) {
    window.addEventListener(
        "load",
        async () => {
            try {
                const registration =
                    await navigator
                        .serviceWorker
                        .register(
                            "./service-worker.js?v=1"
                        );
                registration.update();
            } catch (error) {
                console.error(
                    "PWA service worker registration failed:",
                    error
                );
            }
        }
    );
}
// ==========================================================
// KRAMISH CART AND ORDERING (CASH ON PICKUP / DELIVERY)
// الأسعار النهائية، الخصومات، وتكلفة التوصيل تُحسب في السيرفر فقط.
// ==========================================================
const CART_STORAGE_KEY = "kramish-cart-v1";
const TRACKING_STORAGE_KEY = "kramish-last-order-v1";
let commerceSettings = null;
let selectedPurchaseProduct = null;
let cartLines = restoreCart();
let currentQuote = null;
let quoteSequence = 0;
let quotePromise = Promise.resolve(false);
let submittingOrder = false;
let deliveryPosition = null;
let lastOrderToken = (() => {
    try {
        const prior = JSON.parse(localStorage.getItem(TRACKING_STORAGE_KEY) || "null");
        return /^[0-9a-f-]{36}$/i.test(String(prior?.tracking_token || ""))
            ? prior.tracking_token : null;
    } catch { return null; }
})();
function cartElement(id) {
    return document.getElementById(id);
}
function setCartText(id, value) {
    const element = cartElement(id);
    if (element) element.textContent = String(value);
}
function toggleCartElement(id, visible) {
    cartElement(id)?.classList.toggle("hidden", !visible);
}
function amountLabel(value) {
    return `${formatPrice(value)} ل.س`;
}
function positiveInteger(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
function restoreCart() {
    try {
        const saved = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "[]");
        if (!Array.isArray(saved)) return [];
        return saved.slice(0, 50).filter((item) =>
            positiveInteger(item.product_id) &&
            ["unit", "weight", "amount"].includes(item.selection_mode)
        ).map((item, index) => ({
            key: String(item.key || `restored-${index}`).slice(0, 80),
            product_id: positiveInteger(item.product_id),
            selection_mode: item.selection_mode,
            quantity: positiveInteger(item.quantity, 1),
            weight_grams: Number(item.weight_grams) || null,
            requested_amount: Number(item.requested_amount) || null,
            item_note: String(item.item_note || "").slice(0, 255)
        }));
    } catch (error) {
        console.warn("تعذر استعادة السلة:", error);
        return [];
    }
}
function persistCart() {
    try {
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartLines));
    } catch (error) {
        console.warn("تعذر حفظ السلة محليًا:", error);
    }
}
function isOrderingAvailable() {
    return commerceSettings?.orders_enabled === true;
}
async function loadCommerceSettings() {
    try {
        const response = await fetch(COMMERCE_SETTINGS_API, { cache: "no-store" });
        if (!response.ok) throw new Error("تعذر جلب إعدادات الطلبات");
        commerceSettings = await response.json();
    } catch (error) {
        console.warn("خدمة الطلبات غير متاحة حاليًا:", error);
        commerceSettings = null;
    }
    const enabled = isOrderingAvailable();
    toggleCartElement("cartOpenButton", enabled);
    if (cartElement("deliveryOption")) {
        cartElement("deliveryOption").classList.toggle("hidden", !commerceSettings?.delivery_enabled);
    }
    if (!commerceSettings?.delivery_enabled && cartElement("deliveryRadio")?.checked) {
        cartElement("pickupRadio").checked = true;
    }
    if (selectedPurchaseProduct) setupPurchasePanel(selectedPurchaseProduct);
    if (enabled) renderCart();
}
function setupPurchasePanel(product) {
    selectedPurchaseProduct = product;
    const panel = cartElement("productPurchasePanel");
    const available = isOrderingAvailable() && Number(product.is_orderable ?? 1) === 1;
    panel?.classList.toggle("hidden", !available);
    toggleCartElement("purchaseUnavailable", isOrderingAvailable() && !available);
    toggleCartElement("cartNotice", false);
    if (!available) return;
    const weightSale = product.sale_type === "weight";
    const allowAmount = weightSale && Number(product.allow_amount_order || 0) === 1;
    const minWeight = Math.max(1, positiveInteger(product.min_weight_grams, 100));
    const weightStep = Math.max(1, positiveInteger(product.weight_step_grams, 50));
    const firstWeight = Math.ceil(minWeight / weightStep) * weightStep;
    toggleCartElement("purchaseModeGroup", allowAmount);
    toggleCartElement("purchaseQuantityGroup", !weightSale);
    toggleCartElement("purchaseWeightGroup", weightSale);
    toggleCartElement("purchaseAmountGroup", false);
    const mode = cartElement("purchaseMode");
    if (mode) mode.value = "weight";
    const weight = cartElement("purchaseWeight");
    if (weight) {
        weight.min = String(firstWeight);
        weight.step = String(weightStep);
        weight.value = String(firstWeight);
    }
    if (cartElement("purchaseQuantity")) cartElement("purchaseQuantity").value = "1";
    if (cartElement("purchaseAmount")) {
        const minimumAmount = Math.max(1, Math.round(Number(product.price) * minWeight / 1000));
        cartElement("purchaseAmount").min = String(minimumAmount);
        cartElement("purchaseAmount").value = String(minimumAmount);
    }
    if (cartElement("purchaseItemNote")) cartElement("purchaseItemNote").value = "";
    setCartText("purchasePriceHint", weightSale
        ? `السعر لكل كيلوغرام: ${amountLabel(product.price)}`
        : `السعر لكل ${product.unit_label || "قطعة"}: ${amountLabel(product.price)}`);
    setCartText("purchaseHint", weightSale
        ? `أقل وزن ${minWeight} غ، والزيادة بمضاعفات ${weightStep} غ.`
        : "اختر عدد القطع أو العلب المطلوبة.");
    updatePurchaseEstimate();
}
function updatePurchaseEstimate() {
    const product = selectedPurchaseProduct;
    if (!product || !isOrderingAvailable()) return;
    const weightSale = product.sale_type === "weight";
    const mode = weightSale && cartElement("purchaseMode")?.value === "amount"
        ? "amount" : weightSale ? "weight" : "unit";
    toggleCartElement("purchaseWeightGroup", mode === "weight");
    toggleCartElement("purchaseAmountGroup", mode === "amount");
    const price = Number(product.price) || 0;
    let estimate;
    if (mode === "amount") {
        const desired = Number(cartElement("purchaseAmount")?.value || 0);
        estimate = desired > 0 && price > 0
            ? `${amountLabel(desired)} (حوالي ${formatPrice(desired / price * 1000)} غ)` : "أدخل المبلغ";
    } else if (mode === "weight") {
        const grams = Number(cartElement("purchaseWeight")?.value || 0);
        estimate = grams > 0 ? amountLabel(Math.round(price * grams / 1000)) : "اختر الوزن";
    } else {
        const count = Number(cartElement("purchaseQuantity")?.value || 0);
        estimate = count > 0 ? amountLabel(Math.round(price * count)) : "اختر عدد القطع";
    }
    setCartText("purchaseEstimate", `السعر التقريبي: ${estimate}. السعر النهائي يُحسب عند تأكيد الطلب.`);
}
["purchaseMode", "purchaseQuantity", "purchaseWeight", "purchaseAmount"].forEach((id) => {
    cartElement(id)?.addEventListener("input", updatePurchaseEstimate);
    cartElement(id)?.addEventListener("change", updatePurchaseEstimate);
});
function newCartLine(product) {
    const weightSale = product.sale_type === "weight";
    const allowAmount = Number(product.allow_amount_order || 0) === 1;
    const mode = weightSale
        ? allowAmount && cartElement("purchaseMode")?.value === "amount" ? "amount" : "weight"
        : "unit";
    const item = {
        key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        product_id: positiveInteger(product.id),
        selection_mode: mode,
        item_note: String(cartElement("purchaseItemNote")?.value || "").trim().slice(0, 255)
    };
    if (mode === "unit") {
        const quantity = Number(cartElement("purchaseQuantity")?.value);
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
            throw new Error("عدد القطع لازم يكون بين 1 و999.");
        }
        item.quantity = quantity;
    } else if (mode === "weight") {
        const weight = Number(cartElement("purchaseWeight")?.value);
        const minWeight = positiveInteger(product.min_weight_grams, 100);
        const step = positiveInteger(product.weight_step_grams, 50);
        if (!Number.isFinite(weight) || weight < minWeight || weight > 100000 ||
            Math.abs(weight / step - Math.round(weight / step)) > 0.000001) {
            throw new Error(`الوزن لازم يبدأ من ${minWeight} غ، وبمضاعفات ${step} غ.`);
        }
        item.weight_grams = weight;
    } else {
        const amount = Number(cartElement("purchaseAmount")?.value);
        const minWeight = positiveInteger(product.min_weight_grams, 100);
        const minimumAmount = Math.max(1, Math.round(Number(product.price) * minWeight / 1000));
        if (!Number.isInteger(amount) || amount < minimumAmount || amount > 1000000000) {
            throw new Error(`أقل مبلغ لهذا المنتج ${amountLabel(minimumAmount)}.`);
        }
        item.requested_amount = amount;
    }
    return item;
}
cartElement("addToCartButton")?.addEventListener("click", () => {
    if (!selectedPurchaseProduct || !isOrderingAvailable()) return;
    const notice = cartElement("cartNotice");
    try {
        if (cartLines.length >= 50) throw new Error("الحد الأقصى 50 صنفًا بالسلة.");
        cartLines.push(newCartLine(selectedPurchaseProduct));
        persistCart();
        renderCart();
        closeProductDetails();
        openCart();
    } catch (error) {
        if (notice) {
            notice.textContent = error.message;
            notice.classList.remove("hidden");
        }
    }
});
function serverCartItems() {
    return cartLines.map(({ product_id, selection_mode, quantity, weight_grams,
        requested_amount, item_note }) => ({
        product_id,
        selection_mode,
        quantity,
        weight_grams,
        requested_amount,
        item_note
    }));
}
function lineDescription(item) {
    if (item.selection_mode === "unit") return `${item.quantity} قطعة/علبة`;
    if (item.selection_mode === "amount") return `حسب المبلغ: ${amountLabel(item.requested_amount)}`;
    return `حسب الوزن: ${formatPrice(item.weight_grams)} غ`;
}
function renderCart() {
    const count = cartLines.length;
    setCartText("cartCount", count);
    toggleCartElement("cartEmptyState", !count);
    toggleCartElement("cartCheckoutSection", count > 0);
    const itemsNode = cartElement("cartItems");
    if (!itemsNode) return;
    itemsNode.innerHTML = cartLines.map((line) => {
        const product = allProducts.find((entry) => Number(entry.id) === line.product_id);
        const name = product?.name || `منتج رقم ${line.product_id}`;
        return `<div class="cart-item">
            <div class="cart-item-info"><strong>${escapeHtml(name)}</strong>
            <small>${escapeHtml(lineDescription(line))}</small>
            ${line.item_note ? `<small>ملاحظة: ${escapeHtml(line.item_note)}</small>` : ""}</div>
            <button type="button" class="cart-remove-button" data-cart-remove="${escapeHtml(line.key)}"
                    aria-label="إزالة ${escapeHtml(name)}">إزالة</button></div>`;
    }).join("");
    if (!count) {
        currentQuote = null;
        quoteSequence++;
        resetTotals();
        showCartError("");
    } else if (isOrderingAvailable()) {
        refreshQuote();
    }
}
cartElement("cartItems")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-cart-remove]");
    if (!button) return;
    cartLines = cartLines.filter((line) => line.key !== button.dataset.cartRemove);
    persistCart();
    renderCart();
});
function openCart() {
    if (!isOrderingAvailable()) return;
    if (productModal.classList.contains("show")) closeProductDetails();
    toggleCartElement("cartSuccessSection", false);
    toggleCartElement("cartEmptyState", !cartLines.length);
    toggleCartElement("cartCheckoutSection", cartLines.length > 0);
    toggleCartElement("cartOverlay", true);
    cartElement("cartOverlay")?.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    renderCart();
    cartElement("cartDialog")?.focus();
}
function closeCart() {
    toggleCartElement("cartOverlay", false);
    cartElement("cartOverlay")?.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    cartElement("cartOpenButton")?.focus();
}
cartElement("cartOpenButton")?.addEventListener("click", openCart);
cartElement("cartCloseButton")?.addEventListener("click", closeCart);
cartElement("cartBackdrop")?.addEventListener("click", closeCart);
cartElement("cartContinueShopping")?.addEventListener("click", closeCart);
cartElement("cartNewOrderButton")?.addEventListener("click", closeCart);
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !cartElement("cartOverlay")?.classList.contains("hidden")) {
        closeCart();
    }
});
function fulfillmentType() {
    return cartElement("deliveryRadio")?.checked ? "delivery" : "pickup";
}
function resetTotals() {
    ["cartSubtotal", "cartDiscount", "cartDeliveryFee", "cartTotal"].forEach((id) => setCartText(id, "—"));
    toggleCartElement("cartDiscountRow", false);
    toggleCartElement("cartDeliveryRow", false);
}
function showCartError(message) {
    const element = cartElement("cartError");
    if (!element) return;
    element.textContent = message;
    element.classList.toggle("hidden", !message);
}
function fillQuote(quote) {
    setCartText("cartSubtotal", amountLabel(quote.subtotal));
    setCartText("cartDiscount", `− ${amountLabel(quote.discount_amount)}`);
    setCartText("cartDiscountLabel", `الخصم (${formatPrice(quote.discount_percent)}%)`);
    setCartText("cartDeliveryFee", amountLabel(quote.delivery_fee));
    setCartText("cartTotal", amountLabel(quote.total));
    toggleCartElement("cartDiscountRow", Number(quote.discount_percent) > 0);
    toggleCartElement("cartDeliveryRow", fulfillmentType() === "delivery");
}
async function fetchCartJson(url, payload) {
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store"
    });
    let data;
    try { data = await response.json(); }
    catch { throw new Error("تعذر قراءة رد السيرفر، تأكد من تشغيله."); }
    if (!response.ok) throw new Error(data.message || "تعذر إكمال الطلب.");
    return data;
}
function refreshQuote() {
    const seq = ++quoteSequence;
    currentQuote = null;
    if (!cartLines.length || !isOrderingAvailable()) {
        resetTotals();
        quotePromise = Promise.resolve(false);
        return quotePromise;
    }
    resetTotals();
    setCartText("cartTotal", "جاري الحساب...");
    showCartError("");
    const payload = { items: serverCartItems(), fulfillment_type: fulfillmentType() };
    quotePromise = fetchCartJson(ORDER_QUOTE_API, payload).then((quote) => {
        if (seq !== quoteSequence) return false;
        currentQuote = quote;
        fillQuote(quote);
        return true;
    }).catch((error) => {
        if (seq === quoteSequence) {
            currentQuote = null;
            resetTotals();
            showCartError(`${error.message} — راجع محتويات السلة أو جرّب لاحقًا.`);
        }
        return false;
    });
    return quotePromise;
}
function updateFulfillment() {
    const delivering = fulfillmentType() === "delivery";
    toggleCartElement("cartDeliveryFields", delivering);
    if (!delivering) {
        deliveryPosition = null;
        setCartText("locationStatus", "");
    }
    refreshQuote();
}
cartElement("pickupRadio")?.addEventListener("change", updateFulfillment);
cartElement("deliveryRadio")?.addEventListener("change", updateFulfillment);
cartElement("useMyLocationButton")?.addEventListener("click", () => {
    if (fulfillmentType() !== "delivery") return;
    if (!navigator.geolocation) {
        setCartText("locationStatus", "متصفحك لا يدعم تحديد الموقع. اكتب عنوانك يدويًا.");
        return;
    }
    deliveryPosition = null;
    setCartText("locationStatus", "جاري طلب إذن الوصول إلى موقعك...");
    const button = cartElement("useMyLocationButton");
    button.disabled = true;
    navigator.geolocation.getCurrentPosition(({ coords }) => {
        button.disabled = false;
        deliveryPosition = { lat: coords.latitude, lng: coords.longitude };
        setCartText("locationStatus", "✅ تم تحديد موقعك. سيُرسل للمحمصة عند تأكيد الطلب فقط.");
    }, (error) => {
        button.disabled = false;
        deliveryPosition = null;
        setCartText("locationStatus", error.code === 1
            ? "لم تسمح بمشاركة الموقع. يمكنك كتابة عنوان التوصيل بدلًا منه."
            : "تعذر تحديد موقعك. حاول مجددًا أو اكتب عنوانك.");
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
});
cartElement("checkoutForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submittingOrder || !cartLines.length || !isOrderingAvailable()) return;
    const name = String(cartElement("customerName")?.value || "").trim();
    const phone = String(cartElement("customerPhone")?.value || "").trim();
    const address = String(cartElement("deliveryAddress")?.value || "").trim();
    const delivery = fulfillmentType() === "delivery";
    if (!name || phone.replace(/\D/g, "").length < 6) {
        showCartError("اكتب اسمك ورقم هاتف صحيح (6 أرقام على الأقل).");
        return;
    }
    if (delivery && !deliveryPosition && !address) {
        showCartError("للتوصيل حدّد موقعك أو اكتب عنوانًا واضحًا.");
        return;
    }
    submittingOrder = true;
    const button = cartElement("cartCheckoutButton");
    button.disabled = true;
    button.textContent = "جاري التحقق وإرسال الطلب...";
    try {
        const quoteOk = await refreshQuote();
        if (!quoteOk || !currentQuote) return;
        const data = await fetchCartJson(ORDERS_API, {
            items: serverCartItems(),
            customer_name: name,
            customer_phone: phone,
            fulfillment_type: delivery ? "delivery" : "pickup",
            delivery_address: delivery ? address : null,
            delivery_lat: delivery ? deliveryPosition?.lat ?? null : null,
            delivery_lng: delivery ? deliveryPosition?.lng ?? null : null,
            notes: String(cartElement("orderNotes")?.value || "").trim()
        });
        lastOrderToken = data.tracking_token || null;
        // Keep a safe local list so the customer can revisit more than one order.
        saveMyOrder({ tracking_token: lastOrderToken, order_code: data.order_code });
        toggleCartElement("cartManageOrderButton", Boolean(lastOrderToken));
        try {
            localStorage.setItem(TRACKING_STORAGE_KEY, JSON.stringify({
                order_code: data.order_code,
                tracking_token: lastOrderToken
            }));
        } catch (error) {
            console.warn("تعذر حفظ رقم الطلب محليًا:", error);
        }
        cartLines = [];
        persistCart();
        currentQuote = null;
        quoteSequence++;
        setCartText("cartOrderCode", data.order_code);
        setCartText("cartSuccessMessage", `${data.status_label || "بانتظار موافقة المحمصة"}. الإجمالي ${amountLabel(data.total)}، والدفع نقدًا.`);
        setCartText("cartTrackingStatus", "");
        toggleCartElement("cartEmptyState", false);
        toggleCartElement("cartCheckoutSection", false);
        toggleCartElement("cartSuccessSection", true);
        renderCartCountOnly();
        showCartError("");
        deliveryPosition = null;
        cartElement("checkoutForm")?.reset();
    } catch (error) {
        showCartError(error.message || "تعذر إرسال الطلب، جرّب مرة ثانية.");
    } finally {
        submittingOrder = false;
        button.disabled = false;
        button.textContent = "تأكيد وإرسال الطلب";
    }
});
function renderCartCountOnly() {
    setCartText("cartCount", cartLines.length);
    if (cartElement("cartItems")) cartElement("cartItems").innerHTML = "";
}
cartElement("cartTrackButton")?.addEventListener("click", async () => {
    if (!lastOrderToken) {
        setCartText("cartTrackingStatus", "احتفظ برقم الطلب ورقم هاتفك للاستفسار عنه.");
        return;
    }
    setCartText("cartTrackingStatus", "جاري جلب حالة الطلب...");
    try {
        const response = await fetch(`${API_BASE_URL}/api/orders/track/${encodeURIComponent(lastOrderToken)}`, {
            cache: "no-store"
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "تعذر جلب حالة الطلب");
        setCartText("cartTrackingStatus", `حالة الطلب: ${data.order?.status_label || "بانتظار موافقة المحمصة"}`);
    } catch (error) {
        setCartText("cartTrackingStatus", error.message);
    }
});
setCartText("cartCount", cartLines.length);
// ==========================================================
// MY ORDERS — customer tracking, editing and cancellation
// A tracking token is private: retain it on this device only.
// All prices and the pending-status restriction are validated by the server.
// ==========================================================
const MY_ORDERS_STORAGE_KEY = "kramish-my-orders-v1";
const MY_ORDERS_MAX_SAVED = 15;
const MY_ORDERS_TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let mySavedOrders = readMySavedOrders();
let myCurrentOrder = null;
let myCurrentOrderToken = "";
let myEditDraft = [];
let myOrdersReturnToCart = false;
let myOrdersBusy = false;
let myOrdersRequestSeq = 0;
function readMySavedOrders() {
    let result = [];
    try {
        const existing = JSON.parse(localStorage.getItem(MY_ORDERS_STORAGE_KEY) || "[]");
        if (Array.isArray(existing)) {
            result = existing.filter((row) => row && MY_ORDERS_TOKEN_RE.test(row.tracking_token))
                .map((row) => ({
                    tracking_token: row.tracking_token,
                    order_code: String(row.order_code || "").slice(0, 40),
                    saved_at: Number(row.saved_at) || 0
                }));
        }
        // Compatibility with orders sent before "طلباتي" was added.
        const legacy = JSON.parse(localStorage.getItem(TRACKING_STORAGE_KEY) || "null");
        if (legacy && MY_ORDERS_TOKEN_RE.test(legacy.tracking_token) &&
            !result.some((row) => row.tracking_token === legacy.tracking_token)) {
            result.unshift({
                tracking_token: legacy.tracking_token,
                order_code: String(legacy.order_code || "").slice(0, 40),
                saved_at: Date.now()
            });
        }
    } catch (error) {
        console.warn("تعذر استعادة الطلبات المحفوظة:", error);
    }
    return result.sort((a, b) => b.saved_at - a.saved_at).slice(0, MY_ORDERS_MAX_SAVED);
}
function storeMyOrders() {
    try {
        localStorage.setItem(MY_ORDERS_STORAGE_KEY, JSON.stringify(mySavedOrders));
    } catch (error) {
        console.warn("تعذر حفظ الطلبات على الجهاز:", error);
    }
}
function saveMyOrder(order) {
    if (!MY_ORDERS_TOKEN_RE.test(String(order?.tracking_token || ""))) return;
    const token = order.tracking_token;
    mySavedOrders = [
        { tracking_token: token, order_code: String(order.order_code || "").slice(0, 40), saved_at: Date.now() },
        ...mySavedOrders.filter((row) => row.tracking_token !== token)
    ].slice(0, MY_ORDERS_MAX_SAVED);
    storeMyOrders();
    renderMySavedOrders();
}
function renderMySavedOrders() {
    const list = cartElement("myOrdersSavedList");
    toggleCartElement("myOrdersSavedSection", mySavedOrders.length > 0);
    if (!list) return;
    list.innerHTML = mySavedOrders.map((row) => `
        <div class="my-order-saved-row">
            <button type="button" class="cart-track-button" data-my-order-token="${escapeHtml(row.tracking_token)}">
                📦 ${escapeHtml(row.order_code || "طلب محفوظ")} — عرض الطلب
            </button>
            <button type="button" class="my-orders-forget-button" data-my-forget-token="${escapeHtml(row.tracking_token)}"
                aria-label="إزالة الطلب من هذا الجهاز فقط">إزالة من الجهاز</button>
        </div>
    `).join("");
}
function showMyOrdersError(message, elementId = "myOrdersError") {
    setCartText(elementId, message || "");
    toggleCartElement(elementId, Boolean(message));
}
function showMyOrdersMessage(message) {
    setCartText("myOrdersMessage", message || "");
}
function showMyOrdersBusy(busy) {
    myOrdersBusy = busy;
    ["myOrdersLookupButton", "myOrdersSaveButton", "myOrdersCancelButton", "myOrdersRefreshButton", "myOrdersEditButton"]
        .forEach((id) => { if (cartElement(id)) cartElement(id).disabled = busy; });
}
function showMyOrderDetails(bundle) {
    if (!bundle || !bundle.order) return;
    myCurrentOrder = bundle;
    const order = bundle.order;
    setCartText("myOrdersOrderCode", order.order_code || "—");
    setCartText("myOrdersStatus", order.status_label || order.status || "—");
    setCartText("myOrdersFulfillment", order.fulfillment_type === "delivery" ? "توصيل" : "استلام من المحمصة");
    setCartText("myOrdersSubtotal", amountLabel(order.subtotal));
    setCartText("myOrdersDiscount", `− ${amountLabel(order.discount_amount)}`);
    setCartText("myOrdersDeliveryFee", amountLabel(order.delivery_fee));
    setCartText("myOrdersTotal", amountLabel(order.total));
    const itemsNode = cartElement("myOrdersItems");
    if (itemsNode) {
        itemsNode.innerHTML = Array.isArray(bundle.items) && bundle.items.length
            ? bundle.items.map((item) => {
                const label = item.selection_mode === "amount"
                    ? `حسب المبلغ: ${amountLabel(item.requested_amount)}`
                    : item.selection_mode === "weight"
                        ? `الوزن: ${formatPrice(item.weight_grams)} غرام`
                        : `الكمية: ${formatPrice(item.quantity)} ${escapeHtml(item.unit_label || "قطعة")}`;
                return `<div class="my-orders-item">
                    <strong>${escapeHtml(item.product_name || "منتج")}</strong>
                    <span>${label}</span>
                    <strong>${amountLabel(item.line_total)}</strong>
                    ${item.item_note ? `<small>${escapeHtml(item.item_note)}</small>` : ""}
                </div>`;
            }).join("")
            : "<p>لا توجد أصناف ضمن هذا الطلب.</p>";
    }
    const canEdit = order.status === "pending";
    toggleCartElement("myOrdersDetails", true);
    toggleCartElement("myOrdersEditSection", false);
    toggleCartElement("myOrdersEditButton", canEdit);
    toggleCartElement("myOrdersCancelButton", canEdit);
    toggleCartElement("myOrdersLockedNote", !canEdit);
    showMyOrdersError("");
    showMyOrdersError("", "myOrdersEditError");
}
async function requestMyOrder(url, { method = "GET", body } = {}) {
    const options = { method, cache: "no-store" };
    if (body !== undefined) {
        options.headers = { "Content-Type": "application/json" };
        options.body = JSON.stringify(body);
    }
    const response = await fetch(url, options);
    let data;
    try { data = await response.json(); }
    catch { throw new Error("تعذر قراءة رد السيرفر. تأكد من تشغيله."); }
    if (!response.ok) {
        const err = new Error(data?.message || "تعذر إكمال العملية، حاول مجددًا.");
        err.status = response.status;
        throw err;
    }
    return data;
}
async function loadMyOrderByToken(token, { showLoading = true } = {}) {
    if (!MY_ORDERS_TOKEN_RE.test(String(token || ""))) {
        showMyOrdersError("رمز الطلب المحفوظ غير صحيح. استخدم رقم الطلب ورقم الهاتف.");
        return;
    }
    const seq = ++myOrdersRequestSeq;
    if (showLoading) showMyOrdersMessage("جاري تحميل تفاصيل الطلب...");
    showMyOrdersError("");
    try {
        const bundle = await requestMyOrder(`${ORDERS_API}/track/${encodeURIComponent(token)}`);
        if (seq !== myOrdersRequestSeq) return;
        myCurrentOrderToken = token;
        showMyOrderDetails(bundle);
        showMyOrdersMessage("");
        saveMyOrder({ tracking_token: token, order_code: bundle.order.order_code });
    } catch (error) {
        if (seq !== myOrdersRequestSeq) return;
        showMyOrdersMessage("");
        showMyOrdersError(error.message);
    }
}
function openMyOrders({ token = "" } = {}) {
    const overlay = cartElement("myOrdersOverlay");
    if (!overlay) return;
    myOrdersReturnToCart = !cartElement("cartOverlay")?.classList.contains("hidden");
    if (myOrdersReturnToCart) closeCart();
    toggleCartElement("myOrdersOverlay", true);
    overlay.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    renderMySavedOrders();
    showMyOrdersError("");
    showMyOrdersMessage("");
    toggleCartElement("myOrdersEditSection", false);
    cartElement("myOrdersDialog")?.focus();
    const preferredToken = token || myCurrentOrderToken || mySavedOrders[0]?.tracking_token;
    if (preferredToken) loadMyOrderByToken(preferredToken);
}
function closeMyOrders() {
    ++myOrdersRequestSeq;
    toggleCartElement("myOrdersOverlay", false);
    cartElement("myOrdersOverlay")?.setAttribute("aria-hidden", "true");
    toggleCartElement("myOrdersEditSection", false);
    if (myOrdersReturnToCart) {
        toggleCartElement("cartOverlay", true);
        cartElement("cartOverlay")?.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
        cartElement("cartMyOrdersButton")?.focus();
    } else {
        document.body.style.overflow = "";
        cartElement("cartOpenButton")?.focus();
    }
    myOrdersReturnToCart = false;
}
cartElement("cartMyOrdersButton")?.addEventListener("click", () => openMyOrders());
cartElement("cartManageOrderButton")?.addEventListener("click", () => openMyOrders({ token: lastOrderToken || "" }));
cartElement("myOrdersCloseButton")?.addEventListener("click", closeMyOrders);
cartElement("myOrdersBackdrop")?.addEventListener("click", closeMyOrders);
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !cartElement("myOrdersOverlay")?.classList.contains("hidden")) {
        event.stopImmediatePropagation();
        closeMyOrders();
    }
}, true);
cartElement("myOrdersSavedList")?.addEventListener("click", (event) => {
    const openButton = event.target.closest("[data-my-order-token]");
    if (openButton) {
        loadMyOrderByToken(openButton.dataset.myOrderToken);
        return;
    }
    const forgetButton = event.target.closest("[data-my-forget-token]");
    if (forgetButton) {
        const token = forgetButton.dataset.myForgetToken;
        mySavedOrders = mySavedOrders.filter((row) => row.tracking_token !== token);
        storeMyOrders();
        renderMySavedOrders();
    }
});
cartElement("myOrdersLookupForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (myOrdersBusy) return;
    const code = String(cartElement("myOrdersLookupCode")?.value || "").trim().toUpperCase();
    const phone = String(cartElement("myOrdersLookupPhone")?.value || "").trim();
    if (!code || phone.replace(/\D/g, "").length < 6) {
        showMyOrdersError("اكتب رقم الطلب ورقم الهاتف الصحيح.");
        return;
    }
    showMyOrdersBusy(true);
    showMyOrdersError("");
    showMyOrdersMessage("جاري البحث عن الطلب...");
    const seq = ++myOrdersRequestSeq;
    try {
        const bundle = await requestMyOrder(`${ORDERS_API}/lookup`, {
            method: "POST", body: { order_code: code, phone }
        });
        if (seq !== myOrdersRequestSeq) return;
        if (!MY_ORDERS_TOKEN_RE.test(String(bundle.order?.tracking_token || ""))) {
            throw new Error("تعذر استلام رمز إدارة الطلب من السيرفر.");
        }
        myCurrentOrderToken = bundle.order.tracking_token;
        showMyOrderDetails(bundle);
        saveMyOrder(bundle.order);
        showMyOrdersMessage("تم العثور على الطلب، وحُفظ على هذا الجهاز.");
    } catch (error) {
        if (seq === myOrdersRequestSeq) {
            showMyOrdersError(error.message);
            showMyOrdersMessage("");
        }
    } finally {
        showMyOrdersBusy(false);
    }
});
cartElement("myOrdersRefreshButton")?.addEventListener("click", () => {
    if (myCurrentOrderToken) loadMyOrderByToken(myCurrentOrderToken);
});
function makeMyDraftLine(item) {
    const product = allProducts.find((p) => Number(p.id) === Number(item.product_id));
    const saleType = product?.sale_type === "weight" || (!product && item.sale_type === "weight") ? "weight" : "unit";
    const requestedMode = saleType === "unit" ? "unit" : item.selection_mode === "amount" ? "amount" : "weight";
    const defaultGrams = Math.ceil(Math.max(1, Number(product?.min_weight_grams) || 100) /
        Math.max(1, Number(product?.weight_step_grams) || 50)) * Math.max(1, Number(product?.weight_step_grams) || 50);
    const defaultAmount = Math.max(1, Math.round(Number(product?.price || item.unit_price || 0) * defaultGrams / 1000));
    return {
        key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        product_id: Number(item.product_id),
        product_name: String(product?.name || item.product_name || "منتج"),
        sale_type: saleType,
        selection_mode: requestedMode,
        quantity: Number(item.quantity) || 1,
        weight_grams: Number(item.weight_grams) || defaultGrams,
        requested_amount: Number(item.requested_amount) || Number(item.line_total) || defaultAmount,
        item_note: String(item.item_note || "").slice(0, 255)
    };
}
function syncMyOrderDraftInputs() {
    cartElement("myOrdersEditItems")?.querySelectorAll("[data-my-edit-key]").forEach((row) => {
        const line = myEditDraft.find((item) => item.key === row.dataset.myEditKey);
        if (!line) return;
        const input = row.querySelector("[data-my-edit-value]");
        if (input) {
            if (line.selection_mode === "unit") line.quantity = Number(input.value);
            if (line.selection_mode === "weight") line.weight_grams = Number(input.value);
            if (line.selection_mode === "amount") line.requested_amount = Number(input.value);
        }
        const note = row.querySelector("[data-my-edit-note]");
        if (note) line.item_note = note.value.slice(0, 255);
    });
}
function renderMyOrdersEditor() {
    const container = cartElement("myOrdersEditItems");
    if (!container) return;
    container.innerHTML = myEditDraft.map((line) => {
        const product = allProducts.find((p) => Number(p.id) === line.product_id);
        const weightSale = line.sale_type === "weight";
        const allowAmount = weightSale && Number(product?.allow_amount_order || 0) === 1;
        const step = Math.max(1, positiveInteger(product?.weight_step_grams, 50));
        const minWeight = Math.max(1, positiveInteger(product?.min_weight_grams, 100));
        const firstWeight = Math.ceil(minWeight / step) * step;
        const mode = weightSale && line.selection_mode === "amount" && allowAmount ? "amount" : weightSale ? "weight" : "unit";
        line.selection_mode = mode;
        let inputLabel, min, value, stepAttr;
        if (mode === "unit") {
            inputLabel = "عدد القطع"; min = 1; value = line.quantity; stepAttr = 1;
        } else if (mode === "weight") {
            inputLabel = "الوزن بالغرام"; min = firstWeight; value = line.weight_grams; stepAttr = step;
        } else {
            inputLabel = "المبلغ بالليرة السورية";
            min = Math.max(1, Math.round(Number(product?.price || 0) * minWeight / 1000));
            value = line.requested_amount; stepAttr = 1;
        }
        return `<div class="my-order-edit-card" data-my-edit-key="${escapeHtml(line.key)}">
            <div class="my-order-edit-card-title">
                <strong>${escapeHtml(line.product_name)}</strong>
                <button type="button" class="cart-remove-button" data-my-edit-remove="${escapeHtml(line.key)}">حذف الصنف</button>
            </div>
            ${allowAmount ? `<label>طريقة الاختيار
                <select data-my-edit-mode>
                    <option value="weight"${mode === "weight" ? " selected" : ""}>حسب الوزن</option>
                    <option value="amount"${mode === "amount" ? " selected" : ""}>حسب المبلغ</option>
                </select></label>` : ""}
            <label>${inputLabel}
                <input type="number" inputmode="numeric" data-my-edit-value
                    min="${min}" max="${mode === "unit" ? 999 : mode === "weight" ? 100000 : 1000000000}"
                    step="${stepAttr}" value="${Number.isFinite(value) ? value : min}" required></label>
            <label>ملاحظة على الصنف (اختياري)
                <input type="text" data-my-edit-note maxlength="255" value="${escapeHtml(line.item_note)}"></label>
        </div>`;
    }).join("") || '<p>حذفت كل الأصناف. أضف منتجًا قبل الحفظ، أو ألغِ الطلب إذا لم تعد تريده.</p>';
    const selector = cartElement("myOrdersAddProductSelect");
    if (selector) {
        const value = selector.value;
        selector.innerHTML = '<option value="">اختر منتجًا...</option>' + allProducts
            .filter((product) => Number(product.is_orderable ?? 1) === 1)
            .map((product) => `<option value="${Number(product.id)}">${escapeHtml(product.name || "منتج")}</option>`).join("");
        if ([...selector.options].some((opt) => opt.value === value)) selector.value = value;
    }
    showMyOrdersError("", "myOrdersEditError");
}
cartElement("myOrdersEditButton")?.addEventListener("click", async () => {
    if (myOrdersBusy || myCurrentOrder?.order?.status !== "pending") return;
    try {
        if (!allProducts.length) await loadProducts();
        myEditDraft = (myCurrentOrder.items || []).map(makeMyDraftLine);
        renderMyOrdersEditor();
        toggleCartElement("myOrdersEditSection", true);
        cartElement("myOrdersEditSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
        showMyOrdersError("تعذر تحميل المنتجات للتعديل. حاول مجددًا.");
    }
});
cartElement("myOrdersEditItems")?.addEventListener("change", (event) => {
    const selector = event.target.closest("[data-my-edit-mode]");
    if (!selector) return;
    syncMyOrderDraftInputs();
    const row = selector.closest("[data-my-edit-key]");
    const line = myEditDraft.find((item) => item.key === row?.dataset.myEditKey);
    if (!line) return;
    line.selection_mode = selector.value === "amount" ? "amount" : "weight";
    renderMyOrdersEditor();
});
cartElement("myOrdersEditItems")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-my-edit-remove]");
    if (!button) return;
    syncMyOrderDraftInputs();
    myEditDraft = myEditDraft.filter((row) => row.key !== button.dataset.myEditRemove);
    renderMyOrdersEditor();
});
cartElement("myOrdersAddProductButton")?.addEventListener("click", () => {
    syncMyOrderDraftInputs();
    const id = Number(cartElement("myOrdersAddProductSelect")?.value);
    const product = allProducts.find((item) => Number(item.id) === id);
    if (!product) {
        showMyOrdersError("اختر منتجًا أولًا.", "myOrdersEditError");
        return;
    }
    if (myEditDraft.length >= 50) {
        showMyOrdersError("الحد الأقصى 50 صنفًا بالطلب.", "myOrdersEditError");
        return;
    }
    myEditDraft.push(makeMyDraftLine({ product_id: id, sale_type: product.sale_type }));
    renderMyOrdersEditor();
});
cartElement("myOrdersDiscardButton")?.addEventListener("click", () => {
    toggleCartElement("myOrdersEditSection", false);
    myEditDraft = [];
});
function myOrdersEditedItems() {
    syncMyOrderDraftInputs();
    if (!myEditDraft.length || myEditDraft.length > 50) {
        throw new Error("لازم يحتوي الطلب على صنف واحد على الأقل (حتى 50 صنفًا).");
    }
    return myEditDraft.map((line) => {
        const product = allProducts.find((item) => Number(item.id) === line.product_id);
        if (!product || Number(product.is_orderable ?? 1) !== 1) {
            throw new Error(`المنتج «${line.product_name}» غير متاح حاليًا، احذفه قبل الحفظ.`);
        }
        const item = { product_id: line.product_id, selection_mode: line.selection_mode, item_note: line.item_note };
        if (line.selection_mode === "unit") {
            if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 999) {
                throw new Error(`الكمية للمنتج «${line.product_name}» يجب أن تكون بين 1 و999.`);
            }
            item.quantity = line.quantity;
        } else if (line.selection_mode === "weight") {
            const minWeight = Math.max(1, positiveInteger(product.min_weight_grams, 100));
            const step = Math.max(1, positiveInteger(product.weight_step_grams, 50));
            if (!Number.isFinite(line.weight_grams) || line.weight_grams < minWeight ||
                line.weight_grams > 100000 || Math.abs(line.weight_grams / step - Math.round(line.weight_grams / step)) > 0.000001) {
                throw new Error(`راجع وزن «${line.product_name}». أقل وزن ${minWeight} غرام وبمضاعفات ${step} غرام.`);
            }
            item.weight_grams = line.weight_grams;
        } else {
            const minimum = Math.max(1, Math.round(Number(product.price) * Number(product.min_weight_grams || 100) / 1000));
            if (!Number.isFinite(line.requested_amount) || line.requested_amount < minimum || line.requested_amount > 1e9) {
                throw new Error(`المبلغ للمنتج «${line.product_name}» يجب أن يكون ${minimum} ل.س أو أكثر.`);
            }
            item.requested_amount = line.requested_amount;
        }
        return item;
    });
}
cartElement("myOrdersEditForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (myOrdersBusy || myCurrentOrder?.order?.status !== "pending" || !myCurrentOrderToken) return;
    let items;
    try { items = myOrdersEditedItems(); }
    catch (error) { showMyOrdersError(error.message, "myOrdersEditError"); return; }
    showMyOrdersBusy(true);
    showMyOrdersError("", "myOrdersEditError");
    try {
        await requestMyOrder(`${ORDERS_API}/track/${encodeURIComponent(myCurrentOrderToken)}/items`, {
            method: "PUT", body: { items }
        });
        toggleCartElement("myOrdersEditSection", false);
        myEditDraft = [];
        await loadMyOrderByToken(myCurrentOrderToken);
        showMyOrdersMessage("✅ تم حفظ التعديلات وإعادة حساب السعر.");
    } catch (error) {
        showMyOrdersError(error.message, "myOrdersEditError");
        if (error.status === 409) {
            await loadMyOrderByToken(myCurrentOrderToken);
            showMyOrdersError("تغيّرت حالة الطلب أثناء التعديل. حدّثنا التفاصيل، وما عاد ممكن تعدّله.");
        }
    } finally {
        showMyOrdersBusy(false);
    }
});
cartElement("myOrdersCancelButton")?.addEventListener("click", async () => {
    if (myOrdersBusy || myCurrentOrder?.order?.status !== "pending" || !myCurrentOrderToken) return;
    if (!confirm("متأكد إنك بدك تلغي الطلب؟ ما رح تقدر ترجعه بعد الإلغاء.")) return;
    showMyOrdersBusy(true);
    try {
        await requestMyOrder(`${ORDERS_API}/track/${encodeURIComponent(myCurrentOrderToken)}/cancel`, {
            method: "POST"
        });
        await loadMyOrderByToken(myCurrentOrderToken);
        showMyOrdersMessage("✅ تم إلغاء الطلب بنجاح.");
    } catch (error) {
        showMyOrdersError(error.message);
        if (error.status === 409) await loadMyOrderByToken(myCurrentOrderToken);
    } finally {
        showMyOrdersBusy(false);
    }
});
// Existing checkout stays unchanged. The new entry point is visible inside the cart.
toggleCartElement("cartMyOrdersButton", true);
toggleCartElement("cartManageOrderButton", Boolean(lastOrderToken));
renderMySavedOrders();
