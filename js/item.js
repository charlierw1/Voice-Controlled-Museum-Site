window.addEventListener("load", async () => {
    const params = new URLSearchParams(window.location.search);
    const itemId = params.get("id");
    const speakExplanation = params.get("voiceExplain") === "1";

    if (!itemId) {
        renderMissingItemState("No item selected.");
        return;
    }

    try {
        const itemData = await getData(objectURL, encodeURIComponent(itemId));
        const record = itemData?.record;
        const metaImages = itemData?.meta?.images;

        if (!record) {
            renderMissingItemState("Item not found.");
            return;
        }

        updateItemText(record);
        initializeItemCarousel(record, metaImages);

        if (speakExplanation) {
            speakItemExplanation(record);
        }
    } catch (error) {
        console.error("Failed to load item data", error);
        renderMissingItemState("Could not load this item.");
    }
});

function speakItemExplanation(record) {
    if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== "function") {
        return;
    }

    const title = getItemTitle(record);
    const description = getItemDescription(record);

    const text = `Title: ${title}. Description: ${description}`;
    const utterance = new SpeechSynthesisUtterance(text);

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
}

function updateItemText(record) {
    const panel = document.querySelector(".item-panel");
    const titleElement = panel?.querySelector("h2");
    const descriptionElement = panel?.querySelector("p");

    if (titleElement) {
        titleElement.textContent = getItemTitle(record);
    }

    if (descriptionElement) {
        descriptionElement.textContent = getItemDescription(record);
    }
}

function initializeItemCarousel(record, metaImages) {
    const carousel = document.querySelector(".circle-carousel");
    const track = document.querySelector(".circle-carousel-track");
    const imageSlots = Array.from(document.querySelectorAll(".circle-carousel-track .circle-item"));
    if (!imageSlots.length) {
        return;
    }

    const leftArrow = document.querySelector(".item-carousel-arrow-left");
    const rightArrow = document.querySelector(".item-carousel-arrow-right");
    const imageUrls = getItemImageUrls(record, metaImages);
    const mainTitle = getItemTitle(record);
    const itemDescription = getItemDescription(record);
    const offsets = [-2, -1, 0, 1, 2];
    const orderedSlotIndexes = getSlotIndexesByAscendingAngle(imageSlots);
    const initialBottomOrderIndex = findBottomOrderIndex(imageSlots, orderedSlotIndexes);

    if (!imageUrls.length) {
        renderMissingItemState("No images available for this object.");
        return;
    }

    const state = {
        carousel,
        track,
        imageSlots,
        imageUrls,
        mainTitle,
        itemDescription,
        offsets,
        orderedSlotIndexes,
        bottomOrderIndex: initialBottomOrderIndex,
        stepDegrees: 72,
        animationMs: 440,
        rotationSteps: 0,
        centerIndex: 0,
        isAnimating: false
    };

    setRotation(state, 0);
    updateSlotScales(state, state.bottomOrderIndex);

    renderCarouselState(state);
    preloadAround(state);

    wireItemArrow(leftArrow, () => rotateItemCarousel(state, -1));
    wireItemArrow(rightArrow, () => rotateItemCarousel(state, 1));
}

function wireItemArrow(button, onActivate) {
    if (!button) {
        return;
    }

    button.addEventListener("click", onActivate);
}

function rotateItemCarousel(state, direction) {
    if (state.isAnimating || !state.imageUrls.length || !state.track) {
        return;
    }

    state.isAnimating = true;
    const previousBottomOrderIndex = state.bottomOrderIndex;
    const nextBottomOrderIndex = toWrappedIndex(
        previousBottomOrderIndex + (direction > 0 ? 1 : -1),
        state.orderedSlotIndexes.length
    );

    updateSlotScales(state, nextBottomOrderIndex);

    state.rotationSteps += direction > 0 ? -1 : 1;
    const rotationDegrees = state.rotationSteps * state.stepDegrees;
    setRotation(state, rotationDegrees);

    setTimeout(() => {
        state.bottomOrderIndex = nextBottomOrderIndex;
        state.isAnimating = false;
    }, state.animationMs + 20);
}

function updateSlotScales(state, bottomOrderIndex) {
    const largeScale = 1.26;

    state.orderedSlotIndexes.forEach((slotIndex, orderIndex) => {
        const slot = state.imageSlots[slotIndex];
        const isBottom = orderIndex === bottomOrderIndex;

        slot.style.setProperty("--slot-scale", isBottom ? String(largeScale) : "1");
        slot.style.zIndex = isBottom ? "5" : "2";
    });
}

