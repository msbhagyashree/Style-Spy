// content.js – Style Spy Content Script
// Injected into the active tab to extract computed styles from visible elements.

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // Utilities
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Convert an rgb/rgba string to a HEX colour string.
   * Returns null if the colour is fully transparent or unparseable.
   */
  function rgbToHex(rgbStr) {
    if (!rgbStr) return null;

    const match = rgbStr.match(
      /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/
    );
    if (!match) return null;

    const r = parseInt(match[1], 10);
    const g = parseInt(match[2], 10);
    const b = parseInt(match[3], 10);
    const a = match[4] !== undefined ? parseFloat(match[4]) : 1;

    // Skip fully transparent colours
    if (a === 0) return null;

    const toHex = (n) => n.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
  }

  /**
   * Convert HEX to RGB object.
   */
  function hexToRgb(hex) {
    const clean = hex.replace('#', '');
    const bigint = parseInt(clean, 16);
    return {
      r: (bigint >> 16) & 255,
      g: (bigint >> 8) & 255,
      b: bigint & 255
    };
  }

  /**
   * Check if an element is visually meaningful (visible, has dimensions, not hidden).
   */
  function isVisible(el, style) {
    if (!el || !style) return false;
    if (style.display === 'none') return false;
    if (style.visibility === 'hidden') return false;
    if (parseFloat(style.opacity) === 0) return false;

    const rect = el.getBoundingClientRect();
    // Accept elements anywhere in the document, not just in viewport
    if (rect.width === 0 && rect.height === 0) return false;

    return true;
  }

  /**
   * Normalize a font-family string: strip quotes, trim, lowercase.
   */
  function normalizeFontFamily(ff) {
    if (!ff) return 'Unknown';
    // Take only the first font in the stack
    const first = ff.split(',')[0].trim().replace(/['"]/g, '');
    return first || 'Unknown';
  }

  /**
   * Round a font size to nearest 0.5px for grouping.
   */
  function roundSize(sizeStr) {
    const px = parseFloat(sizeStr);
    if (isNaN(px)) return sizeStr;
    return (Math.round(px * 2) / 2) + 'px';
  }

  /**
   * Round a line-height to 2 decimal places.
   */
  function roundLineHeight(lh) {
    const val = parseFloat(lh);
    if (isNaN(val)) return lh;
    return Math.round(val * 100) / 100 + '';
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Colour Extraction
  // ─────────────────────────────────────────────────────────────────────────────

  function extractColours() {
    const colourMap = {}; // hex -> count
    const elements = document.querySelectorAll('*');
    let totalVisible = 0;

    // Properties to check for colour values
    const colourProps = [
      'backgroundColor',
      'color',
      'borderTopColor',
      'borderRightColor',
      'borderBottomColor',
      'borderLeftColor',
      'outlineColor'
    ];

    // Weights: background and text are primary signals
    const propWeight = {
      backgroundColor: 2,
      color: 2,
      borderTopColor: 1,
      borderRightColor: 1,
      borderBottomColor: 1,
      borderLeftColor: 1,
      outlineColor: 1
    };

    elements.forEach((el) => {
      // Skip script, style, meta, head elements
      const tag = el.tagName ? el.tagName.toLowerCase() : '';
      if (['script', 'style', 'meta', 'head', 'link', 'noscript', 'template', 'svg'].includes(tag)) return;

      const style = window.getComputedStyle(el);
      if (!isVisible(el, style)) return;

      totalVisible++;

      colourProps.forEach((prop) => {
        const val = style[prop];
        if (!val || val === 'transparent' || val === 'initial' || val === 'inherit') return;

        // Skip borders if the border width is 0
        if (prop.startsWith('border') || prop === 'outlineColor') {
          const widthProp = prop.replace('Color', 'Width').replace('outline', 'outline-');
          const bw = parseFloat(style[widthProp] || style.borderWidth || '0');
          if (bw === 0) return;
        }

        const hex = rgbToHex(val);
        if (!hex) return;

        // Skip near-white and near-black only if they're duplicating obvious backgrounds
        // (we keep them because they ARE meaningful)

        const weight = propWeight[prop] || 1;
        colourMap[hex] = (colourMap[hex] || 0) + weight;
      });
    });

    // Build sorted colour list
    const colours = Object.entries(colourMap)
      .map(([hex, count]) => {
        const rgb = hexToRgb(hex);
        return {
          hex,
          rgb: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
          count,
          percentage: totalVisible > 0 ? Math.round((count / (totalVisible * 2)) * 100) : 0
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 40); // Cap at top 40 colours

    return colours;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Font Extraction
  // ─────────────────────────────────────────────────────────────────────────────

  function extractFonts() {
    const fontMap = {}; // key -> { fontFamily, weight, size, lineHeight, count, sampleText }
    const textElements = document.querySelectorAll(
      'h1, h2, h3, h4, h5, h6, p, a, span, li, td, th, label, button, input, textarea, div, blockquote, figcaption, caption'
    );

    textElements.forEach((el) => {
      const style = window.getComputedStyle(el);
      if (!isVisible(el, style)) return;

      // Only include elements that directly contain text nodes
      const hasDirectText = Array.from(el.childNodes).some(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0
      );
      if (!hasDirectText) return;

      const fontFamily = normalizeFontFamily(style.fontFamily);
      const fontWeight = style.fontWeight;
      const fontSize = roundSize(style.fontSize);
      const lineHeight = roundLineHeight(style.lineHeight);

      // Create a grouping key
      const key = `${fontFamily}__${fontWeight}__${fontSize}__${lineHeight}`;

      if (!fontMap[key]) {
        // Capture a sample of real text from this element
        let sample = el.textContent.trim().replace(/\s+/g, ' ').slice(0, 60);
        if (!sample) sample = 'Sample Text';

        fontMap[key] = {
          fontFamily,
          fontFamilyFull: style.fontFamily, // Keep full stack for CSS export
          fontWeight: parseInt(fontWeight, 10) || fontWeight,
          fontSize,
          lineHeight,
          count: 0,
          sampleText: sample,
          tag: el.tagName.toLowerCase()
        };
      }
      fontMap[key].count++;
    });

    // Sort by count descending
    return Object.values(fontMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 30); // Cap at top 30 font combos
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Message Listener
  // ─────────────────────────────────────────────────────────────────────────────

  // Guard against multiple injections registering duplicate listeners
  if (!window.__styleSpyListenerAttached) {
    window.__styleSpyListenerAttached = true;

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'extractStyles') {
        try {
          const colours = extractColours();
          const fonts = extractFonts();
          sendResponse({
            success: true,
            colours,
            fonts,
            url: window.location.href,
            title: document.title
          });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
        return true;
      }
    });
  }
})();
