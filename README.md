# Voice Controlled Museum Site

An accessibility-focused web experience that allows users to explore museum collections using voice commands and speech synthesis.

## Overview

The Voice Controlled Museum is a hands-free, voice-driven interface designed to make museum artifact exploration accessible to all users, particularly those with visual or mobility impairments. The site uses the Web Speech API for voice recognition and text-to-speech synthesis to provide an intuitive, audio-first navigation experience.

## Features

- **Voice-Driven Navigation**: Control the entire site using natural voice commands
- **Accessibility First**: Designed for users with limited dexterity or visual impairments
- **Dual Feedback**: Visual UI updates combined with audio confirmations
- **Museum Collections**: Browse and search museum artifacts and collections
- **Detailed Object Information**: Get comprehensive descriptions and metadata for museum items
- **Audio Descriptions**: Automatic text-to-speech readings of object information

## Getting Started

1. Open `index.html` in a modern web browser (Chrome, Firefox, Safari, Edge)
2. Allow microphone access when prompted by the browser
3. Start giving voice commands to navigate the site

## Voice Commands

### Navigation Commands

- **Go Home**: "go home", "home", "home page", "menu", "back", "go back"
- **Help**: "help", "display helpful commands"

### Page Navigation

#### Carousel Controls (for browsing items)
- **Move Left**: "move left", "carousel left", "go left", "previous item", "left"
- **Move Right**: "move right", "carousel right", "go right", "next item", "right", "next"

#### Scrolling
- **Scroll Up**: "scroll up", "move up", "page up", "go up"
- **Scroll Down**: "scroll down", "move down", "page down", "go down"

#### Item Interaction
- **Read Item**: "read current item", "read this item", "describe this item", "tell me this item"
- **Enlarge Image**: "enlarge", "enlarge image", "make image bigger", "enhance"
- **Close Image**: "close image", "close overlay", "close", "exit image"

#### General Controls
- **Cancel Action**: "cancel", "stop", "never mind"

### Search & Content Commands

- **Search by Category**: "show me *object" (e.g., "show me all ceramics")
- **Get More Information**: "show me a list of *object", "show more about *object"

## File Structure

```
.
├── index.html              # Home page
├── commands.json           # Voice command definitions
├── commands.txt            # Command reference (text format)
├── css/
│   └── styles.css         # Main stylesheets
├── js/
│   ├── index.js           # Main application logic
│   ├── voice-commands.js  # Voice command handlers
│   ├── carousel.js        # Carousel navigation
│   ├── scroll.js          # Scroll functionality
│   ├── api.js             # API integration
│   ├── item.js            # Item detail handling
│   └── annyang.min.js     # Voice recognition library
├── pages/
│   ├── collection.html    # Collection view page
│   ├── item.html          # Item detail page
│   ├── help.html          # Help/commands reference page
│   └── scroll.html        # Scrollable content page
└── images/                # Image assets
```

## Browser Support

- Chrome 25+
- Firefox 25+
- Safari 14.1+
- Edge 79+

**Note**: Voice recognition requires microphone access and works best with stable internet connection.

## Accessibility

This site is specifically designed with accessibility in mind:
- Voice control for hands-free navigation
- Audio feedback via text-to-speech synthesis
- Simple, clear command structure
- Visual feedback in addition to audio cues
- Support for users with visual or motor impairments

## Tips for Use

1. **Speak Clearly**: Enunciate commands clearly for best voice recognition results
2. **Use Natural Language**: Try variations of commands if one doesn't work
3. **Listen for Feedback**: The site provides audio confirmation of recognized commands
4. **Request Help**: Say "help" at any time to hear available commands
5. **Use Items Page**: Visit the item detail page to explore artifact information in depth
