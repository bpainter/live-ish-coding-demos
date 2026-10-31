"use client";

import { useEffect, useRef, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from "react";
import type { NavGroup } from "../../lib/nav";

/** The drawer's id: every window renders one dialog, and every trigger names it. */
export const NAV_ID = "deck-nav";

/** True while the drawer is open in this window; the stage ignores every key then. */
export function isNavOpen(): boolean {
  if (typeof document === "undefined") return false;
  const el = document.getElementById(NAV_ID);
  return el instanceof HTMLDialogElement && el.open;
}

function dialog(): HTMLDialogElement | null {
  const el = document.getElementById(NAV_ID);
  return el instanceof HTMLDialogElement ? el : null;
}

/** Invoker commands (`commandfor`, `command`): Chrome 135, Safari 26.2, Firefox 144. */
function hasInvokers(): boolean {
  return typeof HTMLButtonElement !== "undefined" && "command" in HTMLButtonElement.prototype;
}

/** `closedby="any"` closes on a backdrop click: Chrome 134, Firefox 141. */
function hasClosedBy(): boolean {
  return typeof HTMLDialogElement !== "undefined" && "closedBy" in HTMLDialogElement.prototype;
}

/** The trigger that opened the drawer last; focus returns to it on close (WebKit does not always). */
let opener: HTMLElement | null = null;

function firstLink(d: HTMLDialogElement): HTMLAnchorElement | null {
  return d.querySelector<HTMLAnchorElement>("a.nav-drawer__link");
}

/**
 * The invoker attributes. React 19 passes lowercase unknown attributes through as written; the
 * cast only satisfies the DOM typings, which do not list them yet.
 */
function invoker(command: "show-modal" | "close"): ButtonHTMLAttributes<HTMLButtonElement> {
  return { commandfor: NAV_ID, command } as unknown as ButtonHTMLAttributes<HTMLButtonElement>;
}

interface TriggerProps {
  className: string;
  /** Visible text (the speaker's "Slides"); without it the button is labelled "Sections". */
  children: ReactNode;
  label?: string;
  tabIndex?: number;
}

/**
 * The menu button: an invoker that opens the drawer with `show-modal`, and a
 * click fallback where invoker commands are missing. Any window can hold it; the dialog it names is
 * rendered by that window's stage.
 */
export function NavTrigger({ className, children, label, tabIndex }: TriggerProps) {
  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    opener = e.currentTarget;
    if (hasInvokers()) return;
    const d = dialog();
    if (d && !d.open) {
      d.showModal();
      firstLink(d)?.focus();
    }
  };
  return (
    <button type="button" className={`${className} nav-drawer-trigger`} aria-haspopup="dialog" aria-label={label} tabIndex={tabIndex} onClick={onClick} data-nav-trigger="" {...invoker("show-modal")}>
      {children}
    </button>
  );
}

interface Props {
  groups: NavGroup[];
  /** The link that holds the current slide (lib/nav.ts `navCurrent`). */
  currentId: string | null;
  /** Moves the deck: the shared store in the presenter windows, the router in reader mode. */
  onJump: (slideId: string) => void;
  /** Gives the keyboard back to the stage. */
  focusStage: () => void;
  /**
   * The audience window's keys belong to the clicker: closing there always hands focus to the
   * stage. Elsewhere Escape returns focus to the menu button, as a modal dialog does.
   */
  returnFocusToStage: boolean;
}

/**
 * The navigation drawer. A modal
 * dialog: the rest of the page is inert (the focus trap), Escape closes it, and focus returns to
 * the invoker. PageUp and PageDown, which clickers send, close it without moving the deck. Links
 * are real links to `/s/<id>`; a plain click moves the deck instead and focuses the stage.
 */
