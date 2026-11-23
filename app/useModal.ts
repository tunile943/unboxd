"use client";

import { useEffect, useRef } from "react";

/** Safari has no closedby yet: close on a click that lands outside the dialog's box. */
export function lightDismissFallback(e: React.MouseEvent<HTMLDialogElement>) {
  const dlg = e.currentTarget;
  if ("closedBy" in HTMLDialogElement.prototype || e.target !== dlg) return;
  const r = dlg.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dlg.close();
}

/** Props for a <dialog> that opens as a modal on mount, and again whenever `returnTo` or `content` changes (a parent
 *  may reuse it while it's still closing). `onClosed` waits for the exit transition, so the parent can unmount it. */
export function useModal(onClosed: () => void, returnTo: HTMLElement | null, content?: unknown) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dlg = ref.current!;
    if (!dlg.open) dlg.showModal();
    return () => returnTo?.focus();
  }, [returnTo, content]);

  const onClose = async (e: React.SyntheticEvent<HTMLDialogElement>) => {
    const dlg = e.currentTarget;
    const exits = dlg.getAnimations({ subtree: true })
      .filter((a) => a instanceof CSSTransition && (a.effect as KeyframeEffect | null)?.target === dlg);
    await Promise.allSettled(exits.map((a) => a.finished));
    if (!dlg.open) onClosed(); // reopened meanwhile: keep it
  };

  return { ref, closedby: "any" as const, onClose, onClick: lightDismissFallback };
}
