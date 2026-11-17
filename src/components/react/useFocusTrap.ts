import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible focus trap for modal dialogs:
 * - initial focus on the first focusable element
 * - Tab/Shift+Tab rotates within the dialog
 * - on close, focus returns to the trigger
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T | null>(null);
  const previousFocus = useRef<Element | null>(null);

  useEffect(() => {
    if (!active) return;
    previousFocus.current = document.activeElement;
    const root = ref.current;
    if (!root) return;

    const focusables = () => Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
    const first = focusables()[0] ?? root;
    first.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const idx = list.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && (idx <= 0)) {
        e.preventDefault();
        const last = list[list.length - 1];
        last?.focus();
      } else if (!e.shiftKey && (idx === -1 || idx === list.length - 1)) {
        e.preventDefault();
        list[0]?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const prev = previousFocus.current as HTMLElement | null;
      if (prev && typeof prev.focus === 'function') prev.focus({ preventScroll: true });
    };
  }, [active]);

  return ref;
}
