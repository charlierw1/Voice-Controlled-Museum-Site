const CAROUSEL_VISIBLE_COUNT = 5;
const CAROUSEL_CENTER_INDEX = 2;
const CAROUSEL_PAGE_SIZE = 24;
const CAROUSEL_ANIMATION_MS = 220;

window.addEventListener("load", () => {
    initializeCarousel().catch((error) => {
        console.error("Carousel initialization failed", error);
    });
});

async function initializeCarousel() {
    const carousel = document.querySelector(".carousel");
    if (!carousel) {
        return;
    }

    const arrows = carousel.querySelectorAll(".arrow");
    if (arrows.length < 2) {
        return;
    }

    const leftArrow = arrows[0];
    const rightArrow = arrows[1];

    const state = {
        carousel,
        leftArrow,
        rightArrow,
        cardLinks: [],
        cardBodies: [],
        records: [],
        seenRecordKeys: new Set(),
        preloadedImages: new Set(),
        startIndex: 0,
        nextPage: 1,
        hasMore: true,
        isLoadingPage: false,
        isBusy: false
    };

    createCardSlots(state);
    wireArrow(state, leftArrow, "Previous items", () => shiftCarousel(state, -1));
    wireArrow(state, rightArrow, "Next items", () => shiftCarousel(state, 1));

    await ensureWindowData(state, CAROUSEL_VISIBLE_COUNT + 1);
    renderWindow(state);
    preloadAhead(state);
}

function createCardSlots(state) {
    state.carousel.querySelectorAll("a").forEach((anchor) => {
        anchor.remove();
    });

    for (let i = 0; i < CAROUSEL_VISIBLE_COUNT; i += 1) {
        const anchor = document.createElement("a");
        anchor.href = "#";
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";

        const card = document.createElement("div");
        card.className = "image-card loading";

        const label = document.createElement("span");
        label.textContent = "Loading item";

        card.appendChild(label);
        anchor.appendChild(card);

        state.carousel.insertBefore(anchor, state.rightArrow);
        state.cardLinks.push(anchor);
        state.cardBodies.push(card);
    }
}

function wireArrow(state, arrow, label, onActivate) {
    arrow.setAttribute("role", "button");
    arrow.setAttribute("aria-label", label);
    arrow.setAttribute("tabindex", "0");
    arrow.style.cursor = "pointer";

    arrow.addEventListener("click", () => {
        onActivate().catch((error) => {
            console.error("Carousel navigation failed", error);
        });
    });

    arrow.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onActivate().catch((error) => {
                console.error("Carousel keyboard navigation failed", error);
            });
        }
    });

    updateArrowDisabledVisual(state, arrow, false);
}

async function shiftCarousel(state, direction) {
    if (state.isBusy) {
        return;
    }

    if (direction < 0 && state.startIndex === 0) {
        return;
    }

    const targetStart = state.startIndex + direction;

    if (direction > 0) {
        await ensureWindowData(state, targetStart + CAROUSEL_VISIBLE_COUNT + 1);

        const hasEnoughData = targetStart + CAROUSEL_VISIBLE_COUNT <= state.records.length;
        if (!hasEnoughData) {
            return;
        }
    }

    state.isBusy = true;
    state.startIndex = targetStart;
    renderWindow(state);
    animateShift(state, direction);
    preloadAhead(state);
    state.isBusy = false;
}

async function ensureWindowData(state, minRecordsRequired) {
    while (state.records.length < minRecordsRequired && state.hasMore) {
        await appendNextPage(state);
    }
}

async function appendNextPage(state) {
    if (state.isLoadingPage || !state.hasMore) {
        return;
    }

    state.isLoadingPage = true;
    try {
        const popularQuery = `${encodeURIComponent("popular")}&page_size=${CAROUSEL_PAGE_SIZE}&page=${state.nextPage}`;
        const pageData = await getData(searchURL, popularQuery);
        const pageRecords = pageData?.records ?? [];

        if (!pageRecords.length) {
            state.hasMore = false;
            return;
        }

        pageRecords.forEach((record) => {
            const imageUrl = getBestImageUrl(record);
            const recordKey = getRecordDedupKey(record);

            if (!imageUrl || !recordKey || state.seenRecordKeys.has(recordKey)) {
                return;
            }

            state.records.push(record);
            state.seenRecordKeys.add(recordKey);
        });

        const totalPages = Number(pageData?.info?.pages) || 0;
        state.nextPage += 1;
        if (totalPages > 0 && state.nextPage > totalPages) {
            state.hasMore = false;
        }
    } catch (error) {
        console.error("Failed to fetch carousel page", error);
        state.hasMore = false;
    } finally {
        state.isLoadingPage = false;
    }
}

