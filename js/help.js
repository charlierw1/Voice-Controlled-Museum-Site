window.addEventListener("load", async () => {
    const host = document.querySelector("#help-commands");
    if (!host) {
        return;
    }

    try {
        const response = await fetch("/commands.json");
        if (!response.ok) {
            throw new Error(`Failed to load commands.json: ${response.status}`);
        }

        const config = await response.json();
        const commandEntries = collectCommandEntries(config);

        if (!commandEntries.length) {
            host.replaceChildren(buildMessageSection("No commands were found."));
            return;
        }

        const total = commandEntries.length;
        const sections = commandEntries.map((entry, i) => buildCommandSection(entry, total - i));
        host.replaceChildren(...sections);
    } catch (error) {
        console.error("Failed to render help commands", error);
        host.replaceChildren(buildMessageSection("Could not load command help."));
    }
});

function collectCommandEntries(config) {
    const buckets = [
        config?.directCommands,
        config?.parameterizedCommands,
        config?.disambiguatedDirectCommands,
        config?.disambiguatedParameterizedCommands
    ];

    const entries = [];

    buckets.forEach((bucket) => {
        collectEntriesRecursive(bucket, [], entries);
    });

    return entries;
}

function collectEntriesRecursive(node, path, entries) {
    if (!node || typeof node !== "object") {
        return;
    }

    if (Array.isArray(node.commands)) {
        const commandName = path[path.length - 1] || "command";
        entries.push({
            key: path.join("."),
            name: commandName,
            description: typeof node.description === "string" ? node.description.trim() : "",
            phrases: node.commands.filter((item) => typeof item === "string" && item.trim())
        });
        return;
    }

    Object.entries(node).forEach(([key, child]) => {
        collectEntriesRecursive(child, [...path, key], entries);
    });
}

function formatCommandName(name) {
    return String(name || "")
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/[_-]+/g, " ")
        .replace(/^\w/, (char) => char.toUpperCase());
}

function buildCommandSection(entry, zIndex) {
    const section = document.createElement("section");
    if (zIndex !== undefined) section.style.zIndex = zIndex;

    const wrapper = document.createElement("div");
    wrapper.className = "help-command-block";

    const heading = document.createElement("h2");
    heading.textContent = formatCommandName(entry.name);

    const description = document.createElement("p");
    description.textContent = entry.description || "No description available.";

    const phrasesLabel = document.createElement("p");
    phrasesLabel.className = "help-command-label";
    phrasesLabel.textContent = "Phrases:";

    const phraseList = document.createElement("p");
    phraseList.className = "help-command-phrases";
    phraseList.textContent = entry.phrases.join(", ");

    wrapper.append(heading, description, phrasesLabel, phraseList);
    section.appendChild(wrapper);

    return section;
}

function buildMessageSection(message) {
    const section = document.createElement("section");
    const text = document.createElement("p");
    text.textContent = message;
    section.appendChild(text);
    return section;
}
