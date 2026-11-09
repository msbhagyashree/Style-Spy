# Style Spy 🕵️

A Chrome Extension that extracts the visual design system from any website — colours, fonts, and design tokens — and lets you save them as reusable style kits.

## Features

- **Colour Extraction** – Detects all computed background, text, and border colours. Ranked by usage frequency with HEX + RGB values.
- **Font Detection** – Extracts font family, weight, size, and line-height from visible text elements with live previews.
- **One-Click Copy** – Click any colour or font to copy its value/CSS to clipboard.
- **Save Style Kits** – Save extracted tokens under a custom name. Survives browser restarts via `chrome.storage.local`.
- **Export CSS Variables** – Generate and download a `.css` file with `:root` custom properties for all colours and fonts.

## Project Structure

```
style-spy/
├── manifest.json       Chrome Extension MV3 manifest
├── background.js       Service worker
├── content.js          Injected into pages to extract computed styles
├── popup.html          Extension popup UI
├── popup.css           Popup styles
├── popup.js            Popup controller logic
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── create-icons.js     Node script used to generate the icons (not needed at runtime)
└── generate-icons.html Helper HTML page for regenerating icons in browser
```

## How to Load in Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `style-spy` folder
5. The Style Spy icon will appear in your Chrome toolbar

> If Chrome asks to pin it, click the puzzle piece icon → Pin Style Spy.

## How to Use

1. Navigate to any website (e.g. `https://github.com`)
2. Click the Style Spy extension icon in the toolbar
3. Click **Analyze Page**
4. Switch between **Colours** and **Fonts** tabs to explore results
5. Click any colour or **Copy** button to copy to clipboard
6. Click **Save Kit** to name and persist the extracted tokens
7. Click **Export CSS** to generate and download a `.css` variables file
8. Navigate to **Saved Kits** to revisit, rename, delete, or re-export saved kits

## Permissions Used

| Permission   | Why it's needed |
|--------------|-----------------|
| `activeTab`  | Access the currently active tab to inject the content script |
| `scripting`  | Inject `content.js` into the page to read computed styles |
| `storage`    | Persist saved style kits across browser sessions |

No data ever leaves your device. No API keys, no network requests.

## Browser Compatibility

- Chrome 88+ (Manifest V3 support)
- Microsoft Edge (Chromium) 88+

## Notes

- The extension cannot analyze `chrome://` or `chrome-extension://` pages — this is a Chrome security restriction.
- Cross-origin iframes are skipped automatically.
- Re-running analysis on the same page updates the results in-place.
