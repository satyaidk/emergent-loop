// Runs before every test file. jsdom (the fake browser used in tests) lacks a few browser APIs.
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup, configure } from "@testing-library/react";

// The Markdown renderer is loaded on demand. On a cold first run, with other test files running in
// parallel, that can take several seconds, far over the default 1s.
configure({ asyncUtilTimeout: 15000 });

afterEach(() => {
  cleanup();
  localStorage.clear();
});

if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}