function renderCarouselState(state) {
    const { imageSlots, imageUrls, mainTitle, itemDescription, offsets, centerIndex } = state;

    imageSlots.forEach((slot, index) => {
        const imageDiv = slot.querySelector(".circle-item-image");
        const caption = slot.querySelector("figcaption");
        const isMainSlot = index === 2;
        const imageIndex = toWrappedIndex(centerIndex + offsets[index], imageUrls.length);
        const imageUrl = imageUrls[imageIndex];

        if (!imageDiv || !imageUrl) {
            return;
        }

        imageDiv.style.backgroundImage = `linear-gradient(rgba(8, 10, 12, 0.16), rgba(8, 10, 12, 0.62)), url('${imageUrl}')`;
        imageDiv.style.backgroundSize = "cover";
        imageDiv.style.backgroundPosition = "center";
        imageDiv.style.backgroundRepeat = "no-repeat";
        imageDiv.classList.remove("loading");

        const altLabel = isMainSlot
            ? `Main image for ${mainTitle}`
            : `Detail image ${imageIndex + 1} for ${mainTitle}`;
        imageDiv.setAttribute("aria-label", altLabel);

        if (caption) {
            caption.textContent = "";
        }
    });
}

function setRotation(state, degrees) {
    if (!state.carousel) {
        return;
    }

    state.carousel.style.setProperty("--ring-rotation", `${degrees}deg`);
    state.carousel.style.setProperty("--counter-rotation", `${-degrees}deg`);
}

function preloadAround(state) {
    const preloadIndexes = [
        state.centerIndex - 2,
        state.centerIndex - 1,
        state.centerIndex,
        state.centerIndex + 1,
        state.centerIndex + 2,
        state.centerIndex + 3
    ];

    preloadIndexes.forEach((index) => {
        const normalizedIndex = toWrappedIndex(index, state.imageUrls.length);
        const imageUrl = state.imageUrls[normalizedIndex];
        if (!imageUrl) {
            return;
        }

        const img = new Image();
        img.src = imageUrl;
    });
}

function toWrappedIndex(index, length) {
    if (!length) {
        return 0;
    }

    return ((index % length) + length) % length;
}

function getItemImageUrls(record, metaImages) {
    const urls = [];
    const imageRefs = Array.isArray(record?.images) ? record.images : [];

    imageRefs.forEach((assetRef) => {
        if (typeof assetRef !== "string" || !assetRef.trim()) {
            return;
        }

        urls.push(`https://framemark.vam.ac.uk/collections/${assetRef.trim()}/full/900,/0/default.jpg`);
    });

    if (!urls.length && metaImages?._iiif_image) {
        urls.push(`${metaImages._iiif_image}full/900,/0/default.jpg`);
    }

    if (!urls.length && metaImages?._primary_thumbnail) {
        urls.push(metaImages._primary_thumbnail);
    }

    return urls;
}

function getSlotIndexesByAscendingAngle(imageSlots) {
    return imageSlots
        .map((slot, index) => ({ index, angle: getSlotAngle(slot) }))
        .sort((a, b) => a.angle - b.angle)
        .map((entry) => entry.index);
}

function findBottomOrderIndex(imageSlots, orderedSlotIndexes) {
    const bottomIndex = imageSlots.findIndex((slot) => slot.classList.contains("circle-item-main"));
    const orderIndex = orderedSlotIndexes.indexOf(bottomIndex);
    return orderIndex >= 0 ? orderIndex : 0;
}

function getSlotAngle(slot) {
    if (slot.classList.contains("orbit-right")) {
        return 36;
    }

    if (slot.classList.contains("circle-item-main")) {
        return 180;
    }

    if (slot.classList.contains("orbit-left")) {
        return 108;
    }

    if (slot.classList.contains("orbit-top-left")) {
        return 252;
    }

    if (slot.classList.contains("orbit-top-right")) {
        return 324;
    }

    return 0;
}

function getItemTitle(record) {
    const firstTitle = Array.isArray(record?.titles) ? record.titles[0]?.title : "";
    if (typeof firstTitle === "string" && firstTitle.trim()) {
        return firstTitle.trim();
    }

    if (record?.objectType?.trim()) {
        return record.objectType.trim();
    }

    return "Untitled object";
}

function getItemDescription(record) {
    if (record?.summaryDescription?.trim()) {
        return record.summaryDescription.trim();
    }

    if (record?.physicalDescription?.trim()) {
        return record.physicalDescription.trim();
    }

    if (record?.materialsAndTechniques?.trim()) {
        return `Materials: ${record.materialsAndTechniques.trim()}`;
    }

    return "No description available for this object.";
}

function renderMissingItemState(message) {
    const panel = document.querySelector(".item-panel");
    const titleElement = panel?.querySelector("h2");
    const descriptionElement = panel?.querySelector("p");

    if (titleElement) {
        titleElement.textContent = "Item Unavailable";
    }

    if (descriptionElement) {
        descriptionElement.textContent = message;
    }

    const imageDivs = Array.from(document.querySelectorAll(".circle-item-image"));
    imageDivs.forEach((imageDiv) => {
        imageDiv.classList.remove("loading");
    });

    const arrows = Array.from(document.querySelectorAll(".item-carousel-arrow"));
    arrows.forEach((arrow) => {
        arrow.disabled = true;
        arrow.style.opacity = "0.35";
        arrow.style.cursor = "default";
    });
}