function renderWindow(state) {
    for (let slot = 0; slot < CAROUSEL_VISIBLE_COUNT; slot += 1) {
        const recordIndex = state.startIndex + slot;
        const record = state.records[recordIndex];
        const anchor = state.cardLinks[slot];
        const card = state.cardBodies[slot];
        const label = card.querySelector("span");

        card.classList.toggle("image-card-center", slot === CAROUSEL_CENTER_INDEX);

        if (!record) {
            card.classList.add("loading");
            card.style.backgroundImage = "";
            if (label) {
                label.textContent = "Loading item";
            }
            anchor.href = "#";
            continue;
        }

        const imageUrl = getBestImageUrl(record);
        card.style.backgroundImage = `linear-gradient(rgba(8, 10, 12, 0.16), rgba(8, 10, 12, 0.62)), url('${imageUrl}')`;
        card.style.backgroundSize = "130% 130%";
        card.style.backgroundPosition = "center";
        card.style.backgroundRepeat = "no-repeat";
        card.classList.remove("loading");

        if (label) {
            label.textContent = getDisplayTitle(record);
        }

        anchor.href = getCollectionsUrl(record);
    }

    updateArrowDisabledVisual(state, state.leftArrow, state.startIndex === 0);
    const cannotMoveRight = !state.hasMore && state.startIndex + CAROUSEL_VISIBLE_COUNT >= state.records.length;
    updateArrowDisabledVisual(state, state.rightArrow, cannotMoveRight);
}

function preloadAhead(state) {
    const preloadIndexes = [
        state.startIndex + CAROUSEL_VISIBLE_COUNT,
        state.startIndex + CAROUSEL_VISIBLE_COUNT + 1,
        state.startIndex + CAROUSEL_VISIBLE_COUNT + 2,
        state.startIndex + CAROUSEL_VISIBLE_COUNT + 3
    ];

    preloadIndexes.forEach((index) => {
        const record = state.records[index];
        const imageUrl = getBestImageUrl(record);
        if (!imageUrl || state.preloadedImages.has(imageUrl)) {
            return;
        }

        const img = new Image();
        img.src = imageUrl;
        state.preloadedImages.add(imageUrl);
    });

    if (state.records.length - (state.startIndex + CAROUSEL_VISIBLE_COUNT) < 10) {
        ensureWindowData(state, state.records.length + CAROUSEL_PAGE_SIZE).then(() => {
            updateArrowDisabledVisual(state, state.rightArrow, !state.hasMore && state.startIndex + CAROUSEL_VISIBLE_COUNT >= state.records.length);
        }).catch((error) => {
            console.error("Failed to preload additional carousel data", error);
        });
    }
}

function animateShift(state, direction) {
    const enterClass = direction > 0 ? "carousel-enter-right" : "carousel-enter-left";

    state.cardBodies.forEach((card) => {
        card.classList.remove("carousel-enter-right", "carousel-enter-left", "carousel-enter-active");
        card.classList.add(enterClass);
    });

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            state.cardBodies.forEach((card) => {
                card.classList.add("carousel-enter-active");
            });
        });
    });

    setTimeout(() => {
        state.cardBodies.forEach((card) => {
            card.classList.remove("carousel-enter-right", "carousel-enter-left", "carousel-enter-active");
        });
    }, CAROUSEL_ANIMATION_MS + 40);
}

function updateArrowDisabledVisual(state, arrow, isDisabled) {
    arrow.style.opacity = isDisabled ? "0.35" : "1";
    arrow.style.pointerEvents = isDisabled ? "none" : "auto";
    arrow.setAttribute("aria-disabled", String(isDisabled));
}

function getBestImageUrl(record) {
    const iiifBase = record?._images?._iiif_image_base_url;
    const thumbnail = record?._images?._primary_thumbnail;

    if (iiifBase) {
        return `${iiifBase}full/900,/0/default.jpg`;
    }

    return thumbnail || "";
}

function getDisplayTitle(record) {
    if (record?._primaryTitle?.trim()) {
        return record._primaryTitle.trim();
    }

    if (record?.objectType?.trim()) {
        return record.objectType.trim();
    }

    return "Untitled object";
}

function getCollectionsUrl(record) {
    if (!record?.systemNumber) {
        return "pages/item.html";
    }

    return `pages/item.html?id=${encodeURIComponent(record.systemNumber)}`;
}

function getRecordDedupKey(record) {
    const systemNumber = record?.systemNumber?.trim();
    if (systemNumber) {
        return `sys:${systemNumber}`;
    }

    const accessionNumber = record?.accessionNumber?.trim();
    if (accessionNumber) {
        return `acc:${accessionNumber}`;
    }

    const imageId = record?._primaryImageId?.trim();
    if (imageId) {
        return `img:${imageId}`;
    }

    const title = record?._primaryTitle?.trim();
    const maker = record?._primaryMaker?.name?.trim();
    if (title || maker) {
        return `tm:${title || "untitled"}:${maker || "unknown"}`;
    }

    return "";
}
