# Voice Controlled Museum Site

A voice-first museum browsing prototype powered by the V&A Collections API and browser speech capabilities.

## Overview

This project provides a hands-free way to explore museum objects and collections. It combines:

1. Speech recognition for command input (via Annyang/Web Speech APIs)
2. Speech synthesis for spoken feedback and descriptions
3. Dynamic V&A API content for search, item detail, and related exploration

The interface is designed to remain usable with minimal keyboard/mouse interaction.

## Current Experience

The app currently includes:

1. Home page carousel experience
2. Collection page with API-driven cards
3. Item detail page with circular image carousel and image overlay
4. Scroll results page with two-column animated browsing
5. Help page generated dynamically from the command config file

## Command System

Command definitions live in [commands.json](commands.json) and are consumed by [js/voice-commands.js](js/voice-commands.js).

Each command entry now uses this structure:

```json
{
	"description": "What the command does",
	"commands": ["phrase one", "phrase two"]
}
```

The Help page reads these definitions at runtime, so command descriptions and phrases stay synchronized with configuration.

## Data Sources

Primary APIs used:

1. V&A object endpoint for individual object records
2. V&A search endpoint for query-based retrieval

API calls are handled in [js/api.js](js/api.js), including basic request queueing, daily budget tracking, and response caching.

## Run Locally

Because the site fetches JSON and API resources, run it through a local web server (not direct file-open).

Example options:

1. VS Code Live Server extension
2. `python -m http.server`
3. Any static server rooted at the repository directory

Then open:

1. [index.html](index.html)

## Project Structure

```text
.
|- index.html
|- commands.json
|- css/
|  |- styles.css
|- js/
|  |- annyang.min.js
|  |- api.js
|  |- carousel.js
|  |- collection.js
|  |- help.js
|  |- index.js
|  |- item.js
|  |- scroll.js
|  |- voice-commands.js
|- pages/
|  |- collection.html
|  |- help.html
|  |- item.html
|  |- scroll.html
```

## Accessibility Notes

The implementation emphasizes:

1. Voice-first navigation and interaction
2. Spoken confirmations and item narration
3. Large interactive controls and clear visual hierarchy
4. Fallback behavior when voice features are unavailable

## Browser Notes

Modern Chromium-based browsers provide the best speech-recognition support. Microphone permission is required for voice control.
