"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell, Building2, CalendarDays, Check, ClipboardList, Clock, Ellipsis, Gauge, LayoutGrid, LogOut, PackageOpen,
  ScanLine, ScrollText, Search, ShieldAlert, ShieldCheck, Users, Wallet, type LucideIcon,
} from "lucide-react";
import type { AppArea } from "@/lib/domain/access";
import { Avatar } from "../avatar";
import { Wordmark } from "../brand";

export const NAV_ICONS = {
  grid: LayoutGrid, search: Search, calendar: CalendarDays, wallet: Wallet, bell: Bell, clipboard: ClipboardList,
  handover: PackageOpen, building: Building2, gauge: Gauge, shield: ShieldAlert, check: Check, users: Users,
  scroll: ScrollText, clock: Clock, verified: ShieldCheck, scan: ScanLine,
} satisfies Record<string, LucideIcon>;
export type NavIcon = keyof typeof NAV_ICONS;

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  count?: number;
}
export interface NavArea {
  area: AppArea;
  label: string;
  subtitle: string;
  items: NavItem[];
}

// Detail pages with no menu entry of their own light up the list they are opened from.
const PARENTS: [prefix: string, href: string][] = [
  ["/owner/bookings/", "/owner/requests"],
  ["/manager/bookings/", "/manager/queue"],
];

const activeHref = (items: NavItem[], path: string) => {
  const parent = PARENTS.find(([prefix]) => path.startsWith(prefix))?.[1];
  if (parent && items.some((i) => i.href === parent)) return parent;
  return items
    .filter((i) => path === i.href || path.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
};

export function SidebarNav({
  areas,
  homeArea,
  person,
  signOut,
}: {
  areas: NavArea[];
  homeArea: AppArea;
  person: { name: string; avatarUrl: string | null };
  signOut: () => Promise<void>;
}) {
  const path = usePathname();
  const segment = path.split("/")[1];
  const current = areas.find((a) => a.area === segment) ?? areas.find((a) => a.area === homeArea) ?? areas[0];
  const active = current ? activeHref(current.items, path) : undefined;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menuOpen]);

  return (
    <>
      <Link href={current ? `/${current.area}` : "/"} className="mb-7 ml-1 w-fit rounded-md" aria-label="ResourCity home">
        <Wordmark dark />
      </Link>

      <div className="flex min-h-14 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.045] px-3 py-2.5">
        <span className="grid size-9 place-items-center rounded-[10px] bg-[#dbe9bf] text-xs font-bold text-pine">DV</span>
        <span className="grid min-w-0">
          <strong className="truncate text-sm font-semibold">Deccan Valley</strong>
          <small className="text-xs text-[#9fb4a6]">{current?.label ?? "Campus"} workspace</small>
        </span>
      </div>

      <p className="mx-2.5 mb-2.5 mt-7 text-[0.6875rem] font-bold tracking-[0.17em] text-[#9fb4a6]">YOUR SPACE</p>
      <nav aria-label="Main navigation" className="grid gap-1">
        {current?.items.map((item) => {
          const Icon = NAV_ICONS[item.icon];
          const isActive = item.href === active;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className="group flex min-h-11 items-center gap-3 rounded-[10px] border border-transparent px-3 text-sm font-medium text-[#c3d0c6] transition hover:translate-x-0.5 hover:bg-white/[0.075] hover:text-white aria-[current=page]:border-leaf/15 aria-[current=page]:bg-leaf/10 aria-[current=page]:text-[#e4f4c6]"
            >
              <Icon aria-hidden className="size-[18px] text-[#a6baac] group-aria-[current=page]:text-leaf" />
              <span>{item.label}</span>
              {!!item.count && (
                <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-lg bg-leaf/15 px-1.5 text-xs font-semibold text-[#d6f1a4]">
                  <span className="sr-only">, </span>
                  {item.count > 99 ? "99+" : item.count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="relative mt-6 flex flex-1 flex-col justify-end">
        <div className="relative mx-1 mb-4 min-h-28 overflow-hidden rounded-xl bg-[#224b3d] p-4 [@media(max-height:780px)]:hidden">
          <p className="relative z-10 grid gap-2">
            <strong className="font-serif text-xl font-normal leading-none text-[#f3f2e6]">
              Good things
              <br />
              go further.
            </strong>
            <span className="max-w-40 text-xs leading-relaxed text-[#c3d0c6]">Borrow with care. Return it ready for the next person.</span>
          </p>
          <span aria-hidden className="absolute -bottom-6 -right-2 h-20 w-16 rotate-[-30deg] rounded-[100%_0_100%_0] border border-leaf/20" />
          <span aria-hidden className="absolute -bottom-8 right-9 h-20 w-16 rotate-[26deg] scale-75 rounded-[100%_0_100%_0] border border-leaf/20" />
        </div>

        <div ref={menuRef} className="relative">
          {menuOpen && (
            <div
              role="menu"
              aria-label="Switch workspace"
              className="pop-in absolute inset-x-0 bottom-[calc(100%+8px)] z-30 rounded-xl border border-white/10 bg-[#183f34] p-2 shadow-[0_18px_44px_rgba(0,26,21,0.35)]"
            >
              <p className="mx-2 mb-1.5 mt-1 text-[0.6875rem] font-bold tracking-[0.15em] text-[#9fb4a6]">SWITCH WORKSPACE</p>
              {areas.map((a) => (
                <Link
                  key={a.area}
                  role="menuitem"
                  href={`/${a.area}`}
                  onClick={() => setMenuOpen(false)}
                  aria-current={a.area === current?.area ? "true" : undefined}
                  className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-2.5 text-sm text-[#f1f3ea] hover:bg-leaf/10 aria-[current=true]:bg-leaf/10"
                >
                  {a.label}
                  <span className="truncate text-xs text-[#9fb4a6]">{a.subtitle}</span>
                </Link>
              ))}
              <form action={signOut} className="mt-1 border-t border-white/10 pt-1">
                <button role="menuitem" type="submit" className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2.5 text-left text-sm text-[#f1f3ea] hover:bg-white/5">
                  <LogOut aria-hidden className="size-4" /> Sign out
                </button>
              </form>
            </div>
          )}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex w-full items-center gap-3 border-t border-white/10 px-2 pb-1 pt-3 text-left hover:bg-white/[0.04]"
          >
            <Avatar name={person.name} src={person.avatarUrl} />
            <span className="grid min-w-0">
              <strong className="truncate text-sm font-semibold">{person.name}</strong>
              <small className="truncate text-xs text-[#9fb4a6]">{current?.subtitle}</small>
            </span>
            <Ellipsis aria-hidden className="ml-auto size-5 text-[#adc1b3]" />
            <span className="sr-only">Switch workspace or sign out</span>
          </button>
        </div>
        <p className="mx-2 mt-2 font-serif text-sm italic text-[#9fb4a6]">A little more shared, a lot more possible.</p>
      </div>
    </>
  );
}
