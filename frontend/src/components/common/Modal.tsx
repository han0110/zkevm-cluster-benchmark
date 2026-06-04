/*
 * Shared chrome for the page's fullscreen modals, the benchmark picker and the block trace overlay. The
 * component renders the dimmed backdrop, a role=dialog panel marked aria-modal, and the title row with a
 * close control, and it wires dismissal on a backdrop press or Escape through useDismissable. Each caller
 * keeps its own panel sizing and positioning, since one overlay centers its panel in a fixed container
 * while the other positions the panel itself, so the panel class string and an optional container class
 * string are supplied by the caller while the truly common backdrop, dialog attributes, header, and
 * dismiss wiring live here. The component is always mounted only while its modal is open, so its dismiss
 * listeners attach for exactly the modal's lifetime.
 */

import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { IconButton } from '@/components/common/IconButton';
import { IconClose } from '@/components/common/icons';
import { SectionHeading } from '@/components/common/SectionHeading';
import { useDismissable } from '@/hooks/useDismissable';

// The selector matching the elements a Tab cycle visits, used to find the panel's first and last stop
// for the wrap. Disabled controls and elements pulled out of the tab order are excluded so the cycle
// lands only on reachable stops.
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ModalProps {
  // The dialog title shown in the header, and its accessible label.
  title: ReactNode;
  ariaLabel: string;
  // Dismissal on a backdrop press, Escape, or the close control. The same action serves all three.
  onDismiss: () => void;
  // The close control's accessible label, distinct per modal.
  closeLabel: string;
  // Sizing and positioning for the dialog panel, which differs between the two modals.
  panelClassName: string;
  // An optional fixed container that centers the panel, omitted by an overlay that positions the panel
  // itself.
  containerClassName?: string;
  // Anchors beyond the panel that count as inside, so a press within any of them never dismisses. The
  // picker passes its trigger so reopening toward the trigger does not immediately close.
  extraRefs?: Array<RefObject<HTMLElement | null>>;
  // The dialog body below the header.
  children: ReactNode;
}

export function Modal({ title, ariaLabel, onDismiss, closeLabel, panelClassName, containerClassName, extraRefs, children }: ModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  // A press outside the panel and the extra anchors, or Escape, dismisses the modal. A press inside the
  // panel does not. The modal is mounted only while open, so the listeners stay for its lifetime.
  useDismissable(true, () => onDismiss(), { refs: [panelRef, ...(extraRefs ?? [])] });

  // Accessible focus management spanning the modal's lifetime, which mounts only while open. On mount it
  // records the previously focused element and moves focus inside the panel, preferring the first
  // focusable child and falling back to the panel itself. While mounted a capturing keydown traps Tab
  // and Shift+Tab so focus wraps within the panel rather than escaping to the page behind it. On unmount
  // it restores focus to the element that held it before the modal opened.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusable = (): HTMLElement[] =>
      Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    const first = focusable()[0];
    (first ?? panel).focus();
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab') return;
      const stops = focusable();
      const firstStop = stops[0];
      const lastStop = stops[stops.length - 1];
      if (!firstStop || !lastStop) {
        // With no focusable child the panel itself holds focus, so Tab has nowhere to go and stays put.
        e.preventDefault();
        panel.focus();
        return;
      }
      const active = document.activeElement;
      // Shift+Tab off the first stop wraps to the last, and Tab off the last wraps to the first, so the
      // cycle never reaches the page behind the modal. Focus that has drifted outside the panel returns
      // to an edge as well.
      if (e.shiftKey) {
        if (active === firstStop || !panel.contains(active)) {
          e.preventDefault();
          lastStop.focus();
        }
      } else if (active === lastStop || !panel.contains(active)) {
        e.preventDefault();
        firstStop.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, []);

  const panel = (
    <div ref={panelRef} role="dialog" aria-modal="true" aria-label={ariaLabel} tabIndex={-1} className={panelClassName}>
      <div className="flex items-center justify-between gap-3">
        <SectionHeading>{title}</SectionHeading>
        <IconButton onClick={onDismiss} label={closeLabel}>
          <IconClose />
        </IconButton>
      </div>
      {children}
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 z-40 bg-background/70" aria-hidden="true" />
      {containerClassName ? <div className={containerClassName}>{panel}</div> : panel}
    </>
  );
}
