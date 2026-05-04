const COLLECTION_SEARCH_URL = "https://api.vam.ac.uk/v2/objects/search?";
const COLLECTION_PERSON_URL = "https://api.vam.ac.uk/v2/person/";
const COLLECTION_ORGANISATION_URL = "https://api.vam.ac.uk/v2/organisation/";
const COLLECTION_CREATOR_PAGE_SIZE = 100;
const COLLECTION_DESKTOP_VISIBLE_CREATOR_COUNT = 5;
const COLLECTION_MOBILE_VISIBLE_CREATOR_COUNT = 6;
const COLLECTION_MOBILE_BREAKPOINT = 760;
const COLLECTION_PANEL_ITEM_COUNT = 6;
const FEATURED_CREATORS = [
    { id: "A8676", label: "William Morris" },
    { id: "A8296", label: "Walter Crane" },
    { id: "A8134", label: "Aubrey Beardsley" },
    { id: "A8328", label: "William de Morgan" },
    { id: "A7595", label: "Arthur Rackham" },
    { id: "A6630", label: "J. B. Yeats" },
    { id: "A2265", label: "Alphonse Mucha" }
];
window.addEventListener("load", () => {
    initializeCollectionPage().catch((error) => {
        console.error("Collection page initialization failed", error);
    });
});

async function initializeCollectionPage() {
    const page = document.querySelector(".collection-page");
    const banner = page?.querySelector(".banner");
    const bannerLink = banner?.closest("a");
    const bannerTitle = banner?.querySelector("h2");
    const bannerDescription = banner?.querySelector("span");
    const carousel = page?.querySelector(".carousel");
    const visibleCreatorCount = getCollectionVisibleCreatorCount();
    const centerSlot = getCollectionCenterSlot(visibleCreatorCount);
    ensureCarouselSlots(carousel, visibleCreatorCount);
    const arrows = carousel ? Array.from(carousel.querySelectorAll(".arrow")) : [];
    const carouselLinks = carousel
        ? Array.from(carousel.children).filter((element) => element.tagName === "A")
        : [];
    const carouselCards = carouselLinks.map((link) => link.querySelector(".image-card"));
    const itemGrid = page?.querySelector(".item-grid");
    const collectionTitle = itemGrid?.querySelector(".collection-text h2");
    const collectionDescription = itemGrid?.querySelector(".collection-text p");
    const panelLinks = itemGrid
        ? Array.from(itemGrid.children).filter((element) => element.tagName === "A")
        : [];
    const panelCards = panelLinks.map((link) => link.querySelector(".image-card"));
    const params = new URLSearchParams(window.location.search);
    const creatorQuery = params.get("creator")?.trim() || "";

    if (
        !page || !banner || !bannerLink || !bannerTitle || !bannerDescription || !carousel ||
        arrows.length < 2 || !itemGrid || !collectionTitle || !collectionDescription ||
        carouselCards.some((card) => !card) || panelCards.some((card) => !card)
    ) {
        return;
    }

    const state = {
        carousel,
        banner,
        bannerLink,
        bannerTitle,
        bannerDescription,
        leftArrow: arrows[0],
        rightArrow: arrows[1],
        visibleCreatorCount,
        centerSlot,
        carouselLinks,
        carouselCards,
        collectionTitle,
        collectionDescription,
        panelLinks,
        panelCards,
        creators: [],
        activeCreatorId: "",
        startIndex: 0,
        isBusy: false
    };

    wireCollectionArrow(state.leftArrow, "Previous creators", () => moveCreatorWindow(state, -1));
    wireCollectionArrow(state.rightArrow, "Next creators", () => moveCreatorWindow(state, 1));
    wireCarouselCards(state);

    const creatorBuild = await buildCollectionCreators(creatorQuery);
    state.creators = creatorBuild.creators;
    state.activeCreatorId = creatorBuild.selectedCreatorId || "";

    if (!state.creators.length) {
        renderCollectionErrorState(state, creatorBuild.unresolvedQuery);
        return;
    }

    if (creatorBuild.selectedCreatorId) {
        const selectedIndex = state.creators.findIndex((creator) => creator.id === creatorBuild.selectedCreatorId);
        if (selectedIndex >= 0) {
            const maxStartIndex = Math.max(0, state.creators.length - state.visibleCreatorCount);
            state.startIndex = clampNumber(selectedIndex - state.centerSlot, 0, maxStartIndex);
        }
    }

    if (!state.activeCreatorId) {
        state.activeCreatorId = getCenteredCreator(state)?.id || state.creators[0]?.id || "";
    }

    renderCollectionState(state, { updateUrl: Boolean(creatorQuery) });
    wireCollectionResize(state);

    if (creatorBuild.backgroundCreatorDefinitions?.length) {
        loadBackgroundCreators(state, creatorBuild.backgroundCreatorDefinitions);
    }
}

