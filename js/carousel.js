const CAROUSEL_DESKTOP_VISIBLE_COUNT = 5;
const CAROUSEL_MOBILE_VISIBLE_COUNT = 6;
const CAROUSEL_MOBILE_BREAKPOINT = 760;
const CAROUSEL_PAGE_SIZE = 24;
const CAROUSEL_ANIMATION_MS = 360;

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
        visibleCount: getCarouselVisibleCount(),
        centerIndex: 0,
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

    state.centerIndex = getCarouselCenterIndex(state.visibleCount);

    syncCardSlots(state, state.visibleCount);
    wireArrow(state, leftArrow, "Previous items", () => shiftCarousel(state, -1));
    wireArrow(state, rightArrow, "Next items", () => shiftCarousel(state, 1));

    await ensureWindowData(state, state.visibleCount + 1);
    renderWindow(state);
    preloadAhead(state);
    wireCarouselResize(state);
}

function getCarouselVisibleCount() {
    return window.matchMedia(`(max-width: ${CAROUSEL_MOBILE_BREAKPOINT}px)`).matches
        ? CAROUSEL_MOBILE_VISIBLE_COUNT
        : CAROUSEL_DESKTOP_VISIBLE_COUNT;
}

function getCarouselCenterIndex(visibleCount) {
    return Math.floor((visibleCount - 1) / 2);
}

function wireCarouselResize(state) {
    let resizeTimer = null;

    window.addEventListener("resize", () => {
        if (resizeTimer) {
            window.clearTimeout(resizeTimer);
        }

        resizeTimer = window.setTimeout(() => {
            refreshCarouselLayout(state).catch((error) => {
                console.error("Carousel resize update failed", error);
            });
        }, 120);
    });
}

async function refreshCarouselLayout(state) {
    if (state.isBusy) {
        return;
    }

    const nextVisibleCount = getCarouselVisibleCount();
    if (nextVisibleCount === state.visibleCount) {
        return;
    }

    state.visibleCount = nextVisibleCount;
    state.centerIndex = getCarouselCenterIndex(nextVisibleCount);

    const maxStartIndex = Math.max(0, state.records.length - state.visibleCount);
    state.startIndex = Math.min(state.startIndex, maxStartIndex);

    await ensureWindowData(state, state.startIndex + state.visibleCount + 1);
    syncCardSlots(state, state.visibleCount);
    renderWindow(state);
    preloadAhead(state);
}

function syncCardSlots(state, requiredCount) {
    const links = Array.from(state.carousel.children).filter((element) => element.tagName === "A");

    if (links.length > requiredCount) {
        for (let i = links.length - 1; i >= requiredCount; i -= 1) {
            links[i].remove();
        }
    }

    if (links.length < requiredCount) {
        for (let i = links.length; i < requiredCount; i += 1) {
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
        }
    }

    state.cardLinks = Array.from(state.carousel.children)
        .filter((element) => element.tagName === "A")
        .slice(0, requiredCount);

    state.cardBodies = state.cardLinks.map((anchor, slot) => {
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";

        let card = anchor.querySelector(".image-card");
        if (!card) {
            card = document.createElement("div");
            card.className = "image-card loading";
            anchor.appendChild(card);
        }

        let label = card.querySelector("span");
        if (!label) {
            label = document.createElement("span");
            label.textContent = "Loading item";
            card.appendChild(label);
        }

        card.style.setProperty("--carousel-slot", String(slot));
        return card;
    });
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
        await ensureWindowData(state, targetStart + state.visibleCount + 1);

        const hasEnoughData = targetStart + state.visibleCount <= state.records.length;
        if (!hasEnoughData) {
            return;
        }
    }

    state.isBusy = true;

    try {
        await animateShift(state, targetStart);
        preloadAhead(state);
    } finally {
        state.isBusy = false;
    }
}

function wait(ms) {
    return new Promise((resolve) => {
        window.setTimeout(resolve, ms);
    });
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
    for (let slot = 0; slot < state.visibleCount; slot += 1) {
        const recordIndex = state.startIndex + slot;
        const record = state.records[recordIndex];
        const anchor = state.cardLinks[slot];
        const card = state.cardBodies[slot];
        applyRecordToCard(card, anchor, record, slot, state.centerIndex);
    }

    updateArrowDisabledVisual(state, state.leftArrow, state.startIndex === 0);
    const cannotMoveRight = !state.hasMore && state.startIndex + state.visibleCount >= state.records.length;
    updateArrowDisabledVisual(state, state.rightArrow, cannotMoveRight);
}

