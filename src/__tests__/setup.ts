import "@testing-library/jest-dom/vitest"

// Polyfill pointer capture methods missing from jsdom (needed by Radix UI)
if (typeof Element.prototype.hasPointerCapture !== "function") {
  Element.prototype.hasPointerCapture = () => false
}
if (typeof Element.prototype.setPointerCapture !== "function") {
  Element.prototype.setPointerCapture = () => {}
}
if (typeof Element.prototype.releasePointerCapture !== "function") {
  Element.prototype.releasePointerCapture = () => {}
}

// Polyfill scrollIntoView (used by Radix UI Select)
if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = () => {}
}

// Polyfill ResizeObserver (used by Radix UI's useSize, via Popover/Dialog).
// Without it the layout effect throws as an unhandled error and intermittently
// takes down whichever test file happens to be mounting Radix at the time.
if (typeof globalThis.ResizeObserver !== "function") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

// Polyfill matchMedia (used by next-themes' ThemeProvider)
if (typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  } as unknown as MediaQueryList)
}