function getCollectionVisibleCreatorCount() {
    return window.matchMedia(`(max-width: ${COLLECTION_MOBILE_BREAKPOINT}px)`).matches
        ? COLLECTION_MOBILE_VISIBLE_CREATOR_COUNT
        : COLLECTION_DESKTOP_VISIBLE_CREATOR_COUNT;
}

function getCollectionCenterSlot(visibleCreatorCount) {
    return Math.floor((visibleCreatorCount - 1) / 2);
}

function ensureCarouselSlots(carousel, requiredCount) {
    if (!carousel) {
        return;
    }

    const links = Array.from(carousel.children).filter((element) => element.tagName === "A");

    for (let i = links.length; i < requiredCount; i += 1) {
        const anchor = document.createElement("a");
        anchor.href = "#";

        const card = document.createElement("div");
        card.className = "image-card loading";

        const label = document.createElement("span");
        label.textContent = "Loading creator";

        card.appendChild(label);
        anchor.appendChild(card);

        const rightArrow = carousel.querySelector(".arrow:last-of-type");
        if (rightArrow) {
            carousel.insertBefore(anchor, rightArrow);
        } else {
            carousel.appendChild(anchor);
        }
    }
}

function syncCarouselSlots(state, requiredCount) {
    if (!state.carousel) {
        return;
    }

    const links = Array.from(state.carousel.children).filter((element) => element.tagName === "A");

    if (links.length > requiredCount) {
        for (let i = links.length - 1; i >= requiredCount; i -= 1) {
            links[i].remove();
        }
    } else if (links.length < requiredCount) {
        ensureCarouselSlots(state.carousel, requiredCount);
    }

    state.carouselLinks = Array.from(state.carousel.children).filter((element) => element.tagName === "A");
    state.carouselCards = state.carouselLinks.map((link) => link.querySelector(".image-card"));
}

function wireCollectionResize(state) {
    let resizeTimer = null;

    window.addEventListener("resize", () => {
        if (resizeTimer) {
            window.clearTimeout(resizeTimer);
        }

        resizeTimer = window.setTimeout(() => {
            refreshCollectionCarouselLayout(state);
        }, 120);
    });
}

function refreshCollectionCarouselLayout(state) {
    const nextVisibleCount = getCollectionVisibleCreatorCount();
    if (nextVisibleCount === state.visibleCreatorCount) {
        return;
    }

    state.visibleCreatorCount = nextVisibleCount;
    state.centerSlot = getCollectionCenterSlot(nextVisibleCount);

    syncCarouselSlots(state, nextVisibleCount);
    wireCarouselCards(state);

    const maxStartIndex = Math.max(0, state.creators.length - state.visibleCreatorCount);
    state.startIndex = clampNumber(state.startIndex, 0, maxStartIndex);

    if (!state.activeCreatorId) {
        state.activeCreatorId = getCenteredCreator(state)?.id || state.creators[0]?.id || "";
    }

    renderCollectionState(state, { updateUrl: false });
}

