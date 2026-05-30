/* Join class-name fragments, dropping falsy values so optional classes leave no trailing space. */
export const cx = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(' ');
