// Only initialize voice commands once per page load
if (!window.voiceCommandsInitialized) {
  window.voiceCommandsInitialized = true;

  const annyang = window.annyang;

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

    const searchPhrases = await getCommandsFromJson(
      "/commands.json",
      ["parameterizedCommands", "navigation", "search"]
    );

    annyang.addCommands(
      createCommands(homePhrases, () => window.location.replace("/index.html"))
    );

    annyang.addCommands(
      createCommands(helpPhrases, () => window.location.replace("/pages/help.html"))
    );

    annyang.addCommands(
      createCommands(searchPhrases, (search) =>
        window.location.replace("/pages/scroll.html?q=" + encodeURIComponent(search || ""))
      )
    );

    annyang.addCallback("result", (phrases) => {
      if (phrases.length > 0) {
        logToConsole(phrases[0]);
      }
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