async function buildCollectionCreators(creatorQuery) {
    if (creatorQuery) {
        const featured = findFeaturedCreator(creatorQuery);
        const collection = featured
            ? await loadCreatorById(featured)
            : await loadCreatorByName(creatorQuery);

        if (collection && collection.records.length > 0) {
            const excludeId = collection.id || "";
            return {
                creators: [collection],
                selectedCreatorId: collection.id,
                unresolvedQuery: "",
                backgroundCreatorDefinitions: FEATURED_CREATORS.filter((c) => c.id !== excludeId)
            };
        }

        return {
            creators: [],
            selectedCreatorId: "",
            unresolvedQuery: creatorQuery,
            backgroundCreatorDefinitions: []
        };
    }

    let initialCreator = null;
    let initialCreatorIndex = -1;

    for (let i = 0; i < FEATURED_CREATORS.length; i += 1) {
        const creator = await loadCreatorById(FEATURED_CREATORS[i]);
        if (creator.records.length >= 3) {
            initialCreator = creator;
            initialCreatorIndex = i;
            break;
        }
    }

    if (!initialCreator) {
        return {
            creators: [],
            selectedCreatorId: "",
            unresolvedQuery: "",
            backgroundCreatorDefinitions: []
        };
    }

    const backgroundCreatorDefinitions = [
        ...FEATURED_CREATORS.slice(initialCreatorIndex + 1),
        ...FEATURED_CREATORS.slice(0, initialCreatorIndex)
    ];

    return {
        creators: [initialCreator],
        selectedCreatorId: initialCreator.id,
        unresolvedQuery: "",
        backgroundCreatorDefinitions
    };
}

async function loadBackgroundCreators(state, creatorDefinitions) {
    for (const creatorDefinition of creatorDefinitions) {
        const exists = state.creators.some((creator) => creator.id === creatorDefinition.id);
        if (exists) {
            continue;
        }

        const creator = await loadCreatorById(creatorDefinition);
        if (creator.records.length < 3) {
            continue;
        }

        state.creators.push(creator);
        renderCollectionState(state, { updateUrl: false });
    }
}

function wireCollectionArrow(arrow, label, onActivate) {
    arrow.setAttribute("tabindex", "0");
    arrow.style.cursor = "pointer";

    arrow.addEventListener("click", () => {
        onActivate();
    });

    arrow.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onActivate();
        }
    });
}

function wireCarouselCards(state) {
    state.carouselLinks.forEach((link, slot) => {
        if (link.dataset.carouselBound === "true") {
            return;
        }

        link.dataset.carouselBound = "true";
        link.addEventListener("click", (event) => {
            const creatorIndex = state.startIndex + slot;
            const creator = state.creators[creatorIndex];

            event.preventDefault();
            if (!creator) {
                return;
            }

            centerCarouselOnCreator(state, creatorIndex);
        });
    });
}

async function moveCreatorWindow(state, direction) {
    if (state.isBusy) {
        return;
    }

    const maxStartIndex = Math.max(0, state.creators.length - state.visibleCreatorCount);
    const nextStartIndex = clampNumber(state.startIndex + direction, 0, maxStartIndex);

    if (nextStartIndex === state.startIndex) {
        return;
    }

    state.isBusy = true;
    state.startIndex = nextStartIndex;
    state.activeCreatorId = getCenteredCreator(state)?.id || state.activeCreatorId;
    renderCollectionState(state, { updateUrl: true });
    state.isBusy = false;
}

function centerCarouselOnCreator(state, creatorIndex) {
    const maxStartIndex = Math.max(0, state.creators.length - state.visibleCreatorCount);
    state.startIndex = clampNumber(creatorIndex - state.centerSlot, 0, maxStartIndex);
    state.activeCreatorId = state.creators[creatorIndex]?.id || state.activeCreatorId;
    renderCollectionState(state, { updateUrl: true });
}

