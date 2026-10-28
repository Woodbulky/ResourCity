"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Bell, BellRing } from "lucide-react";
import { cn } from "cn";

export interface BellItem {
  id: string;
  title: string;
  body: string;
  link: string | null;
  when: string;
  urgent: boolean;
  unread: boolean;
}

export function NotificationBell({
  unread,
  items,
  markAllRead,
}: {
  unread: number;
  items: BellItem[];
  markAllRead: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Notifications, ${unread} unread`}
        className="relative grid size-10 place-items-center rounded-full border border-transparent text-ink-soft transition hover:-translate-y-px hover:border-line hover:bg-paper"
      >
        <Bell aria-hidden className="size-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full border-2 border-cream bg-[#c4513e] px-1 text-[0.625rem] font-bold leading-none text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      <p role="status" aria-live="polite" className="sr-only">
        {unread ? `${unread} unread notifications` : ""}
      </p>

      {open && (
        <section
          role="dialog"
          aria-label="Notifications"
          className="pop-in fixed inset-x-3 top-[68px] z-40 sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+10px)] sm:w-[380px] overflow-hidden rounded-2xl border border-line bg-paper shadow-pop"
        >
          <div className="flex items-center justify-between px-5 pb-3 pt-4">
            <div>
              <p className="eyebrow">Your inbox</p>
              <h3 className="display text-2xl">Notifications</h3>
            </div>
            {unread > 0 && (
              <form action={markAllRead}>
                <button type="submit" className="text-sm font-semibold text-moss hover:underline">Mark all read</button>
              </form>
            )}
          </div>
          {items.length === 0 ? (
            <p className="border-t border-line px-5 py-6 text-sm text-ink-soft">Nothing new. Updates about your bookings land here.</p>
          ) : (
            <ul>
              {items.map((n) => (
                <li key={n.id} className="border-t border-line">
                  <Link
                    href={n.link ?? "/notifications"}
                    onClick={() => setOpen(false)}
                    className={cn("flex gap-3 px-5 py-3 hover:bg-cream", n.unread && "bg-[#f7f9f1]")}
                  >
                    <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", n.urgent ? "bg-danger-bg text-danger-fg" : "bg-sage text-moss")}>
                      {n.urgent ? <BellRing aria-hidden className="size-4" /> : <Bell aria-hidden className="size-4" />}
                    </span>
                    <span className="grid min-w-0 gap-0.5">
                      <strong className="text-sm font-semibold">
                        {n.unread && <span className="sr-only">Unread: </span>}
                        {n.title}
                      </strong>
                      {n.body && <small className="line-clamp-2 text-xs leading-relaxed text-ink-soft">{n.body}</small>}
                      <time className="text-xs text-ink-soft">{n.when}</time>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="flex items-center justify-center gap-2 border-t border-line bg-cream/60 px-5 py-3 text-sm font-semibold text-moss"
          >
            Open notification centre <ArrowRight aria-hidden className="size-4" />
          </Link>
        </section>
      )}
    </div>
  );
}
