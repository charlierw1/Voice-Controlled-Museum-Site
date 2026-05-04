// Number of card rows visible at desktop and mobile breakpoints
const SCROLL_DESKTOP_VISIBLE_ROWS = 3;
const SCROLL_MOBILE_VISIBLE_ROWS = 4;
// Extra rows rendered above/below the visible area for smooth scrolling
const SCROLL_BUFFER_ROWS = 1;
// Number of records to request per API page
const SCROLL_FETCH_SIZE = 24;
// Scroll animation duration in milliseconds
const SCROLL_ANIMATION_MS = 420;
// Fraction of a card height shown as a peek above/below the viewport
const SCROLL_PEEK_RATIO = 0.34;
// Maximum category tiles to fetch preview images for
const CATEGORY_PREVIEW_LIMIT = 8;

// Returns the best image URL for a scroll card record
function getScrollImageUrl(record) {
    if (record?._previewImageUrl) {
        return record._previewImageUrl;
    }

    const iiifBase = record?._images?._iiif_image_base_url;
    if (iiifBase) {
        return `${iiifBase}full/900,/0/default.jpg`;
    }
    return record?._images?._primary_thumbnail || "";
}

// Returns a readable title for a scroll card record
function getScrollDisplayTitle(record) {
    if (record?._displayTitle?.trim()) {
        return record._displayTitle.trim();
    }
    if (record?._primaryTitle?.trim()) {
        return record._primaryTitle.trim();
    }
    if (record?.objectType?.trim()) {
        return record.objectType.trim();
    }
    return "Untitled object";
}

// Returns true when the viewport is at the mobile breakpoint
function isMobileScrollView() {
    return window.matchMedia("(max-width: 760px)").matches;
}

// Returns the correct visible row count for the current viewport size
function getScrollVisibleRows() {
    return isMobileScrollView() ? SCROLL_MOBILE_VISIBLE_ROWS : SCROLL_DESKTOP_VISIBLE_ROWS;
}

// Creates a blank anchor+card DOM element for a scroll slot
function createScrollCardSlot() {
    const anchor = document.createElement("a");
    anchor.href = "#";

    const card = document.createElement("div");
    card.className = "image-card loading";

    const label = document.createElement("span");
    label.textContent = "Card Name";

    card.append(label);
    anchor.append(card);

    return anchor;
}

// Populates a slot element with data from a record (or marks it as a placeholder)
function applyRecordToSlot(slot, record) {
    const card = slot.querySelector(".image-card");
    const label = card?.querySelector("span");

    if (!card || !label) {
        return;
    }

    card.classList.remove("loading", "scroll-card-placeholder");
    card.style.backgroundImage = "";
    card.style.backgroundSize = "";
    card.style.backgroundPosition = "";
    card.style.backgroundRepeat = "";
    slot.removeAttribute("data-disabled");
    slot.tabIndex = 0;

    if (!record?.systemNumber && !record?._customHref) {
        slot.removeAttribute("href");
        slot.setAttribute("data-disabled", "true");
        slot.tabIndex = -1;
        card.classList.add("scroll-card-placeholder");
        label.textContent = record?._placeholderLabel || "No result";
        return;
    }

    const imageUrl = getScrollImageUrl(record);
    if (imageUrl) {
        card.style.backgroundImage = `linear-gradient(rgba(8, 10, 12, 0.16), rgba(8, 10, 12, 0.62)), url('${imageUrl}')`;
        card.style.backgroundSize = "cover, cover";
        card.style.backgroundPosition = "center";
        card.style.backgroundRepeat = "no-repeat";
    }

    if (record?._isCategory) {
        card.classList.add("scroll-card-placeholder");
    }

    label.textContent = getScrollDisplayTitle(record);
    if (record?._customHref) {
        slot.href = record._customHref;
        return;
    }

    slot.href = `item.html?id=${encodeURIComponent(record.systemNumber)}`;
}

