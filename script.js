const PRODUCTS_API =







    "https://mahmasa-catalog.onrender.com/api/products";















const CATEGORIES_API =







    "https://mahmasa-catalog.onrender.com/api/categories";















const SETTINGS_API =







    "https://mahmasa-catalog.onrender.com/api/settings";







const BANNERS_API =



    "https://mahmasa-catalog.onrender.com/api/banners";















const IMAGE_URL =







    "https://mahmasa-catalog.onrender.com/images/";































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















        loadBanners()















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

