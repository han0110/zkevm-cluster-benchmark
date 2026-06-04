/*
 * Vitest setup shared by every test. jsdom does not implement ResizeObserver, which the virtual-row hook
 * constructs once a table grows past its windowing threshold, so a no-op stub stands in for it. React
 * Testing Library is told to unmount between tests so a rendered tree never leaks into the next one.
 */

import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

// jsdom does not implement scrollIntoView, which the log console calls to reveal the hovered line.
Element.prototype.scrollIntoView = (): void => {};

afterEach(() => cleanup());
