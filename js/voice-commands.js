// Only initialize voice commands once per page load
if (!window.voiceCommandsInitialized) {
  window.voiceCommandsInitialized = true;

  const annyang = window.annyang;
  const ORDINAL_WORDS = ["first", "second", "third"];
  const CARDINAL_TO_INDEX = {
    "one": 0,
    "won": 0,
    "two": 1,
    "to": 1,
    "too": 1,
    "three": 2,
    "four": 3,
    "for": 3,
    "five": 4,
    "six": 5,
    "seven": 6,
    "eight": 7,
    "ate": 7,
    "nine": 8
  };
  const CLARIFICATION_TIMEOUT_MS = 22000;

  let baseCommandGroups = {
    home: [],
    help: [],
    cancel: [],
    carouselLeft: [],
    carouselRight: [],
    scrollUp: [],
    scrollDown: [],
    readCurrentItem: [],
    openCurrentItemOverlay: [],
    closeItemOverlay: [],
    search: [],
    openItemOnPage: [],
    objectExplanation: []
  };

  let clarificationState = null;
  let clarificationTokenCounter = 0;
  let itemImageOverlayElement = null;

  // Build annyang command maps from a list of phrases and one handler.
  function createCommands(phrases, handler) {
    // Register specific phrases before broad ones so overlaps resolve correctly.
    const orderedPhrases = [...phrases].sort((a, b) => {
      const aScore = a.replace(/\*/g, "").length;
      const bScore = b.replace(/\*/g, "").length;
      return bScore - aScore;
    });

    const commands = {};
    orderedPhrases.forEach(phrase => {
      commands[phrase] = handler;
    });
    return commands;
  }

  // Load nested command arrays from commands.json using a path of keys.
  async function getCommandsFromJson(filePath, categoryPath) {
    const response = await fetch(filePath);

    if (!response.ok) {
      throw new Error(`Unable to load command json: ${filePath}`);
    }

    const data = await response.json();
    const commands = categoryPath.reduce((current, key) => {
      if (!current || typeof current !== "object") {
        return undefined;
      }
      return current[key];
    }, data);

    return Array.isArray(commands) ? commands : [];
  }

  function logToConsole(speech) {
    console.log("Speech Detected: " + speech);
  }

  function speak(text, onComplete) {
    if (!text) {
      if (typeof onComplete === "function") {
        onComplete();
      }
      return;
    }

    if (window.speechSynthesis && typeof window.SpeechSynthesisUtterance === "function") {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = () => {
        if (typeof onComplete === "function") {
          onComplete();
        }
      };
      utterance.onerror = () => {
        if (typeof onComplete === "function") {
          onComplete();
        }
      };
      window.speechSynthesis.speak(utterance);
      return;
    }

    if (typeof onComplete === "function") {
      onComplete();
    }
  }

  function sanitizeVoiceObject(input) {
    if (typeof input !== "string") {
      return "";
    }

    return input
      .trim()
      .replace(/^[\s,.;:!?-]+|[\s,.;:!?-]+$/g, "")
      .replace(/\s+/g, " ");
  }

  function normalizeSpeech(input) {
    if (typeof input !== "string") {
      return "";
    }

    return input
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function extractObjectFromFreeSpeech(phrase) {
    const normalized = normalizeSpeech(phrase);

    const patterns = [
      /^tell me more about\s+(.+)$/,
      /^tell me about\s+(.+)$/,
      /^what are\s+(.+)$/,
      /^what(?:\s+is|\s+s)\s+(.+)$/
    ];

    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (match && match[1]) {
        return sanitizeVoiceObject(match[1]);
      }
    }

    return "";
  }

  function getRecordTitle(record) {
    if (record?._primaryTitle?.trim()) {
      return record._primaryTitle.trim();
    }

    if (Array.isArray(record?.titles) && record.titles[0]?.title?.trim()) {
      return record.titles[0].title.trim();
    }

    if (record?.objectType?.trim()) {
      return record.objectType.trim();
    }

    return "Untitled object";
  }

  function getRecordSubtitle(record) {
    const maker = record?._primaryMaker?.name?.trim();
    const date = record?._primaryDate?.trim();

    if (maker && date) {
      return `${maker}, ${date}`;
    }

    if (maker) {
      return maker;
    }

    if (date) {
      return date;
    }

    return "";
  }

  function buildClarificationOption(record, index) {
    const title = getRecordTitle(record);
    const subtitle = getRecordSubtitle(record);
    const label = subtitle ? `${title} by ${subtitle}` : title;

    return {
      index,
      systemNumber: record?.systemNumber,
      title,
      normalizedTitle: normalizeSpeech(title),
      label
    };
  }

  function removeCommands(phrases) {
    if (!Array.isArray(phrases) || !phrases.length) {
      return;
    }

    annyang.removeCommands(phrases);
  }

  function addBaseCommands() {
    annyang.addCommands(
      createCommands(baseCommandGroups.home, () => window.location.replace("/index.html"))
    );

    annyang.addCommands(
      createCommands(baseCommandGroups.help, () => window.location.replace("/pages/help.html"))
    );

    annyang.addCommands(
      createCommands(baseCommandGroups.cancel, () => {
        cancelCurrentAction();
      })
    );

    annyang.addCommands(
      createCommands(baseCommandGroups.carouselLeft, () => {
        moveOnScreenCarousel(-1);
      })
    );

    annyang.addCommands(
      createCommands(baseCommandGroups.carouselRight, () => {
        moveOnScreenCarousel(1);
      })
    );

    annyang.addCommands(
      createCommands(baseCommandGroups.scrollUp, () => {
        scrollPage(-1);
      })
    );

    annyang.addCommands(
      createCommands(baseCommandGroups.scrollDown, () => {
        scrollPage(1);
      })
    );

    annyang.addCommands(
      createCommands(baseCommandGroups.readCurrentItem, () => {
        readCurrentItemOnPage();
      })
    );

    annyang.addCommands(
      createCommands(baseCommandGroups.openCurrentItemOverlay, () => {
        openCurrentItemOverlay();
      })
    );

    annyang.addCommands(
      createCommands(baseCommandGroups.closeItemOverlay, () => {
        closeItemOverlay();
      })
    );

    annyang.addCommands(
      createCommands(baseCommandGroups.search, (search) =>
        window.location.replace("/pages/scroll.html?q=" + encodeURIComponent(search || ""))
      )
    );

    annyang.addCommands(
      createCommands(baseCommandGroups.openItemOnPage, (objectName) => {
        openItemFromCurrentPage(objectName);
      })
    );

    annyang.addCommands(
      createCommands(baseCommandGroups.objectExplanation, (objectName) =>
        explainObjectWithDisambiguation(objectName)
      )
    );
  }

  function suspendBaseCommands() {
    removeCommands(baseCommandGroups.home);
    removeCommands(baseCommandGroups.help);
    removeCommands(baseCommandGroups.cancel);
    removeCommands(baseCommandGroups.carouselLeft);
    removeCommands(baseCommandGroups.carouselRight);
    removeCommands(baseCommandGroups.scrollUp);
    removeCommands(baseCommandGroups.scrollDown);
    removeCommands(baseCommandGroups.readCurrentItem);
    removeCommands(baseCommandGroups.openCurrentItemOverlay);
    removeCommands(baseCommandGroups.closeItemOverlay);
    removeCommands(baseCommandGroups.search);
    removeCommands(baseCommandGroups.openItemOnPage);
    removeCommands(baseCommandGroups.objectExplanation);
  }

  function extractImageUrlFromCssBackground(backgroundValue) {
    if (typeof backgroundValue !== "string") {
      return "";
    }

    const urlMatches = [...backgroundValue.matchAll(/url\((['"]?)(.*?)\1\)/g)];
    if (!urlMatches.length) {
      return "";
    }

    const lastMatch = urlMatches[urlMatches.length - 1];
    return (lastMatch && lastMatch[2]) ? lastMatch[2] : "";
  }

  function getCurrentCarouselSlotOnItemPage() {
    const slots = Array.from(document.querySelectorAll(".item-page .circle-carousel-track .circle-item"));
    if (!slots.length) {
      return null;
    }

    let bestSlot = slots[0];
    let bestScale = Number.NEGATIVE_INFINITY;

    slots.forEach((slot) => {
      const rawScale = slot.style.getPropertyValue("--slot-scale") || getComputedStyle(slot).getPropertyValue("--slot-scale");
      const parsedScale = Number.parseFloat(rawScale || "1");
      const scale = Number.isFinite(parsedScale) ? parsedScale : 1;

      if (scale > bestScale) {
        bestScale = scale;
        bestSlot = slot;
      }
    });

    return bestSlot;
  }

  function buildCurrentItemOverlayData() {
    const currentSlot = getCurrentCarouselSlotOnItemPage();
    const imageDiv = currentSlot?.querySelector(".circle-item-image");

    if (!imageDiv) {
      return null;
    }

    const backgroundImage = imageDiv.style.backgroundImage || getComputedStyle(imageDiv).backgroundImage;
    const imageUrl = extractImageUrlFromCssBackground(backgroundImage);

    if (!imageUrl) {
      return null;
    }

    const title = document.querySelector(".item-page .item-panel h2")?.textContent?.trim() || "Current item";
    const description = document.querySelector(".item-page .item-panel p")?.textContent?.trim() || "";

    return {
      imageUrl,
      title,
      description
    };
  }

  function closeItemOverlay(shouldSpeak = true) {
    if (!itemImageOverlayElement) {
      if (shouldSpeak) {
        speak("There is no open image overlay.");
      }
      return;
    }

    itemImageOverlayElement.remove();
    itemImageOverlayElement = null;

    if (shouldSpeak) {
      speak("Closed image overlay.");
    }
  }

  function openCurrentItemOverlay() {
    const overlayData = buildCurrentItemOverlayData();
    if (!overlayData) {
      speak("I could not find the current item image to open.");
      return;
    }

    closeItemOverlay(false);

    const overlay = document.createElement("div");
    overlay.className = "item-image-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Current item image");

    const panel = document.createElement("div");
    panel.className = "item-image-overlay-panel";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "item-image-overlay-close";
    closeButton.textContent = "Close";
    closeButton.addEventListener("click", () => closeItemOverlay(false));

    const image = document.createElement("img");
    image.className = "item-image-overlay-image";
    image.src = overlayData.imageUrl;
    image.alt = overlayData.title;

    panel.append(closeButton, image);
    overlay.appendChild(panel);

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        closeItemOverlay(false);
      }
    });

    document.body.appendChild(overlay);
    itemImageOverlayElement = overlay;
    speak(`Opened image for ${overlayData.title}`);
  }

  function updateItemOverlayIfOpen() {
    if (!itemImageOverlayElement) {
      return;
    }

    const overlayData = buildCurrentItemOverlayData();
    if (!overlayData) {
      return;
    }

    const image = itemImageOverlayElement.querySelector(".item-image-overlay-image");
    if (image) {
      image.src = overlayData.imageUrl;
      image.alt = overlayData.title;
    }
  }

  function readCurrentItemOnPage() {
    const itemPanel = document.querySelector(".item-panel");
    const itemTitle = itemPanel?.querySelector("h2")?.textContent?.trim();
    const itemDescription = itemPanel?.querySelector("p")?.textContent?.trim();

    if (itemTitle && itemDescription) {
      speak(`Title: ${itemTitle}. Description: ${itemDescription}`);
      return;
    }

    const bannerTitle = document.querySelector(".banner h2")?.textContent?.trim();
    const bannerDescription = document.querySelector(".banner span")?.textContent?.trim();
    if (bannerTitle && bannerDescription) {
      speak(`Title: ${bannerTitle}. Description: ${bannerDescription}`);
      return;
    }

    speak("I could not find an item to read on this page.");
  }

  function buildItemLinkCandidates() {
    const itemLinkPattern = /\/item\.html(?:\?|$)/i;

    return Array.from(document.querySelectorAll("a[href]")).map((anchor) => {
      const href = anchor.getAttribute("href") || "";
      const fullHref = anchor.href || "";
      const isItemLink = itemLinkPattern.test(href) || itemLinkPattern.test(fullHref);

      if (!isItemLink) {
        return null;
      }

      const labelNode = anchor.querySelector("span, h2, figcaption");
      const rawLabel = (labelNode?.textContent || anchor.getAttribute("aria-label") || anchor.textContent || "").trim();
      const normalizedLabel = normalizeSpeech(rawLabel);

      return {
        anchor,
        href: fullHref,
        label: rawLabel,
        normalizedLabel
      };
    }).filter(Boolean);
  }

  function getOverlayHost(anchor) {
    return anchor.querySelector(".image-card, .circle-item-image") || anchor;
  }

  function renderChoiceOverlays(candidates) {
    const overlayNodes = [];

    candidates.forEach((candidate, index) => {
      const host = getOverlayHost(candidate.anchor);
      if (!host) {
        return;
      }

      host.classList.add("voice-choice-overlay-host");
      const badge = document.createElement("div");
      badge.className = "voice-choice-overlay";
      badge.textContent = String(index + 1);
      host.appendChild(badge);
      overlayNodes.push({ host, badge });
    });

    return () => {
      overlayNodes.forEach(({ host, badge }) => {
        if (badge.parentNode === host) {
          host.removeChild(badge);
        }

        if (!host.querySelector(".voice-choice-overlay")) {
          host.classList.remove("voice-choice-overlay-host");
        }
      });
    };
  }

  function askForOnPageItemChoice(candidates, spokenObjectName) {
    suspendBaseCommands();
    const clarificationToken = clarificationTokenCounter + 1;
    clarificationTokenCounter = clarificationToken;

    const cleanupOverlays = renderChoiceOverlays(candidates);
    const numberedChoices = candidates.map((candidate, index) => {
      return {
        index,
        href: candidate.href,
        title: candidate.label || `option ${index + 1}`
      };
    });

    const clarificationCommands = {
      "cancel": () => {
        speak("Okay, cancelled.");
        exitClarificationMode();
      },
      "never mind": () => {
        speak("Okay, cancelled.");
        exitClarificationMode();
      },
      "*choice": (choice) => {
        const selectedIndex = parseChoiceIndex(choice, numberedChoices);

        if (selectedIndex === -2) {
          speak("Okay, cancelled.");
          exitClarificationMode();
          return;
        }

        if (selectedIndex >= 0) {
          const selected = numberedChoices[selectedIndex];
          if (selected?.href) {
            speak(`Opening ${selected.title}`);
            window.location.replace(selected.href);
            return;
          }
        }

        speak(`Please say a number between one and ${numberedChoices.length}, or say cancel.`);
      }
    };

    numberedChoices.forEach((choice) => {
      const number = choice.index + 1;
      clarificationCommands[String(number)] = () => {
        speak(`Opening ${choice.title}`);
        window.location.replace(choice.href);
      };

      clarificationCommands[`option ${number}`] = clarificationCommands[String(number)];

      if (ORDINAL_WORDS[choice.index]) {
        clarificationCommands[ORDINAL_WORDS[choice.index]] = clarificationCommands[String(number)];
      }
    });

    const clarificationPhrases = Object.keys(clarificationCommands);
    annyang.addCommands(clarificationCommands);

    clarificationState = {
      phrases: clarificationPhrases,
      token: clarificationToken,
      timeoutId: null,
      cleanup: cleanupOverlays
    };

    const shortList = numberedChoices
      .slice(0, 4)
      .map((choice) => `${choice.index + 1}: ${choice.title}`)
      .join(". ");

    const summary = numberedChoices.length > 4
      ? `${shortList}. and ${numberedChoices.length - 4} more.`
      : shortList;

    speak(
      `I found ${numberedChoices.length} exact matches for ${spokenObjectName}. Say the number you want to open. ${summary}`,
      () => {
        if (!clarificationState || clarificationState.token !== clarificationToken) {
          return;
        }

        clarificationState.timeoutId = window.setTimeout(() => {
          speak("Selection timed out. Please try again.");
          exitClarificationMode();
        }, CLARIFICATION_TIMEOUT_MS);
      }
    );
  }

  function openItemFromCurrentPage(rawObjectName) {
    const objectName = sanitizeVoiceObject(rawObjectName);
    const normalizedObjectName = normalizeSpeech(objectName);

    if (!normalizedObjectName) {
      speak("Please say the item name you want to open.");
      return;
    }

    const candidates = buildItemLinkCandidates();
    if (!candidates.length) {
      speak("I could not find any item links on this page.");
      return;
    }

    const exactMatches = candidates.filter((candidate) => {
      return candidate.normalizedLabel === normalizedObjectName;
    });

    if (exactMatches.length === 1 && exactMatches[0].href) {
      const exactLabel = exactMatches[0].label || objectName;
      speak(`Opening ${exactLabel}`);
      window.location.replace(exactMatches[0].href);
      return;
    }

    if (exactMatches.length > 1) {
      askForOnPageItemChoice(exactMatches, objectName);
      return;
    }

    const startsWithMatches = candidates.filter((candidate) => candidate.normalizedLabel.startsWith(normalizedObjectName));
    const includesMatches = candidates.filter((candidate) => candidate.normalizedLabel.includes(normalizedObjectName));
    const bestMatch = startsWithMatches[0] || includesMatches[0];

    if (!bestMatch || !bestMatch.href) {
      speak(`I could not find ${objectName} on this page.`);
      return;
    }

    const label = bestMatch.label || objectName;
    speak(`Opening ${label}`);
    window.location.replace(bestMatch.href);
  }

  function scrollPage(direction) {
    const viewportStep = Math.max(180, Math.round(window.innerHeight * 0.7));
    window.scrollBy({
      top: direction < 0 ? -viewportStep : viewportStep,
      behavior: "smooth"
    });
  }

  function triggerClick(element) {
    if (!element) {
      return false;
    }

    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    return true;
  }

  function moveOnScreenCarousel(direction) {
    const itemArrowSelector = direction < 0 ? ".item-carousel-arrow-left" : ".item-carousel-arrow-right";
    const itemArrow = document.querySelector(itemArrowSelector);

    if (itemArrow && !itemArrow.disabled) {
      if (triggerClick(itemArrow)) {
        // Update overlay image if it's open, after carousel animation
        setTimeout(updateItemOverlayIfOpen, 360);
        return;
      }
    }

    const standardCarousel = document.querySelector(".carousel");
    if (standardCarousel) {
      const arrows = standardCarousel.querySelectorAll(".arrow");
      if (arrows.length >= 2) {
        const targetArrow = direction < 0 ? arrows[0] : arrows[arrows.length - 1];
        const isDisabled = targetArrow.getAttribute("aria-disabled") === "true";

        if (!isDisabled && triggerClick(targetArrow)) {
          return;
        }
      }
    }

    speak("There is no carousel movement available right now.");
  }

  function cancelCurrentAction() {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    if (itemImageOverlayElement) {
      closeItemOverlay(false);
    }

    if (clarificationState) {
      exitClarificationMode();
      speak("Okay, cancelled.");
      return;
    }

    speak("Stopped.");
  }

  function clearClarificationState() {
    if (!clarificationState) {
      return;
    }

    if (clarificationState.timeoutId) {
      window.clearTimeout(clarificationState.timeoutId);
    }

    if (typeof clarificationState.cleanup === "function") {
      clarificationState.cleanup();
    }

    removeCommands(clarificationState.phrases);
    clarificationState = null;
  }

  function exitClarificationMode() {
    clearClarificationState();
    addBaseCommands();
  }

  function chooseClarifiedOption(option) {
    if (!option?.systemNumber) {
      speak("That option is missing an item identifier. Please try again.");
      exitClarificationMode();
      return;
    }

    speak(`Opening ${option.title}`);
    window.location.replace(
      `/pages/item.html?id=${encodeURIComponent(option.systemNumber)}&voiceExplain=1`
    );
  }

  function parseChoiceIndex(choice, options) {
    const normalizedChoice = normalizeSpeech(choice);

    if (!normalizedChoice) {
      return -1;
    }

    if (normalizedChoice.includes("cancel") || normalizedChoice.includes("never mind")) {
      return -2;
    }

    const digitMatch = normalizedChoice.match(/\b([1-9])\b/);
    if (digitMatch) {
      const numericIndex = Number(digitMatch[1]) - 1;
      return numericIndex < options.length ? numericIndex : -1;
    }

    const tokens = normalizedChoice.split(" ").filter(Boolean);
    const cardinalIndex = tokens.find((token) => CARDINAL_TO_INDEX[token] !== undefined);
    if (cardinalIndex) {
      const mappedIndex = CARDINAL_TO_INDEX[cardinalIndex];
      return mappedIndex < options.length ? mappedIndex : -1;
    }

    const wordIndex = ORDINAL_WORDS.findIndex((word) => normalizedChoice.includes(word));
    if (wordIndex >= 0 && wordIndex < options.length) {
      return wordIndex;
    }

    const titleIndex = options.findIndex((option) => {
      return option.normalizedTitle && normalizedChoice.includes(option.normalizedTitle);
    });

    return titleIndex;
  }

  function askForClarification(options, originalQuery) {
    suspendBaseCommands();
    const clarificationToken = clarificationTokenCounter + 1;
    clarificationTokenCounter = clarificationToken;

    const clarificationCommands = {
      "cancel": () => {
        speak("Okay, cancelled.");
        exitClarificationMode();
      },
      "never mind": () => {
        speak("Okay, cancelled.");
        exitClarificationMode();
      },
      "*choice": (choice) => {
        const selectedIndex = parseChoiceIndex(choice, options);

        if (selectedIndex === -2) {
          speak("Okay, cancelled.");
          exitClarificationMode();
          return;
        }

        if (selectedIndex >= 0) {
          chooseClarifiedOption(options[selectedIndex]);
          return;
        }

        speak("I did not catch that. Please say first, second, third, or cancel.");
      }
    };

    options.forEach((option, index) => {
      const ordinalWord = ORDINAL_WORDS[index];
      const optionWord = ["one", "two", "three"][index];

      if (!ordinalWord || !optionWord) {
        return;
      }

      clarificationCommands[ordinalWord] = () => chooseClarifiedOption(option);
      clarificationCommands[`${ordinalWord} one`] = () => chooseClarifiedOption(option);
      clarificationCommands[`${ordinalWord} option`] = () => chooseClarifiedOption(option);
      clarificationCommands[`option ${optionWord}`] = () => chooseClarifiedOption(option);
    });

    const clarificationPhrases = Object.keys(clarificationCommands);
    annyang.addCommands(clarificationCommands);

    const optionList = options
      .map((option, idx) => `${ORDINAL_WORDS[idx]}: ${option.label}`)
      .join(". ");

    clarificationState = {
      phrases: clarificationPhrases,
      token: clarificationToken,
      timeoutId: null
    };

    speak(`I found multiple matches for ${originalQuery}. Say first, second, or third. ${optionList}`, () => {
      if (!clarificationState || clarificationState.token !== clarificationToken) {
        return;
      }

      clarificationState.timeoutId = window.setTimeout(() => {
        speak("Clarification timed out. Please ask again.");
        exitClarificationMode();
      }, CLARIFICATION_TIMEOUT_MS);
    });
  }

  async function explainObjectWithDisambiguation(rawObjectName) {
    const objectName = sanitizeVoiceObject(rawObjectName);

    if (!objectName) {
      speak("Please tell me which object you want to learn about.");
      return;
    }

    if (typeof getData !== "function" || typeof searchURL !== "string") {
      // Fallback on pages where API helpers are not loaded.
      window.location.replace("/pages/scroll.html?q=" + encodeURIComponent(objectName));
      return;
    }

    const query = `${encodeURIComponent(objectName)}&page_size=3`;
    const data = await getData(searchURL, query);
    const records = Array.isArray(data?.records) ? data.records : [];

    if (!records.length) {
      speak(`I could not find anything for ${objectName}.`);
      return;
    }

    const options = records
      .filter((record) => record?.systemNumber)
      .slice(0, 3)
      .map((record, index) => buildClarificationOption(record, index));

    if (!options.length) {
      speak(`I found results for ${objectName}, but could not open them.`);
      return;
    }

    if (options.length === 1) {
      chooseClarifiedOption(options[0]);
      return;
    }

    askForClarification(options, objectName);
  }

  // Register commands and speech callbacks, then start listening.
  async function initializeVoiceCommands() {
    const homePhrases = await getCommandsFromJson(
      "/commands.json",
      ["directCommands", "navigation", "home"]
    );

    const helpPhrases = await getCommandsFromJson(
      "/commands.json",
      ["directCommands", "navigation", "help"]
    );

    const cancelPhrases = await getCommandsFromJson(
      "/commands.json",
      ["directCommands", "pageCommands", "cancel"]
    );

    const carouselLeftPhrases = await getCommandsFromJson(
      "/commands.json",
      ["directCommands", "pageCommands", "carouselLeft"]
    );

    const carouselRightPhrases = await getCommandsFromJson(
      "/commands.json",
      ["directCommands", "pageCommands", "carouselRight"]
    );

    const scrollUpPhrases = await getCommandsFromJson(
      "/commands.json",
      ["directCommands", "pageCommands", "scrollUp"]
    );

    const scrollDownPhrases = await getCommandsFromJson(
      "/commands.json",
      ["directCommands", "pageCommands", "scrollDown"]
    );

    const readCurrentItemPhrases = await getCommandsFromJson(
      "/commands.json",
      ["directCommands", "pageCommands", "readCurrentItem"]
    );

    const openCurrentItemOverlayPhrases = await getCommandsFromJson(
      "/commands.json",
      ["directCommands", "pageCommands", "openCurrentItemOverlay"]
    );

    const closeItemOverlayPhrases = await getCommandsFromJson(
      "/commands.json",
      ["directCommands", "pageCommands", "closeItemOverlay"]
    );

    const searchPhrases = await getCommandsFromJson(
      "/commands.json",
      ["parameterizedCommands", "navigation", "search"]
    );

    const openItemOnPagePhrases = await getCommandsFromJson(
      "/commands.json",
      ["parameterizedCommands", "navigation", "openItemOnPage"]
    );

    const objectExplanationPhrases = await getCommandsFromJson(
      "/commands.json",
      ["disambiguatedParameterizedCommands", "objectExplanation"]
    );

    baseCommandGroups = {
      home: homePhrases,
      help: helpPhrases,
      cancel: cancelPhrases,
      carouselLeft: carouselLeftPhrases,
      carouselRight: carouselRightPhrases,
      scrollUp: scrollUpPhrases,
      scrollDown: scrollDownPhrases,
      readCurrentItem: readCurrentItemPhrases,
      openCurrentItemOverlay: openCurrentItemOverlayPhrases,
      closeItemOverlay: closeItemOverlayPhrases,
      search: searchPhrases,
      openItemOnPage: openItemOnPagePhrases,
      objectExplanation: objectExplanationPhrases
    };

    addBaseCommands();

    annyang.addCallback("result", (phrases) => {
      if (phrases.length > 0) {
        logToConsole(phrases[0]);
      }
    });

    annyang.addCallback("resultNoMatch", (phrases) => {
      if (!Array.isArray(phrases) || !phrases.length) {
        return;
      }

      const fallbackObject = extractObjectFromFreeSpeech(phrases[0]);
      if (!fallbackObject) {
        return;
      }

      explainObjectWithDisambiguation(fallbackObject);
    });

    // Toggle mic glow while the recognizer is actively hearing sound.
    annyang.addCallback("soundstart", () => {
      const micSvg = document.querySelector(".mic svg");
      if (micSvg) {
        micSvg.classList.add("listening");
      }
    });

    annyang.addCallback("end", () => {
      const micSvg = document.querySelector(".mic svg");
      if (micSvg) {
        micSvg.classList.remove("listening");
      }
    });

    annyang.start();
  }

  initializeVoiceCommands().catch((error) => {
    console.error("Failed to initialize voice commands", error);
  });
}