function findFeaturedCreator(query) {
    const variants = getCreatorQueryVariants(query);
    return FEATURED_CREATORS.find((creator) => {
        return variants.some((variant) => namesLikelyMatch(creator.label, variant));
    }) || null;
}

async function loadCreatorById(creator) {
    const parameters = `id_maker=${encodeURIComponent(creator.id)}&page_size=${COLLECTION_CREATOR_PAGE_SIZE}`;
    const [data, authorityBio] = await Promise.all([
        getData(COLLECTION_SEARCH_URL, parameters),
        fetchCreatorAuthorityBio(creator.id)
    ]);

    return buildCreatorFromResponse(data, creator.id, creator.label, authorityBio);
}

async function loadCreatorByName(query) {
    const variants = getCreatorQueryVariants(query);

    for (const variant of variants) {
        const parameters = `q_actor=${encodeURIComponent(variant)}&page_size=${COLLECTION_CREATOR_PAGE_SIZE}`;
        const data = await getData(COLLECTION_SEARCH_URL, parameters);
        const allRecords = filterImageRecords(data?.records ?? []);
        if (!allRecords.length) continue;

        // Find records whose _primaryMaker matches the query, not some other collaborator.
        const matchingRecords = allRecords.filter((r) => {
            const maker = r?._primaryMaker?.name?.trim();
            return maker && variants.some((v) => namesLikelyMatch(maker, v));
        });

        const records = matchingRecords.length ? matchingRecords : allRecords;
        const makerName = records[0]?._primaryMaker?.name?.trim() || query;

        return {
            id: "",
            label: makerName,
            displayName: makerName,
            description: buildCreatorSummary(records[0], records.length),
            recordCount: records.length,
            records
        };
    }

    return null;
}

function buildCreatorFromResponse(data, id, label, authorityBio = "") {
    const records = filterImageRecords(data?.records ?? []);
    const heroRecord = records[0] || null;
    const displayName = heroRecord?._primaryMaker?.name?.trim() || label;
    const fallbackSummary = buildCreatorSummary(heroRecord, Number(data?.info?.record_count) || records.length);

    return {
        id,
        label,
        displayName,
        description: authorityBio || fallbackSummary,
        recordCount: Number(data?.info?.record_count) || records.length,
        records
    };
}

async function fetchCreatorAuthorityBio(systemNumber) {
    if (!systemNumber) {
        return "";
    }

    const person = await getData(COLLECTION_PERSON_URL, encodeURIComponent(systemNumber));
    const personBio = normalizeAuthorityText(person?.biography);
    if (personBio) {
        return personBio;
    }

    const organisation = await getData(COLLECTION_ORGANISATION_URL, encodeURIComponent(systemNumber));
    const organisationHistory = normalizeAuthorityText(organisation?.history);
    if (organisationHistory) {
        return organisationHistory;
    }

    return "";
}

