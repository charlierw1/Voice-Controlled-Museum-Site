async function populateScrollCards(cardElements) {
    const params = new URLSearchParams(window.location.search);
    const query = params.get("q");

    if (!query) {
        cardElements.forEach((card) => {
            card.classList.remove("loading");
            const label = card.querySelector("span");
            if (label) {
                label.textContent = "No search query";
            }
        });
        return;
    }

    const queryString = `${encodeURIComponent(query)}&page_size=${cardElements.length}`;
    const data = await getData(searchURL, queryString);
    const records = data?.records ?? [];

    cardElements.forEach((card, index) => {
        const record = records[index];
        const anchor = card.parentElement;

        card.classList.remove("loading");

        const label = card.querySelector("span");

        if (!record) {
            if (label) {
                label.textContent = "No result";
            }
            return;
        }

        const imageUrl = getScrollImageUrl(record);
        if (imageUrl) {
            card.style.backgroundImage = `linear-gradient(rgba(8, 10, 12, 0.16), rgba(8, 10, 12, 0.62)), url('${imageUrl}')`;
            card.style.backgroundSize = "cover, cover";
            card.style.backgroundPosition = "center";
            card.style.backgroundRepeat = "no-repeat";
        }

        if (label) {
            label.textContent = getScrollDisplayTitle(record);
        }

        if (anchor && record?.systemNumber) {
            anchor.href = `item.html?id=${encodeURIComponent(record.systemNumber)}`;
        }
    });
}

function getScrollImageUrl(record) {
    const iiifBase = record?._images?._iiif_image_base_url;
    if (iiifBase) {
        return `${iiifBase}full/900,/0/default.jpg`;
    }
    return record?._images?._primary_thumbnail || "";
}

function getScrollDisplayTitle(record) {
    if (record?._primaryTitle?.trim()) {
        return record._primaryTitle.trim();
    }
    if (record?.objectType?.trim()) {
        return record.objectType.trim();
    }
    return "Untitled object";
}

window.addEventListener("load", () => {
    const scrollBox = document.querySelector(".scroll-page .scroll-box");
    const mic = scrollBox?.querySelector(".mic");
    const cards = scrollBox ? Array.from(scrollBox.querySelectorAll(".image-card")) : [];

    if (!scrollBox || !mic || !cards.length) {
        return;
    }

    const canvas = document.createElement("canvas");
    canvas.className = "scroll-lines-canvas";
    scrollBox.prepend(canvas);

    const context = canvas.getContext("2d");
    if (!context) {
        return;
    }

    let resizeObserver;

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

    function drawLines() {
        resizeCanvas();

        const boxRect = scrollBox.getBoundingClientRect();
        const micRect = mic.getBoundingClientRect();
        const micX = micRect.left + micRect.width / 2 - boxRect.left;
        const micY = micRect.top + micRect.height / 2 - boxRect.top;
        const micRadius = Math.min(micRect.width, micRect.height) / 2;

        context.clearRect(0, 0, boxRect.width, boxRect.height);
        context.strokeStyle = "#000000";
        context.lineWidth = 2;
        context.lineCap = "round";

        const leftTargets = [];
        const rightTargets = [];

        cards.forEach((card) => {
            const cardRect = card.getBoundingClientRect();
            const cardCenterX = cardRect.left + cardRect.width / 2 - boxRect.left;
            const cardCenterY = cardRect.top + cardRect.height / 2 - boxRect.top;
            const cardLeft = cardRect.left - boxRect.left;
            const cardRight = cardRect.right - boxRect.left;

            if (cardCenterX < micX) {
                leftTargets.push({ x: cardRight, y: cardCenterY });
            } else {
                rightTargets.push({ x: cardLeft, y: cardCenterY });
            }
        });

        leftTargets.sort((a, b) => b.y - a.y);
        rightTargets.sort((a, b) => a.y - b.y);

        const leftAnchors = buildAnchorsOnArc(micX, micY, micRadius, 145, 215, leftTargets.length);
        const rightAnchors = buildAnchorsOnArc(micX, micY, micRadius, -35, 35, rightTargets.length);

        leftTargets.forEach((target, index) => {
            const anchor = leftAnchors[index];
            if (!anchor) {
                return;
            }

            context.beginPath();
            context.moveTo(anchor.x, anchor.y);
            context.lineTo(target.x, target.y);
            context.stroke();
        });

        rightTargets.forEach((target, index) => {
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

    function buildAnchorsOnArc(centerX, centerY, radius, startDeg, endDeg, count) {
        if (count <= 0) {
            return [];
        }

        const anchors = [];
        const step = count === 1 ? 0 : (endDeg - startDeg) / (count - 1);

        for (let i = 0; i < count; i += 1) {
            const angleDeg = count === 1 ? (startDeg + endDeg) / 2 : startDeg + step * i;
            const angleRad = (angleDeg * Math.PI) / 180;

            anchors.push({
                x: centerX + Math.cos(angleRad) * radius,
                y: centerY + Math.sin(angleRad) * radius
            });
        }

        return anchors;
    }

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

    drawLines();
    animateInitialDraw(1400);

    populateScrollCards(cards).then(() => {
        drawLines();
    }).catch((error) => {
        console.error("Failed to populate scroll cards", error);
    });

    mic.addEventListener("animationend", drawLines);
    window.addEventListener("resize", drawLines);
    window.addEventListener("scroll", drawLines, { passive: true });

    if ("ResizeObserver" in window) {
        resizeObserver = new ResizeObserver(drawLines);
        resizeObserver.observe(scrollBox);
    }
});
