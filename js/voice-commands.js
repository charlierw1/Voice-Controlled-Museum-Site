(function () {
  if (window.voiceCommandsInitialized) return;
  window.voiceCommandsInitialized = true;

  const annyang = window.annyang;
  if (!annyang) return;

  /* -----------------------------------------------
     Constants
     ----------------------------------------------- */

  const ORDINAL_WORDS = ["first", "second", "third"];
  const CARDINAL_TO_INDEX = {
    one: 0, won: 0, two: 1, to: 1, too: 1, three: 2,
    four: 3, for: 3, five: 4, six: 5, seven: 6,
    eight: 7, ate: 7, nine: 8
  };
  const CLARIFICATION_TIMEOUT_MS = 22000;

  // Each command's JSON config path.
  const COMMAND_DEFS = {
    home:                    ["directCommands", "navigation", "home"],
    help:                    ["directCommands", "navigation", "help"],
    listCategories:          ["directCommands", "navigation", "listCategories"],
    cancel:                  ["directCommands", "pageCommands", "cancel"],
    carouselLeft:            ["directCommands", "pageCommands", "carouselLeft"],
    carouselRight:           ["directCommands", "pageCommands", "carouselRight"],
    scrollUp:                ["directCommands", "pageCommands", "scrollUp"],
    scrollDown:              ["directCommands", "pageCommands", "scrollDown"],
    readCurrentItem:         ["directCommands", "pageCommands", "readCurrentItem"],
    openCurrentItemOverlay:  ["directCommands", "pageCommands", "openCurrentItemOverlay"],
    closeItemOverlay:        ["directCommands", "pageCommands", "closeItemOverlay"],
    creatorCollectionSearch: ["parameterizedCommands", "navigation", "creatorCollectionSearch"],
    search:                  ["parameterizedCommands", "navigation", "search"],
    openItemByPosition:      ["parameterizedCommands", "navigation", "openItemByPosition"],
    openItemOnPage:          ["parameterizedCommands", "navigation", "openItemOnPage"],
    goToPage:                ["parameterizedCommands", "navigation", "goToPage"],
    objectExplanation:       ["disambiguatedParameterizedCommands", "objectExplanation"],
    similarItems:            ["disambiguatedDirectCommands", "similarItems"]
  };

  /* -----------------------------------------------
     State
     ----------------------------------------------- */

  let commandPhrases = {};
  let clarificationState = null;
  let clarificationToken = 0;
  let overlayElement = null;
  let escapeCommandPhrases = [];

  /* -----------------------------------------------
     Speech Utilities
     ----------------------------------------------- */

  let isSpeaking = false;

  function setSpeaking(active) {
    isSpeaking = active;
    const svg = document.querySelector(".mic svg");
    if (!svg) return;
    if (active) {
      svg.classList.remove("listening");
      svg.classList.add("speaking");
    } else {
      svg.classList.remove("speaking");
    }
  }

  function speak(text, onComplete) {
    if (!text) { onComplete?.(); return; }
    if (window.speechSynthesis && typeof SpeechSynthesisUtterance === "function") {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onstart = () => {
        unregisterBaseCommands();
        annyang.abort();
        setSpeaking(true);
        const escCmds = {};
        (commandPhrases.cancel || []).forEach(p => { escCmds[p] = () => interruptSpeech(() => HANDLERS.cancel()); });
        (commandPhrases.help || []).forEach(p => { escCmds[p] = () => interruptSpeech(() => HANDLERS.help()); });
        escapeCommandPhrases = Object.keys(escCmds);
        annyang.addCommands(escCmds);
        annyang.start();
      };
      utterance.onend = () => { endSpeaking(); onComplete?.(); };
      utterance.onerror = () => { endSpeaking(); onComplete?.(); };
      window.speechSynthesis.speak(utterance);
      return;
    }
    onComplete?.();
  }

  function interruptSpeech(fn) {
    window.speechSynthesis.cancel();
    endSpeaking();
    fn();
  }

  function endSpeaking() {
    if (escapeCommandPhrases.length) {
      annyang.removeCommands(escapeCommandPhrases);
      escapeCommandPhrases = [];
    }
    setSpeaking(false);
    registerBaseCommands();
    annyang.start();
  }
  function sanitize(input) {
    return typeof input === "string"
      ? input.trim().replace(/^[\s,.;:!?-]+|[\s,.;:!?-]+$/g, "").replace(/\s+/g, " ")
      : "";
  }

  function normalize(input) {
    return typeof input === "string"
      ? input.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()
      : "";
  }

  /* -----------------------------------------------
     Configuration Loading
     ----------------------------------------------- */

  async function loadConfig(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load ${url}: ${res.statusText}`);
    return await res.json();
  }

  function resolvePhrases(config, path) {
    let node = config;
    for (const key of path) {
      if (!node || typeof node !== "object") return [];
      node = node[key];
    }
    if (Array.isArray(node)) return node;
    if (node && typeof node === "object" && Array.isArray(node.commands)) return node.commands;
    return [];
  }

  /* -----------------------------------------------
     Command Registration
     ----------------------------------------------- */

  function buildCommandMap(phrases, handler) {
    const sorted = [...phrases].sort((a, b) =>
      b.replace(/\*/g, "").length - a.replace(/\*/g, "").length
    );
    const map = {};
    sorted.forEach(p => { map[p] = handler; });
    return map;
  }

  function isWildcardPhrase(phrase) {
    return typeof phrase === "string" && phrase.includes("*");
  }

  function registerBaseCommands() {
    const entries = Object.entries(commandPhrases);

    // Prioritize exact phrases globally so they win over parameterized patterns.
    for (const [name, phrases] of entries) {
      const exactPhrases = phrases.filter((phrase) => !isWildcardPhrase(phrase));
      if (exactPhrases.length) {
        annyang.addCommands(buildCommandMap(exactPhrases, HANDLERS[name]));
      }
    }

    for (const [name, phrases] of entries) {
      const wildcardPhrases = phrases.filter(isWildcardPhrase);
      if (wildcardPhrases.length) {
        annyang.addCommands(buildCommandMap(wildcardPhrases, HANDLERS[name]));
      }
    }
  }

  function unregisterBaseCommands() {
    for (const phrases of Object.values(commandPhrases)) {
      if (phrases.length) annyang.removeCommands(phrases);
    }
  }

  /* -----------------------------------------------
     Page Interaction
     ----------------------------------------------- */

  function clickElement(el) {
    if (!el) return false;
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    return true;
  }

  function scrollPage(direction) {
    speak(direction < 0 ? "Scrolling up." : "Scrolling down.");
    if (document.body.classList.contains("scroll-page") && window.scrollPageController?.scroll) {
      window.scrollPageController.scroll(direction);
      return;
    }
    const step = Math.max(180, Math.round(window.innerHeight * 0.7));
    window.scrollBy({ top: direction * step, behavior: "smooth" });
  }

  function moveCarousel(direction) {
    const itemArrow = document.querySelector(
      direction < 0 ? ".item-carousel-arrow-left" : ".item-carousel-arrow-right"
    );
    if (itemArrow && !itemArrow.disabled && clickElement(itemArrow)) {
      speak(direction < 0 ? "Previous item." : "Next item.");
      setTimeout(updateOverlayIfOpen, 360);
      return;
    }

    const arrows = document.querySelectorAll(".carousel .arrow");
    if (arrows.length >= 2) {
      const target = direction < 0 ? arrows[0] : arrows[arrows.length - 1];
      if (target.getAttribute("aria-disabled") !== "true" && clickElement(target)) {
        speak(direction < 0 ? "Previous item." : "Next item.");
        return;
      }
    }

    speak("There is no carousel movement available right now.");
  }

  /* -----------------------------------------------
     Read Current Item
     ----------------------------------------------- */

  function readCurrentItem() {
    const panel = document.querySelector(".item-panel");
    const title = panel?.querySelector("h2")?.textContent?.trim();
    const desc = panel?.querySelector("p")?.textContent?.trim();
    if (title && desc) { speak(`Title: ${title}. Description: ${desc}`); return; }

    const bannerTitle = document.querySelector(".banner h2")?.textContent?.trim();
    const bannerDesc = document.querySelector(".banner span")?.textContent?.trim();
    if (bannerTitle && bannerDesc) { speak(`Title: ${bannerTitle}. Description: ${bannerDesc}`); return; }

    speak("I could not find an item to read on this page.");
  }

  /* -----------------------------------------------
     Item Image Overlay
     ----------------------------------------------- */

  function extractBgUrl(value) {
    if (typeof value !== "string") return "";
    const matches = [...value.matchAll(/url\((['"]?)(.*?)\1\)/g)];
    return matches.length ? (matches[matches.length - 1][2] || "") : "";
  }

  function getOverlayImageUrl() {
    const slots = Array.from(
      document.querySelectorAll(".item-page .circle-carousel-track .circle-item")
    );
    if (slots.length) {
      let bestSlot = slots[0], bestScale = -Infinity;
      for (const slot of slots) {
        const raw = slot.style.getPropertyValue("--slot-scale")
          || getComputedStyle(slot).getPropertyValue("--slot-scale");
        const scale = parseFloat(raw) || 1;
        if (scale > bestScale) { bestScale = scale; bestSlot = slot; }
      }
      const imgDiv = bestSlot.querySelector(".circle-item-image");
      if (imgDiv) {
        const url = extractBgUrl(imgDiv.style.backgroundImage || getComputedStyle(imgDiv).backgroundImage);
        if (url) return url;
      }
    }

    for (const node of document.querySelectorAll(".item-page .circle-carousel-track .circle-item-image")) {
      const url = extractBgUrl(node.style.backgroundImage || getComputedStyle(node).backgroundImage);
      if (url) return url;
    }

    return "";
  }

  function closeItemOverlay(announce = true) {
    if (!overlayElement) {
      if (announce) speak("There is no open image overlay.");
      return;
    }
    overlayElement.remove();
    overlayElement = null;
    if (announce) speak("Closed image overlay.");
  }

  function openItemOverlay() {
    const imageUrl = getOverlayImageUrl();
    if (!imageUrl) { speak("I could not find the current item image to open."); return; }

    closeItemOverlay(false);

    const title = document.querySelector(".item-page .item-panel h2")?.textContent?.trim() || "Current item";

    const overlay = document.createElement("div");
    overlay.className = "item-image-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Current item image");

    const panel = document.createElement("div");
    panel.className = "item-image-overlay-panel";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "item-image-overlay-close";
    btn.textContent = "Close";
    btn.addEventListener("click", () => closeItemOverlay(false));

    const img = document.createElement("img");
    img.className = "item-image-overlay-image";
    img.src = imageUrl;
    img.alt = title;

    panel.append(btn, img);
    overlay.appendChild(panel);
    overlay.addEventListener("click", e => { if (e.target === overlay) closeItemOverlay(false); });

    document.body.appendChild(overlay);
    overlayElement = overlay;
    speak(`Opened image for ${title}`);
  }

  function updateOverlayIfOpen() {
    if (!overlayElement) return;
    const url = getOverlayImageUrl();
    if (!url) return;
    const img = overlayElement.querySelector(".item-image-overlay-image");
    if (img) {
      img.src = url;
      img.alt = document.querySelector(".item-page .item-panel h2")?.textContent?.trim() || "Current item";
    }
  }

  /* -----------------------------------------------
     Clarification System
     ----------------------------------------------- */

  function parseChoiceIndex(raw, options) {
    const text = normalize(raw);
    if (!text) return -1;
    if (text.includes("cancel") || text.includes("never mind")) return -2;

    const digitMatch = text.match(/\b([1-9])\b/);
    if (digitMatch) {
      const i = Number(digitMatch[1]) - 1;
      return i < options.length ? i : -1;
    }

    for (const token of text.split(" ")) {
      if (CARDINAL_TO_INDEX[token] !== undefined) {
        const i = CARDINAL_TO_INDEX[token];
        return i < options.length ? i : -1;
      }
    }

    const ordIdx = ORDINAL_WORDS.findIndex(w => text.includes(w));
    if (ordIdx >= 0 && ordIdx < options.length) return ordIdx;

    return options.findIndex(o => o.normalizedTitle && text.includes(o.normalizedTitle));
  }

  function endClarification() {
    if (clarificationState) {
      if (clarificationState.timeoutId) clearTimeout(clarificationState.timeoutId);
      if (typeof clarificationState.cleanup === "function") clarificationState.cleanup();
      annyang.removeCommands(clarificationState.phrases);
      clarificationState = null;
    }
    registerBaseCommands();
  }

  function startClarification({ choices, onSelect, prompt, cleanup }) {
    unregisterBaseCommands();
    const token = ++clarificationToken;

    const commands = {
      "cancel": () => { speak("Okay, cancelled."); endClarification(); },
      "never mind": () => { speak("Okay, cancelled."); endClarification(); },
      "*choice": (choice) => {
        const idx = parseChoiceIndex(choice, choices);
        if (idx === -2) { speak("Okay, cancelled."); endClarification(); return; }
        if (idx >= 0) { onSelect(choices[idx]); return; }
        speak(`Please say a number between one and ${choices.length}, or say cancel.`);
      }
    };

    choices.forEach((choice, i) => {
      const num = i + 1;
      commands[String(num)] = () => onSelect(choice);
      commands[`option ${num}`] = () => onSelect(choice);
      if (ORDINAL_WORDS[i]) {
        commands[ORDINAL_WORDS[i]] = () => onSelect(choice);
        commands[`${ORDINAL_WORDS[i]} one`] = () => onSelect(choice);
        commands[`${ORDINAL_WORDS[i]} option`] = () => onSelect(choice);
      }
      const word = ["one", "two", "three"][i];
      if (word) commands[`option ${word}`] = () => onSelect(choice);
    });

    const phrases = Object.keys(commands);
    annyang.addCommands(commands);

    clarificationState = { phrases, token, timeoutId: null, cleanup: cleanup || null };

    speak(prompt, () => {
      if (!clarificationState || clarificationState.token !== token) return;
      clarificationState.timeoutId = setTimeout(() => {
        speak("Selection timed out. Please try again.");
        endClarification();
      }, CLARIFICATION_TIMEOUT_MS);
    });
  }

  /* -----------------------------------------------
     On-Page Item Navigation
     ----------------------------------------------- */

  function buildItemLinkCandidates() {
    const pattern = /\/item\.html(?:\?|$)/i;
    return Array.from(document.querySelectorAll("a[href]"))
      .map(anchor => {
        const href = anchor.getAttribute("href") || "";
        const fullHref = anchor.href || "";
        if (!pattern.test(href) && !pattern.test(fullHref)) return null;
        const labelNode = anchor.querySelector("span, h2, figcaption");
        const label = (labelNode?.textContent || anchor.getAttribute("aria-label") || anchor.textContent || "").trim();
        return { anchor, href: fullHref, label, normalizedTitle: normalize(label) };
      })
      .filter(Boolean);
  }

  function renderChoiceOverlays(candidates) {
    const nodes = [];
    candidates.forEach((c, i) => {
      const host = c.anchor.querySelector(".image-card, .circle-item-image") || c.anchor;
      host.classList.add("voice-choice-overlay-host");
      const badge = document.createElement("div");
      badge.className = "voice-choice-overlay";
      badge.textContent = String(i + 1);
      host.appendChild(badge);
      nodes.push({ host, badge });
    });
    return () => {
      nodes.forEach(({ host, badge }) => {
        if (badge.parentNode === host) host.removeChild(badge);
        if (!host.querySelector(".voice-choice-overlay")) host.classList.remove("voice-choice-overlay-host");
      });
    };
  }

  function parseOrdinalIndex(text) {
    if (!text) return -1;

    const normalizedText = normalize(text);
    if (!normalizedText) return -1;

    const digitMatch = normalizedText.match(/\b(\d+)(?:st|nd|rd|th)?\b/);
    if (digitMatch) {
      const value = Number(digitMatch[1]);
      return Number.isFinite(value) && value > 0 ? value - 1 : -1;
    }

    const ordinalMap = {
      first: 0,
      second: 1,
      third: 2,
      fourth: 3,
      fifth: 4,
      sixth: 5,
      seventh: 6,
      eighth: 7,
      ninth: 8,
      tenth: 9
    };

    for (const token of normalizedText.split(" ")) {
      if (ordinalMap[token] !== undefined) return ordinalMap[token];
      if (CARDINAL_TO_INDEX[token] !== undefined) return CARDINAL_TO_INDEX[token];
    }

    return -1;
  }

  function parseScrollPositionSelection(raw) {
    const text = normalize(raw);
    if (!text) return null;

    const side = text.includes(" right") || text.startsWith("right ") || text.endsWith(" right")
      ? "right"
      : (text.includes(" left") || text.startsWith("left ") || text.endsWith(" left") ? "left" : "");

    const ordinalIndex = parseOrdinalIndex(text);
    if (!side || ordinalIndex < 0) return null;

    const hasPositionalContext = /\b(from|down|up|top|bottom)\b/.test(text);
    if (!hasPositionalContext) return null;

    const direction = /\b(up|bottom)\b/.test(text) ? "up" : "down";
    return { side, direction, ordinalIndex };
  }

  function getScrollVisibleCandidatesBySide() {
    const panels = Array.from(document.querySelectorAll(".scroll-page .scroll-panel"));
    const bySide = { left: [], right: [] };

    panels.forEach((panel, panelIndex) => {
      const side = (panel.dataset.column === "1" || panelIndex === 1) ? "right" : "left";
      const anchors = Array.from(panel.querySelectorAll(".scroll-panel-track > a.scroll-card-focus"))
        .filter(anchor => anchor.getAttribute("aria-disabled") !== "true" && !!anchor.getAttribute("href"));

      anchors
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
        .forEach((anchor) => {
          const label = sanitize(anchor.querySelector("span")?.textContent || anchor.getAttribute("aria-label") || "");
          bySide[side].push({
            anchor,
            href: anchor.href || "",
            label
          });
        });
    });

    return bySide;
  }

  function openItemByScrollPosition(rawSelection) {
    if (!document.body.classList.contains("scroll-page")) return false;

    const selection = parseScrollPositionSelection(rawSelection);
    if (!selection) return false;

    const bySide = getScrollVisibleCandidatesBySide();
    const candidates = bySide[selection.side] || [];

    if (!candidates.length) {
      speak(`I could not find visible items on the ${selection.side}.`);
      return true;
    }

    const targetIndex = selection.direction === "up"
      ? (candidates.length - 1 - selection.ordinalIndex)
      : selection.ordinalIndex;

    if (targetIndex < 0 || targetIndex >= candidates.length) {
      speak(`There are only ${candidates.length} visible items on the ${selection.side}.`);
      return true;
    }

    const target = candidates[targetIndex];
    speak(`Opening ${target.label || "selected item"}.`);
    window.location.replace(target.href);
    return true;
  }

  function openItemByPosition(rawSelection, rawSide) {
    if (!document.body.classList.contains("scroll-page")) {
      speak("This command works on the scroll page.");
      return;
    }

    const selection = sanitize(rawSelection);
    const side = sanitize(rawSide);
    if (!selection || !side) {
      speak("Please say something like open the third down from the right.");
      return;
    }

    const composedSelection = `${selection} from the ${side}`;
    if (!openItemByScrollPosition(composedSelection)) {
      speak("Please say something like open the third down from the right.");
    }
  }

  function openItemFromPage(rawName) {
    const name = sanitize(rawName);
    const normalizedName = normalize(name);
    if (!normalizedName) { speak("Please say the item name you want to open."); return; }

    const candidates = buildItemLinkCandidates();
    if (!candidates.length) { speak("I could not find any item links on this page."); return; }

    const exact = candidates.filter(c => c.normalizedTitle === normalizedName);
    if (exact.length === 1 && exact[0].href) {
      speak(`Opening ${exact[0].label || name}`);
      window.location.replace(exact[0].href);
      return;
    }

    if (exact.length > 1) {
      const cleanup = renderChoiceOverlays(exact);
      startClarification({
        choices: exact,
        onSelect: c => { speak(`Opening ${c.label}`); window.location.replace(c.href); },
        prompt: `I found ${exact.length} items with that name. Say the number you want to open.`,
        cleanup
      });
      return;
    }

    const best = candidates.find(c => c.normalizedTitle.startsWith(normalizedName))
      || candidates.find(c => c.normalizedTitle.includes(normalizedName));
    if (best?.href) {
      speak(`Opening ${best.label || name}`);
      window.location.replace(best.href);
    } else {
      speak(`I could not find ${name} on this page.`);
    }
  }

  /* -----------------------------------------------
     API Object Explanation with Disambiguation
     ----------------------------------------------- */

  function getRecordTitle(r) {
    return r?._primaryTitle?.trim()
      || r?.titles?.[0]?.title?.trim()
      || r?.objectType?.trim()
      || "Untitled object";
  }

  function getRecordSubtitle(r) {
    const maker = r?._primaryMaker?.name?.trim();
    const date = r?._primaryDate?.trim();
    if (maker && date) return `${maker}, ${date}`;
    return maker || date || "";
  }

  function buildClarificationChoice(record, index) {
    const title = getRecordTitle(record);
    const subtitle = getRecordSubtitle(record);
    return {
      index,
      systemNumber: record?.systemNumber,
      title,
      normalizedTitle: normalize(title),
      label: subtitle ? `${title} by ${subtitle}` : title
    };
  }

  function navigateToItem(choice) {
    if (!choice?.systemNumber) {
      speak("That option is missing an item identifier. Please try again.");
      endClarification();
      return;
    }
    speak(`Opening ${choice.title}`);
    window.location.replace(
      `/pages/item.html?id=${encodeURIComponent(choice.systemNumber)}&voiceExplain=1`
    );
  }

  async function explainWithDisambiguation(rawName) {
    const name = sanitize(rawName);
    if (!name) { speak("Please tell me which object you want to learn about."); return; }

    if (typeof getData !== "function" || typeof searchURL !== "string") {
      window.location.replace("/pages/scroll.html?q=" + encodeURIComponent(name));
      return;
    }

    const data = await getData(searchURL, `${encodeURIComponent(name)}&page_size=3`);
    const records = (data?.records || []).filter(r => r?.systemNumber).slice(0, 3);
    if (!records.length) { speak(`I could not find anything for ${name}.`); return; }

    const choices = records.map(buildClarificationChoice);
    if (choices.length === 1) { navigateToItem(choices[0]); return; }

    startClarification({
      choices,
      onSelect: navigateToItem,
      prompt: `I found ${choices.length} items with that name. Say first, second, or third.`
    });
  }

  /* -----------------------------------------------
     Creator Collection
     ----------------------------------------------- */

  function openCreatorCollection(rawName) {
    const name = sanitize(rawName);
    if (!name) { speak("Please say the creator whose collection you want to open."); return; }
    speak(`Opening collection for ${name}.`);
    window.location.replace("/pages/collection.html?creator=" + encodeURIComponent(name));
  }

  function openGeneralCategories() {
    speak("Showing categories.");
    window.location.replace("/pages/scroll.html?mode=categories");
  }

  function scoreTitleMatch(normalizedTitle, normalizedTarget, targetTokens) {
    if (!normalizedTitle || !normalizedTarget) return 0;
    if (normalizedTitle === normalizedTarget) return 1000;
    if (normalizedTitle.startsWith(normalizedTarget)) return 700;
    if (normalizedTitle.includes(normalizedTarget)) return 500;

    const titleTokens = normalizedTitle.split(" ").filter(Boolean);
    const overlap = targetTokens.reduce((count, token) => count + (titleTokens.includes(token) ? 1 : 0), 0);
    if (!overlap) return 0;
    return overlap * 100;
  }

  async function goToPageByBestMatch(rawName) {
    const name = sanitize(rawName);
    if (!name) {
      speak("Please say the item name you want to open.");
      return;
    }

    if (typeof getData !== "function" || typeof searchURL !== "string") {
      window.location.replace("/pages/scroll.html?q=" + encodeURIComponent(name));
      return;
    }

    try {
      const data = await getData(searchURL, `${encodeURIComponent(name)}&page_size=30`);
      const records = (data?.records || []).filter((record) => record?.systemNumber);
      if (!records.length) {
        speak(`I could not find an item for ${name}.`);
        return;
      }

      const normalizedTarget = normalize(name);
      const targetTokens = normalizedTarget.split(" ").filter(Boolean);
      let bestRecord = records[0];
      let bestScore = scoreTitleMatch(normalize(getRecordTitle(bestRecord)), normalizedTarget, targetTokens);

      for (let i = 1; i < records.length; i += 1) {
        const candidate = records[i];
        const candidateScore = scoreTitleMatch(normalize(getRecordTitle(candidate)), normalizedTarget, targetTokens);
        if (candidateScore > bestScore) {
          bestScore = candidateScore;
          bestRecord = candidate;
        }
      }

      speak(`Opening ${getRecordTitle(bestRecord)}`);
      window.location.replace(`/pages/item.html?id=${encodeURIComponent(bestRecord.systemNumber)}`);
    } catch (error) {
      console.error("Failed to resolve goToPage request", error);
      speak("I could not find that item right now.");
    }
  }

  function buildSimilarQueryFromRecord(record) {
    const objectType = sanitize(record?.objectType || "");
    const maker = sanitize(record?._primaryMaker?.name || "");
    const place = sanitize(record?._primaryPlace || "");
    const date = sanitize(record?._primaryDate || "");
    const title = sanitize(getRecordTitle(record));

    if (objectType && maker) return `${objectType} ${maker}`;
    if (objectType && place) return `${objectType} ${place}`;
    if (objectType && date) return `${objectType} ${date}`;
    if (objectType) return objectType;
    if (maker) return maker;
    return title;
  }

  async function openSimilarItems() {
    const onItemPage = document.body.classList.contains("item-page");
    if (!onItemPage) {
      speak("This command works on an item page. Open an item first.");
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const itemId = sanitize(params.get("id") || "");

    // Fallback: use visible item title when item id or API helper is not available.
    if (!itemId || typeof getData !== "function" || typeof objectURL !== "string") {
      const panelTitle = sanitize(document.querySelector(".item-page .item-panel h2")?.textContent || "");
      if (!panelTitle) {
        speak("I could not determine this item to find similar results.");
        return;
      }
      speak(`Showing similar items for ${panelTitle}`);
      window.location.replace("/pages/scroll.html?q=" + encodeURIComponent(panelTitle));
      return;
    }

    try {
      const data = await getData(objectURL, encodeURIComponent(itemId));
      const record = data?.record;
      const query = buildSimilarQueryFromRecord(record || {});

      if (!query) {
        speak("I could not build a similar items query for this object.");
        return;
      }

      speak(`Showing similar items to ${getRecordTitle(record || {})}`);
      window.location.replace("/pages/scroll.html?q=" + encodeURIComponent(query));
    } catch (error) {
      console.error("Failed to build similar items query", error);
      speak("I could not load the current item details to find similar items.");
    }
  }

  /* -----------------------------------------------
     Cancel
     ----------------------------------------------- */

  function cancelCurrentAction() {
    window.speechSynthesis?.cancel();
    if (overlayElement) closeItemOverlay(false);
    if (clarificationState) { endClarification(); speak("Okay, cancelled."); return; }
    speak("Stopped.");
  }

  /* -----------------------------------------------
     No-Match Fallback
     ----------------------------------------------- */

  function extractObjectFromSpeech(phrase) {
    const text = normalize(phrase);
    for (const pattern of [
      /^tell me more about\s+(.+)$/,
      /^tell me about\s+(.+)$/,
      /^what are\s+(.+)$/,
      /^what(?:\s+is|\s+s)\s+(.+)$/
    ]) {
      const m = text.match(pattern);
      if (m?.[1]) return sanitize(m[1]);
    }
    return "";
  }

  function isSimilarItemsAlias(text) {
    const normalized = normalize(text);
    return [
      "similar items",
      "similar item",
      "related items",
      "related item",
      "more like this"
    ].includes(normalized);
  }

  function handleSearchCommand(rawQuery) {
    const query = sanitize(rawQuery || "");
    if (isSimilarItemsAlias(query)) {
      openSimilarItems();
      return;
    }
    speak(`Searching for ${query}.`);
    window.location.replace("/pages/scroll.html?q=" + encodeURIComponent(query));
  }

  /* -----------------------------------------------
     Handler Map
     ----------------------------------------------- */

  const HANDLERS = {
    home:                    () => { speak("Going to home page."); window.location.replace("/index.html"); },
    help:                    () => { speak("Opening help."); window.location.replace("/pages/help.html"); },
    listCategories:          () => openGeneralCategories(),
    cancel:                  () => cancelCurrentAction(),
    carouselLeft:            () => moveCarousel(-1),
    carouselRight:           () => moveCarousel(1),
    scrollUp:                () => scrollPage(-1),
    scrollDown:              () => scrollPage(1),
    readCurrentItem:         () => readCurrentItem(),
    openCurrentItemOverlay:  () => openItemOverlay(),
    closeItemOverlay:        () => closeItemOverlay(),
    creatorCollectionSearch: c => openCreatorCollection(c),
    search:                  q => handleSearchCommand(q),
    openItemByPosition:      (selection, side) => openItemByPosition(selection, side),
    openItemOnPage:          n => openItemFromPage(n),
    goToPage:                n => goToPageByBestMatch(n),
    objectExplanation:       n => explainWithDisambiguation(n),
    similarItems:            () => openSimilarItems()
  };

  /* -----------------------------------------------
     Initialization
     ----------------------------------------------- */

  async function init() {
    const config = await loadConfig("/commands.json");

    for (const [name, path] of Object.entries(COMMAND_DEFS)) {
      commandPhrases[name] = resolvePhrases(config, path);
    }

    registerBaseCommands();

    annyang.addCallback("result", phrases => {
      if (phrases.length) console.log("Speech Detected: " + phrases[0]);
    });

    annyang.addCallback("resultNoMatch", phrases => {
      if (!Array.isArray(phrases) || !phrases.length) return;
      const obj = extractObjectFromSpeech(phrases[0]);
      if (obj) explainWithDisambiguation(obj);
    });

    annyang.addCallback("soundstart", () => {
      document.querySelector(".mic svg")?.classList.add("listening");
    });

    annyang.addCallback("end", () => {
      document.querySelector(".mic svg")?.classList.remove("listening");
    });

    annyang.start();
    patchRecognitionTranscripts();
  }

  // Strip trailing punctuation (e.g. "." added by speech recognition) from
  // transcripts before annyang matches them against commands.
  function patchRecognitionTranscripts() {
    const recognizer = annyang.getSpeechRecognizer?.();
    if (!recognizer) return;

    const originalHandler = recognizer.onresult;
    if (typeof originalHandler !== "function") return;

    recognizer.onresult = function (event) {
      if (event?.results) {
        for (const result of event.results) {
          for (const alt of result) {
            if (typeof alt.transcript === "string") {
              Object.defineProperty(alt, "transcript", {
                value: alt.transcript.replace(/[.!?]+$/, "").trim(),
                writable: false
              });
            }
          }
        }
      }
      return originalHandler.call(this, event);
    };
  }

  init().catch(e => console.error("Voice init failed:", e));
})();