function applyRecordToCard(card, anchor, record, slot, centerIndex) {
    const label = card.querySelector("span");

    card.classList.toggle("image-card-center", slot === centerIndex);

    if (!record) {
        card.classList.add("loading");
        card.style.backgroundImage = "";
        if (label) {
            label.textContent = "Loading item";
        }
        if (anchor) {
            anchor.href = "#";
        }
        return;
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

    if (anchor) {
        anchor.href = getCollectionsUrl(record);
    }
}

function preloadAhead(state) {
    const preloadIndexes = [
        state.startIndex + state.visibleCount,
        state.startIndex + state.visibleCount + 1,
        state.startIndex + state.visibleCount + 2,
        state.startIndex + state.visibleCount + 3
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

    if (state.records.length - (state.startIndex + state.visibleCount) < 10) {
        ensureWindowData(state, state.records.length + CAROUSEL_PAGE_SIZE).then(() => {
            updateArrowDisabledVisual(state, state.rightArrow, !state.hasMore && state.startIndex + state.visibleCount >= state.records.length);
        }).catch((error) => {
            console.error("Failed to preload additional carousel data", error);
        });
    }
}

async function animateShift(state, targetStart) {
    const direction = targetStart > state.startIndex ? 1 : -1;
    const slotRects = state.cardBodies.map((card) => card.getBoundingClientRect());
    const slotGap = slotRects.length > 1 ? slotRects[1].left - slotRects[0].left : slotRects[0].width;
    const overlayClones = [];

    state.cardBodies.forEach((card) => {
        card.classList.add("carousel-card-hidden");
    });

    for (let slot = 0; slot < state.visibleCount; slot += 1) {
        const record = state.records[state.startIndex + slot];
        const sourceRect = slotRects[slot];
        const targetSlot = slot - direction;
        const targetRect = slotRects[targetSlot];
        const clone = createMotionClone(record, slot, sourceRect, state.centerIndex);

        if (targetRect) {
            moveCloneToRect(clone, sourceRect, targetRect);
        } else {
            moveCloneOffscreen(clone, direction, slotGap);
        }

        overlayClones.push(clone);
    }

    const incomingRecordIndex = direction > 0
        ? targetStart + state.visibleCount - 1
        : targetStart;
    const incomingSlot = direction > 0 ? state.visibleCount - 1 : 0;
    const incomingTargetRect = slotRects[incomingSlot];
    const incomingStartRect = createIncomingRect(incomingTargetRect, direction, slotGap);
    const incomingClone = createMotionClone(state.records[incomingRecordIndex], incomingSlot, incomingStartRect, state.centerIndex);
    moveCloneToRect(incomingClone, incomingStartRect, incomingTargetRect);
    overlayClones.push(incomingClone);

    state.startIndex = targetStart;
    renderWindow(state);

    await wait(CAROUSEL_ANIMATION_MS + 50);

    overlayClones.forEach((clone) => clone.remove());
    state.cardBodies.forEach((card) => {
        card.classList.remove("carousel-card-hidden");
    });
}

function createMotionClone(record, slot, rect, centerIndex) {
    const clone = document.createElement("div");
    clone.className = "image-card carousel-motion-clone";

    const label = document.createElement("span");
    clone.appendChild(label);
    applyRecordToCard(clone, null, record, slot, centerIndex);

    clone.style.left = `${rect.left}px`;
    clone.style.top = `${rect.top}px`;
    clone.style.width = `${rect.width}px`;
    clone.style.height = `${rect.height}px`;
    clone.style.opacity = "1";

    document.body.appendChild(clone);
    return clone;
}

function createIncomingRect(targetRect, direction, slotGap) {
    return {
        left: targetRect.left + (direction > 0 ? slotGap : -slotGap),
        top: targetRect.top,
        width: targetRect.width,
        height: targetRect.height
    };
}

function moveCloneToRect(clone, sourceRect, targetRect) {
    requestAnimationFrame(() => {
        clone.style.left = `${targetRect.left}px`;
        clone.style.top = `${targetRect.top}px`;
        clone.style.width = `${targetRect.width}px`;
        clone.style.height = `${targetRect.height}px`;
    });
}

function moveCloneOffscreen(clone, direction, slotGap) {
    const currentLeft = Number.parseFloat(clone.style.left || "0");

    requestAnimationFrame(() => {
        clone.style.opacity = "0";
        clone.style.left = `${currentLeft + (direction > 0 ? -slotGap : slotGap)}px`;
    });
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
