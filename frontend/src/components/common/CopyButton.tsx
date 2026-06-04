/*
 * Icon button that copies a value to the clipboard and briefly flashes a check on success. It shares the
 * app's icon-button chrome, swapping only its color for the success cue, and uses the small size so it
 * rides at the end of a label without competing with it. Being a fixed-size control, a long, truncating
 * neighbor never pushes it out of view.
 */

import { cx } from '@/utils/cx';
import { FOCUS_RING, ICON_BUTTON, ICON_BUTTON_COLOR, ICON_BUTTON_SM } from '@/utils/styles';
import { IconCheck, IconCopy } from '@/components/common/icons';
import { useCopyFeedback } from '@/hooks/useCopyFeedback';

export function CopyButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const { state, copy } = useCopyFeedback();
  const copied = state === 'copied';

  const onCopy = async (): Promise<void> => {
    await copy(text);
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={label}
      title={label}
      className={cx(ICON_BUTTON, ICON_BUTTON_SM, copied ? 'text-success' : ICON_BUTTON_COLOR, FOCUS_RING, className)}
    >
      {copied ? <IconCheck /> : <IconCopy />}
    </button>
  );
}
