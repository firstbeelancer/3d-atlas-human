import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

// на нагруженной машине ленивые куски грузятся дольше секунды — ждём появления элементов до 5 с
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
  try {
    localStorage.clear();
  } catch {
    /* storage may be mocked to throw */
  }
});

if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