function normalizeAuthorityText(text) {
    if (typeof text !== "string") {
        return "";
    }

    const cleaned = decodeHtmlEntities(text)
        .replace(/\r\n|\n|\r/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    return cleaned;
}

function decodeHtmlEntities(text) {
    const node = document.createElement("textarea");
    node.innerHTML = text;
    return node.value;
}

function filterImageRecords(records) {
    return records.filter((record) => getRecordImageUrl(record));
}

function buildCreatorSummary(record, recordCount) {
    const date = record?._primaryDate?.trim();
    const place = record?._primaryPlace?.trim();

    if (date && place) {
        return `${recordCount} objects in the V&A API. Featured work from ${place}, ${date}.`;
    }

    if (date) {
        return `${recordCount} objects in the V&A API. Featured work dated ${date}.`;
    }

    if (place) {
        return `${recordCount} objects in the V&A API. Featured work associated with ${place}.`;
    }

    return `${recordCount} objects in the V&A API.`;
}

function renderCollectionState(state, options = {}) {
    renderCreatorCarousel(state);
    renderSelectedCreator(state, options);
    updateCollectionArrows(state);
}

function renderCreatorCarousel(state) {
    state.carouselCards.forEach((card, slot) => {
        const creator = state.creators[state.startIndex + slot];
        const link = state.carouselLinks[slot];
        const label = card?.querySelector("span");

        card.classList.toggle("image-card-center", slot === state.centerSlot);

        if (!creator || !label) {
            card.classList.add("loading");
            card.style.backgroundImage = "";
            card.style.backgroundSize = "";
            card.style.backgroundPosition = "";
            card.style.backgroundRepeat = "";
            label.textContent = "Loading creator";
            link.setAttribute("data-disabled", "true");
            link.tabIndex = -1;
            link.href = "#";
            return;
        }

        applyRecordToImageCard(card, creator.records[0]);
        label.textContent = creator.displayName;
        link.removeAttribute("data-disabled");
        link.tabIndex = 0;
        link.href = `#creator-${creator.id}`;
    });
}

function renderSelectedCreator(state, options = {}) {
    const creator = getActiveCreator(state);

    if (!creator) {
        renderCollectionErrorState(state, "");
        return;
    }

    renderCreatorBanner(state, creator);
    renderCreatorPanel(state, creator);

    if (options.updateUrl) {
        updateCollectionUrl(creator.displayName);
    }
}

function getActiveCreator(state) {
    const activeCreator = state.creators.find((creator) => creator.id === state.activeCreatorId);
    if (activeCreator) {
        return activeCreator;
    }

    return getCenteredCreator(state) || state.creators[0] || null;
}

function getCenteredCreator(state) {
    const selectedIndex = Math.min(state.startIndex + state.centerSlot, state.creators.length - 1);
    return state.creators[selectedIndex] || null;
}

function renderCreatorBanner(state, creator) {
    const heroRecord = creator.records[0];
    const imageUrl = getRecordImageUrl(heroRecord);
    const bannerSummary = buildCreatorSummary(heroRecord, creator.recordCount);

    if (imageUrl) {
        state.banner.style.backgroundImage = `linear-gradient(rgba(8, 10, 12, 0.2), rgba(8, 10, 12, 0.72)), url('${imageUrl}')`;
        state.banner.style.backgroundSize = "cover";
        state.banner.style.backgroundPosition = "center";
        state.banner.classList.remove("loading");
    }

    state.bannerTitle.textContent = creator.displayName;
    state.bannerDescription.textContent = bannerSummary;
    state.bannerLink.href = getItemPageUrl(heroRecord);
}

function renderCreatorPanel(state, creator) {
    state.collectionTitle.textContent = creator.displayName;
    state.collectionDescription.textContent = creator.description;

    state.panelCards.forEach((card, index) => {
        const record = creator.records[index];
        const link = state.panelLinks[index];
        const label = card?.querySelector("span");

        if (!record || !card || !label) {
            card.classList.add("loading");
            card.style.backgroundImage = "";
            card.style.backgroundSize = "";
            card.style.backgroundPosition = "";
            card.style.backgroundRepeat = "";
            label.textContent = "No item available";
            link.href = "#";
            link.setAttribute("data-disabled", "true");
            link.tabIndex = -1;
            return;
        }

        applyRecordToImageCard(card, record);
        label.textContent = getRecordTitle(record);
        link.href = getItemPageUrl(record);
        link.removeAttribute("data-disabled");
        link.tabIndex = 0;
    });
}

function renderCollectionErrorState(state, unresolvedQuery = "") {
    state.banner.classList.remove("loading");
    state.banner.style.backgroundImage = "";
    state.bannerTitle.textContent = unresolvedQuery ? `No collection for ${unresolvedQuery}` : "Collections unavailable";
    state.bannerDescription.textContent = unresolvedQuery
        ? `I could not resolve ${unresolvedQuery} to a V&A maker collection.`
        : "The V&A API did not return enough creator collections for this page.";
    state.collectionTitle.textContent = unresolvedQuery ? `No collection for ${unresolvedQuery}` : "Collections unavailable";
    state.collectionDescription.textContent = unresolvedQuery
        ? "Try another creator name or use a more specific phrase."
        : "Please try again in a moment.";
}

function updateCollectionUrl(creatorName) {
    if (!creatorName || !window.history?.replaceState) {
        return;
    }

    const params = new URLSearchParams(window.location.search);
    params.set("creator", creatorName);
    const queryString = params.toString();
    const nextUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ""}`;
    window.history.replaceState(null, "", nextUrl);
}

function updateCollectionArrows(state) {
    const maxStartIndex = Math.max(0, state.creators.length - state.visibleCreatorCount);
    const disableLeft = state.startIndex <= 0;
    const disableRight = state.startIndex >= maxStartIndex;

    setArrowDisabled(state.leftArrow, disableLeft);
    setArrowDisabled(state.rightArrow, disableRight);
}

function setArrowDisabled(arrow, isDisabled) {
    arrow.style.opacity = isDisabled ? "0.35" : "1";
    arrow.style.pointerEvents = isDisabled ? "none" : "auto";
    arrow.setAttribute("data-disabled", String(isDisabled));
}

function applyRecordToImageCard(card, record) {
    const imageUrl = getRecordImageUrl(record);

    if (!imageUrl) {
        card.classList.add("loading");
        card.style.backgroundImage = "";
        card.style.backgroundSize = "";
        card.style.backgroundPosition = "";
        card.style.backgroundRepeat = "";
        return;
    }

    card.style.backgroundImage = `linear-gradient(rgba(8, 10, 12, 0.16), rgba(8, 10, 12, 0.62)), url('${imageUrl}')`;
    card.style.backgroundSize = "cover, cover";
    card.style.backgroundPosition = "center";
    card.style.backgroundRepeat = "no-repeat";
    card.classList.remove("loading");
}

function getRecordImageUrl(record) {
    const iiifBase = record?._images?._iiif_image_base_url;
    if (iiifBase) {
        return `${iiifBase}full/900,/0/default.jpg`;
    }

    return record?._images?._primary_thumbnail || "";
}

function getRecordTitle(record) {
    if (record?._primaryTitle?.trim()) {
        return record._primaryTitle.trim();
    }

    if (record?.objectType?.trim()) {
        return record.objectType.trim();
    }

    return "Untitled object";
}

function getItemPageUrl(record) {
    if (!record?.systemNumber) {
        return "item.html";
    }

    return `item.html?id=${encodeURIComponent(record.systemNumber)}`;
}

function clampNumber(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function normalizeCreatorText(value) {
    if (typeof value !== "string") {
        return "";
    }

    return value
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function getCreatorQueryVariants(query) {
    const normalized = normalizeCreatorText(query);
    if (!normalized) {
        return [];
    }

    const tokens = normalized.split(" ").filter(Boolean);
    const variants = new Set([normalized]);

    if (tokens.length >= 2) {
        const swapped = `${tokens[tokens.length - 1]}, ${tokens.slice(0, -1).join(" ")}`;
        variants.add(normalizeCreatorText(swapped));
    }

    if (tokens.length >= 3) {
        const rotated = `${tokens.slice(1).join(" ")} ${tokens[0]}`;
        variants.add(normalizeCreatorText(rotated));
    }

    return Array.from(variants);
}

function namesLikelyMatch(nameA, nameB) {
    const normalizedA = normalizeCreatorText(nameA);
    const normalizedB = normalizeCreatorText(nameB);

    if (!normalizedA || !normalizedB) {
        return false;
    }

    if (normalizedA === normalizedB || normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)) {
        return true;
    }

    const tokensA = normalizedA.split(" ").filter(Boolean);
    const tokensB = normalizedB.split(" ").filter(Boolean);

    if (!tokensA.length || !tokensB.length) {
        return false;
    }

    return tokensB.every((token) => tokensA.includes(token)) || tokensA.every((token) => tokensB.includes(token));
}