// Applies focus/peripheral CSS classes to a slot based on its row position
function applyScrollSlotState(slot, relativeRowIndex, visibleRows) {
    slot.classList.remove("scroll-card-peripheral", "scroll-card-peripheral-top", "scroll-card-peripheral-bottom", "scroll-card-focus");

    if (relativeRowIndex < 0) {
        slot.classList.add("scroll-card-peripheral", "scroll-card-peripheral-top");
        return;
    }

    if (relativeRowIndex >= visibleRows) {
        slot.classList.add("scroll-card-peripheral", "scroll-card-peripheral-bottom");
        return;
    }

    slot.classList.add("scroll-card-focus");
}

// Main scroll page initialiser - sets up columns, canvas, and loads data
window.addEventListener("load", () => {
    const scrollBox = document.querySelector(".scroll-page .scroll-box");
    const mic = scrollBox?.querySelector(".mic");
    const buttons = scrollBox ? Array.from(scrollBox.querySelectorAll(".scroll-test-button")) : [];
    // Map each panel to its viewport and track elements
    const columns = scrollBox
        ? Array.from(scrollBox.querySelectorAll(".scroll-panel")).map((panel, index) => ({
            index,
            viewport: panel.querySelector(".scroll-panel-viewport"),
            track: panel.querySelector(".scroll-panel-track")
        }))
        : [];

    if (!scrollBox || !mic || !columns.length || columns.some((column) => !column.viewport || !column.track)) {
        return;
    }

    // Create the canvas overlay used to draw lines from the mic to cards
    const canvas = document.createElement("canvas");
    canvas.className = "scroll-lines-canvas";
    scrollBox.prepend(canvas);

    const context = canvas.getContext("2d");
    if (!context) {
        return;
    }

    // Read URL params to determine search mode and query
    const params = new URLSearchParams(window.location.search);
    const query = params.get("q")?.trim() || "";
    const mode = params.get("mode")?.trim() || "search";
    const categoryId = params.get("id_category")?.trim() || "";
    const categoryLabel = params.get("label")?.trim() || "";

    // Returns the placeholder text when there are no results
    function getInitialEmptyStateLabel() {
        if (mode === "categories") {
            return "No category results found";
        }
        if (mode === "category-items") {
            return categoryId ? "No items found for category" : "No category selected";
        }
        return query ? "No results found" : "No search query";
    }

    // Shared mutable state for the scroll view
    const state = {
        emptyStateLabel: getInitialEmptyStateLabel(),
        isAnimating: false,
        records: [],
        topRowIndex: 0,
        visibleRows: getScrollVisibleRows()
    };

    let resizeObserver;

    // Resizes the canvas to match the scroll box, accounting for device pixel ratio
    function resizeCanvas() {
        const boxRect = scrollBox.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        canvas.width = Math.max(1, Math.round(boxRect.width * dpr));
        canvas.height = Math.max(1, Math.round(boxRect.height * dpr));
        canvas.style.width = `${boxRect.width}px`;
        canvas.style.height = `${boxRect.height}px`;

        context.setTransform(1, 0, 0, 1, 0, 0);
        context.scale(dpr, dpr);
    }

    // Returns the total number of data rows across all records
    function getTotalRows() {
        return Math.ceil(state.records.length / columns.length);
    }

    // Returns the highest valid topRowIndex
    function getMaxTopRowIndex() {
        return Math.max(0, getTotalRows() - state.visibleRows);
    }

    // Updates visibleRows if the breakpoint has changed; returns true if changed
    function syncVisibleRows() {
        const nextVisibleRows = getScrollVisibleRows();
        if (nextVisibleRows === state.visibleRows) {
            return false;
        }

        state.visibleRows = nextVisibleRows;
        state.topRowIndex = Math.min(state.topRowIndex, getMaxTopRowIndex());
        return true;
    }

    // Returns the record for a given row/column, or a placeholder object
    function getRecordForPosition(rowIndex, columnIndex) {
        if (rowIndex < 0) {
            return { _placeholderLabel: state.emptyStateLabel };
        }

        const record = state.records[(rowIndex * columns.length) + columnIndex];
        if (record) {
            return record;
        }

        return {
            _placeholderLabel: state.records.length ? "No result" : state.emptyStateLabel
        };
    }

    // Collects x/y target points on each visible card edge for line drawing
    function buildVisibleTargets() {
        const boxRect = scrollBox.getBoundingClientRect();
        const micRect = mic.getBoundingClientRect();
        const micX = micRect.left + micRect.width / 2 - boxRect.left;
        const targets = {
            left: [],
            right: []
        };

        columns.forEach((column) => {
            const viewportRect = column.viewport.getBoundingClientRect();
            const cards = Array.from(column.track.querySelectorAll(".image-card"));

            cards.forEach((card) => {
                if (card.closest(".scroll-card-peripheral")) {
                    return;
                }

                const cardRect = card.getBoundingClientRect();
                const intersectionLeft = Math.max(cardRect.left, viewportRect.left);
                const intersectionRight = Math.min(cardRect.right, viewportRect.right);
                const intersectionTop = Math.max(cardRect.top, viewportRect.top);
                const intersectionBottom = Math.min(cardRect.bottom, viewportRect.bottom);

                if (intersectionLeft >= intersectionRight || intersectionTop >= intersectionBottom) {
                    return;
                }

                const target = {
                    x: column.index === 0 ? intersectionRight - boxRect.left : intersectionLeft - boxRect.left,
                    y: ((intersectionTop + intersectionBottom) / 2) - boxRect.top
                };

                if (((intersectionLeft + intersectionRight) / 2) - boxRect.left < micX) {
                    targets.left.push(target);
                } else {
                    targets.right.push(target);
                }
            });
        });

        targets.left.sort((a, b) => b.y - a.y);
        targets.right.sort((a, b) => a.y - b.y);

        return targets;
    }

    // Distributes anchor points evenly along an arc segment
    function buildAnchorsOnArc(centerX, centerY, radius, startDeg, endDeg, count) {
        if (count <= 0) {
            return [];
        }

        const anchors = [];
        const step = count === 1 ? 0 : (endDeg - startDeg) / (count - 1);

        for (let i = 0; i < count; i += 1) {
            const angleDeg = count === 1 ? (startDeg + endDeg) / 2 : startDeg + (step * i);
            const angleRad = (angleDeg * Math.PI) / 180;

            anchors.push({
                x: centerX + (Math.cos(angleRad) * radius),
                y: centerY + (Math.sin(angleRad) * radius)
            });
        }

        return anchors;
    }

    // Draws lines from the mic to every visible card edge on the canvas
    function drawLines() {
        if (isMobileScrollView()) {
            context.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }

        resizeCanvas();

        const boxRect = scrollBox.getBoundingClientRect();
        const micRect = mic.getBoundingClientRect();
        const micX = micRect.left + micRect.width / 2 - boxRect.left;
        const micY = micRect.top + micRect.height / 2 - boxRect.top;
        const micRadius = Math.min(micRect.width, micRect.height) / 2;
        const targets = buildVisibleTargets();
        const leftAnchors = buildAnchorsOnArc(micX, micY, micRadius, 145, 215, targets.left.length);
        const rightAnchors = buildAnchorsOnArc(micX, micY, micRadius, -35, 35, targets.right.length);

        context.clearRect(0, 0, boxRect.width, boxRect.height);
        context.strokeStyle = "#000000";
        context.lineWidth = 2;
        context.lineCap = "round";

        targets.left.forEach((target, index) => {
            const anchor = leftAnchors[index];
            if (!anchor) {
                return;
            }

            context.beginPath();
            context.moveTo(anchor.x, anchor.y);
            context.lineTo(target.x, target.y);
            context.stroke();
        });

        targets.right.forEach((target, index) => {
            const anchor = rightAnchors[index];
            if (!anchor) {
                return;
            }

            context.beginPath();
            context.moveTo(anchor.x, anchor.y);
            context.lineTo(target.x, target.y);
            context.stroke();
        });
    }

    // Re-renders all visible rows into the column tracks
    function renderVisibleRows() {
        columns.forEach((column) => {
            const slots = [];

            for (let visibleIndex = -SCROLL_BUFFER_ROWS; visibleIndex < state.visibleRows + SCROLL_BUFFER_ROWS; visibleIndex += 1) {
                const slot = createScrollCardSlot();
                const rowIndex = state.topRowIndex + visibleIndex;
                applyRecordToSlot(slot, getRecordForPosition(rowIndex, column.index));
                applyScrollSlotState(slot, visibleIndex, state.visibleRows);
                slots.push(slot);
            }

            column.track.replaceChildren(...slots);
        });

        updateViewportHeights();
        columns.forEach((column) => {
            column.track.style.transform = `translateY(${state.baseOffset}px)`;
        });
        drawLines();
        updateButtonState();
    }

    // Enables/disables scroll buttons based on current position and animation state
    function updateButtonState() {
        buttons.forEach((button) => {
            const direction = Number(button.dataset.direction || "0");
            const nextRowIndex = state.topRowIndex + direction;
            const isBlocked = direction === 0 || nextRowIndex < 0 || nextRowIndex > getMaxTopRowIndex();

            button.disabled = state.isAnimating || isBlocked;
        });
    }

    // Returns the pixel height of one row plus its gap
    function getRowStep() {
        const firstTrack = columns[0]?.track;
        const firstSlot = firstTrack?.firstElementChild;
        if (!firstSlot) {
            return 0;
        }

        const gap = parseFloat(window.getComputedStyle(firstTrack).rowGap || window.getComputedStyle(firstTrack).gap || "0");
        return firstSlot.getBoundingClientRect().height + gap;
    }

    // Recalculates viewport heights and base translate offset from card dimensions
    function updateViewportHeights() {
        const firstTrack = columns[0]?.track;
        const firstSlot = firstTrack?.firstElementChild;
        if (!firstTrack || !firstSlot) {
            return;
        }

        const gap = parseFloat(window.getComputedStyle(firstTrack).rowGap || window.getComputedStyle(firstTrack).gap || "0");
        const cardHeight = firstSlot.getBoundingClientRect().height;
        const rowStep = cardHeight + gap;
        const peekHeight = Math.round(cardHeight * SCROLL_PEEK_RATIO);
        const visibleHeight = (firstSlot.getBoundingClientRect().height * state.visibleRows) + (gap * Math.max(0, state.visibleRows - 1));
        const viewportHeight = visibleHeight + (peekHeight * 2);

        state.baseOffset = -(rowStep - peekHeight);
        state.rowStep = rowStep;

        columns.forEach((column) => {
            column.viewport.style.height = `${viewportHeight}px`;
        });
    }

    // Cubic ease-in-out curve for smooth scroll animation
    function easeInOutCubic(progress) {
        return progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - (Math.pow(-2 * progress + 2, 3) / 2);
    }

    // Runs the frame-by-frame track translation animation in the given direction
    function animateTracks(direction, stepPx) {
        const start = performance.now();
        const startOffset = direction > 0 ? state.baseOffset : state.baseOffset - stepPx;
        const targetOffset = direction > 0 ? state.baseOffset - stepPx : state.baseOffset;

        function frame(now) {
            const rawProgress = Math.min(1, (now - start) / SCROLL_ANIMATION_MS);
            const easedProgress = easeInOutCubic(rawProgress);
            const currentOffset = startOffset + ((targetOffset - startOffset) * easedProgress);

            columns.forEach((column) => {
                column.track.style.transform = `translateY(${currentOffset}px)`;
            });

            drawLines();

            if (rawProgress < 1) {
                requestAnimationFrame(frame);
                return;
            }

            state.topRowIndex += direction;
            state.isAnimating = false;
            renderVisibleRows();
        }

        requestAnimationFrame(frame);
    }

    // Initiates a one-row scroll in the given direction if not already animating
    function scrollRecords(direction) {
        if (state.isAnimating) {
            return false;
        }

        const nextRowIndex = state.topRowIndex + direction;
        if (nextRowIndex < 0 || nextRowIndex > getMaxTopRowIndex()) {
            return false;
        }

        const rowStep = getRowStep();
        if (!rowStep) {
            return false;
        }

        state.isAnimating = true;
        updateButtonState();

        columns.forEach((column) => {
            const incomingSlot = createScrollCardSlot();
            const incomingRowIndex = direction > 0
                ? state.topRowIndex + state.visibleRows + SCROLL_BUFFER_ROWS
                : state.topRowIndex - SCROLL_BUFFER_ROWS - 1;

            applyRecordToSlot(incomingSlot, getRecordForPosition(incomingRowIndex, column.index));

            if (direction > 0) {
                applyScrollSlotState(incomingSlot, state.visibleRows + SCROLL_BUFFER_ROWS, state.visibleRows);
                column.track.append(incomingSlot);
            } else {
                applyScrollSlotState(incomingSlot, -SCROLL_BUFFER_ROWS - 1, state.visibleRows);
                column.track.prepend(incomingSlot);
                column.track.style.transform = `translateY(${state.baseOffset - rowStep}px)`;
            }
        });

        animateTracks(direction, rowStep);
        return true;
    }

    // Redraws lines repeatedly for a short duration to settle after initial render
    function animateInitialDraw(durationMs) {
        const start = performance.now();

        function frame(now) {
            drawLines();
            if (now - start < durationMs) {
                requestAnimationFrame(frame);
            }
        }

        requestAnimationFrame(frame);
    }

    // Normalises the API response into a flat array of category terms
    function extractCategoryTerms(data) {
        if (Array.isArray(data)) {
            return data;
        }
        if (Array.isArray(data?.terms)) {
            return data.terms;
        }
        if (Array.isArray(data?.clusters?.category?.terms)) {
            return data.clusters.category.terms;
        }
        return [];
    }

    // Converts raw category terms into card-shaped record objects
    function buildCategoryCardRecords(terms) {
        return terms
            .map((term, index) => {
                const value = String(
                    term?.value
                    || term?.text
                    || term?.label
                    || term?.name
                    || ""
                ).trim();

                if (!value) {
                    return null;
                }

                const id = String(term?.id || term?.identifier || "").trim();
                const count = Number(term?.count);
                const displayTitle = Number.isFinite(count) && count > 0
                    ? `${value} (${count})`
                    : value;

                const href = id
                    ? `/pages/scroll.html?mode=category-items&id_category=${encodeURIComponent(id)}&label=${encodeURIComponent(value)}`
                    : `/pages/scroll.html?mode=search&q=${encodeURIComponent(value)}`;

                return {
                    systemNumber: id || `category-${index}-${value.toLowerCase().replace(/\s+/g, "-")}`,
                    _displayTitle: displayTitle,
                    _customHref: href,
                    _isCategory: true,
                    _categoryId: id
                };
            })
            .filter(Boolean);
    }

    // Fetches preview images for the first few category cards
    async function hydrateCategoryPreviewImages(records) {
        if (!Array.isArray(records) || !records.length) {
            return;
        }

        const candidates = records
            .filter((record) => record?._isCategory && record?._categoryId)
            .slice(0, CATEGORY_PREVIEW_LIMIT);

        for (const record of candidates) {
            if (record._previewImageUrl) {
                continue;
            }

            try {
                const queryString = `id_category=${encodeURIComponent(record._categoryId)}&page_size=1&images_exist=1`;
                const data = await getData(objectSearchURL, queryString);
                const firstRecord = Array.isArray(data?.records) ? data.records[0] : null;
                const previewImageUrl = getScrollImageUrl(firstRecord || {});
                if (previewImageUrl) {
                    record._previewImageUrl = previewImageUrl;
                    renderVisibleRows();
                }
            } catch (error) {
                console.error("Failed to load category preview image", error);
            }
        }
    }

    // Loads search results from the V&A API and renders them into scroll cards
    function loadSearchResults() {
        if (!query) {
            state.records = [];
            state.topRowIndex = 0;
            state.emptyStateLabel = "No search query";
            renderVisibleRows();
            return;
        }

        const queryString = `${encodeURIComponent(query)}&page_size=${SCROLL_FETCH_SIZE}`;
        getData(searchURL, queryString).then((data) => {
            state.records = data?.records ?? [];
            state.topRowIndex = 0;
            state.emptyStateLabel = state.records.length ? "No result" : "No results found";
            renderVisibleRows();
        }).catch((error) => {
            console.error("Failed to populate scroll cards", error);
            state.records = [];
            state.emptyStateLabel = "Could not load results";
            renderVisibleRows();
        });
    }

    // Loads top-level category groups and renders them as category cards
    function loadCategoryGroups() {
        if (typeof getData !== "function" || typeof categoryClusterURL !== "string") {
            loadSearchResults();
            return;
        }

        const queryString = query
            ? `q=${encodeURIComponent(query)}&cluster_size=${SCROLL_FETCH_SIZE}`
            : `cluster_size=${SCROLL_FETCH_SIZE}`;
        getData(categoryClusterURL, queryString).then((data) => {
            const terms = extractCategoryTerms(data);
            state.records = buildCategoryCardRecords(terms);
            state.topRowIndex = 0;
            state.emptyStateLabel = state.records.length ? "No result" : "No category results found";
            renderVisibleRows();
            if (typeof objectSearchURL === "string" && objectSearchURL) {
                hydrateCategoryPreviewImages(state.records);
            }
        }).catch((error) => {
            console.error("Failed to load categories", error);
            state.records = [];
            state.emptyStateLabel = "Could not load categories";
            renderVisibleRows();
        });
    }

    // Loads individual items within a selected category
    function loadCategoryItems() {
        if (!categoryId) {
            state.records = [];
            state.topRowIndex = 0;
            state.emptyStateLabel = "No category selected";
            renderVisibleRows();
            return;
        }

        if (typeof getData !== "function" || typeof objectSearchURL !== "string") {
            state.records = [];
            state.topRowIndex = 0;
            state.emptyStateLabel = "Could not load category items";
            renderVisibleRows();
            return;
        }

        const queryString = `id_category=${encodeURIComponent(categoryId)}&page_size=${SCROLL_FETCH_SIZE}`;
        getData(objectSearchURL, queryString).then((data) => {
            state.records = data?.records ?? [];
            state.topRowIndex = 0;
            state.emptyStateLabel = state.records.length
                ? "No result"
                : (categoryLabel ? `No items found for ${categoryLabel}` : "No items found for category");
            renderVisibleRows();
        }).catch((error) => {
            console.error("Failed to load category items", error);
            state.records = [];
            state.emptyStateLabel = "Could not load category items";
            renderVisibleRows();
        });
    }

    // Wire test buttons to scroll up/down
    buttons.forEach((button) => {
        button.addEventListener("click", () => {
            const direction = Number(button.dataset.direction || "0");
            if (direction) {
                scrollRecords(direction);
            }
        });
    });

    // Expose scroll controls to voice-commands.js
    window.scrollPageController = {
        scroll(direction) {
            return scrollRecords(direction);
        },
        redraw() {
            drawLines();
        }
    };

    // Initial render and brief animation pass
    renderVisibleRows();
    animateInitialDraw(1400);

    // Load data for the current mode
    if (mode === "categories") {
        loadCategoryGroups();
    } else if (mode === "category-items") {
        loadCategoryItems();
    } else {
        loadSearchResults();
    }

    // Re-render or redraw when the layout changes (resize or mic animation end)
    function handleLayoutChange() {
        if (syncVisibleRows()) {
            renderVisibleRows();
            return;
        }

        updateViewportHeights();
        drawLines();
    }

    mic.addEventListener("animationend", handleLayoutChange);
    window.addEventListener("resize", handleLayoutChange);

    // Use ResizeObserver for more reliable layout change detection
    if ("ResizeObserver" in window) {
        resizeObserver = new ResizeObserver(handleLayoutChange);
        resizeObserver.observe(scrollBox);
        columns.forEach((column) => {
            resizeObserver.observe(column.viewport);
        });
    }
});
