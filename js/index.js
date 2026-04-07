window.addEventListener("load", async () => {
    const banner = document.querySelector(".banner");
    const bannerLink = banner?.closest("a");
    const bannerTitle = banner?.querySelector("h2");
    const bannerDescription = banner?.querySelector("span");

    try {
        const wallaceQuery = `${encodeURIComponent("wallace and gromit")}&page_size=12`;

        const wallaceData = await getData(searchURL, wallaceQuery);

        const wallaceRecords = getImageRecords(wallaceData?.records ?? []);

        updateBanner({
            banner,
            bannerLink,
            bannerTitle,
            bannerDescription,
            record: wallaceRecords[0]
        });
    } catch (error) {
        console.error("Failed to load homepage content", error);
    }
});

function getImageRecords(records) {
    return records.filter((record) => getBestImageUrl(record));
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

function getDisplaySummary(record) {
    const maker = record?._primaryMaker?.name?.trim();
    const place = record?._primaryPlace?.trim();
    const date = record?._primaryDate?.trim();

    if (maker && date) {
        return `${maker}, ${date}`;
    }

    if (maker && place) {
        return `${maker}, ${place}`;
    }

    if (date) {
        return date;
    }

    if (place) {
        return place;
    }

    return "V&A collection highlight";
}

function getCollectionsUrl(record) {
    if (!record?.systemNumber) {
        return "pages/item.html";
    }

    return `pages/item.html?id=${encodeURIComponent(record.systemNumber)}`;
}

function updateBanner({ banner, bannerLink, bannerTitle, bannerDescription, record }) {
    if (!banner || !record) {
        return;
    }

    const imageUrl = getBestImageUrl(record);
    banner.style.backgroundImage = `linear-gradient(rgba(8, 10, 12, 0.2), rgba(8, 10, 12, 0.72)), url('${imageUrl}')`;
    banner.style.backgroundSize = "cover";
    banner.style.backgroundPosition = "center";
    banner.classList.remove("loading");

    if (bannerTitle) {
        bannerTitle.textContent = getDisplayTitle(record);
    }

    if (bannerDescription) {
        bannerDescription.textContent = getDisplaySummary(record);
    }

    if (bannerLink) {
        bannerLink.href = getCollectionsUrl(record);
        bannerLink.target = "_blank";
        bannerLink.rel = "noopener noreferrer";
    }
}