export function NavDrawer({ groups, currentId, onJump, focusStage, returnFocusToStage }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const jumped = useRef(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    // The first link takes focus when the dialog opens (the dialog focusing steps honour
    // `autofocus`); `toggle` covers an engine that would focus the close button instead.
    firstLink(d)?.setAttribute("autofocus", "");
    const onToggle = (e: Event) => {
      if ((e as ToggleEvent).newState !== "open") return;
      jumped.current = false;
      if (!d.contains(document.activeElement)) firstLink(d)?.focus();
    };
    const onClose = () => {
      // The dialog has already returned focus to its invoker in Chromium and Firefox; WebKit can
      // leave it on the body, so put it back. The audience stage and a jump take it instead.
      if (jumped.current || returnFocusToStage) focusStage();
      else if (opener?.isConnected && document.activeElement !== opener) opener.focus({ preventScroll: true });
      jumped.current = false;
    };
    // Clicker keys: PageUp and PageDown close the drawer and never reach the stage.
    const onKey = (e: KeyboardEvent) => {
      if (!d.open) return;
      if (e.key === "PageUp" || e.key === "PageDown") {
        e.preventDefault();
        e.stopPropagation();
        d.close();
        return;
      }
      // The modal dialog makes the page inert, but Tab past its last control would leave for the
      // browser's own UI; wrap instead, so Tab stays in the drawer.
      if (e.key === "Tab") {
        const items = [...d.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")];
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (e.shiftKey ? active === first || !d.contains(active) : active === last || !d.contains(active)) {
          e.preventDefault();
          (e.shiftKey ? last : first)?.focus();
        }
      }
    };
    d.addEventListener("toggle", onToggle);
    d.addEventListener("close", onClose);
    window.addEventListener("keydown", onKey, true);
    return () => {
      d.removeEventListener("toggle", onToggle);
      d.removeEventListener("close", onClose);
      window.removeEventListener("keydown", onKey, true);
      if (d.open) d.close();
    };
  }, [focusStage, returnFocusToStage]);

  // `closedby="any"` fallback: a click on the backdrop lands on the dialog itself, outside its box.
  const onDialogClick = (e: MouseEvent<HTMLDialogElement>) => {
    const d = ref.current;
    if (!d || hasClosedBy() || e.target !== d) return;
    const r = d.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) d.close();
  };

  const onLink = (e: MouseEvent<HTMLAnchorElement>, slideId: string) => {
    // Middle click, modifier clicks and new tabs keep the link's own behaviour.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    jumped.current = true;
    ref.current?.close();
    onJump(slideId);
  };

  const onClose = () => {
    if (!hasInvokers()) ref.current?.close();
  };

  return (
    <dialog id={NAV_ID} className="nav-drawer" ref={ref} closedby="any" aria-labelledby="deck-nav-title" onClick={onDialogClick}>
      <header className="nav-drawer__header">
        <h2 id="deck-nav-title" className="nav-drawer__title">
          Sections
        </h2>
        <button type="button" className="nav-drawer__close" onClick={onClose} {...invoker("close")}>
          Close
        </button>
      </header>
      <nav className="nav-drawer__nav" aria-label="Sections">
        <ul className="nav-drawer__list">
          {groups.map((g, i) => {
            const links = g.links.map((l) => (
              <li key={l.slideId}>
                <a className="nav-drawer__link" href={`/s/${l.slideId}`} aria-current={l.slideId === currentId ? "true" : undefined} onClick={(e) => onLink(e, l.slideId)} data-slide-id={l.slideId}>
                  <span className="nav-drawer__label">{l.label}</span>
                  <span className="nav-drawer__num">
                    <span className="visually-hidden">, slide </span>
                    {l.number}
                  </span>
                </a>
              </li>
            ));
            if (g.heading === null) return links;
            const id = `deck-nav-g${i}`;
            return (
              <li key={id} className="nav-drawer__group">
                <p className="nav-drawer__heading" id={id}>
                  {g.heading}
                </p>
                <ul className="nav-drawer__list" aria-labelledby={id}>
                  {links}
                </ul>
              </li>
            );
          })}
        </ul>
      </nav>
    </dialog>
  );
}
