"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignedIn, UserButton } from "@clerk/nextjs";

// Global navigation, shown everywhere except the public landing/auth pages.
const HIDDEN_PATHS = ["/", "/signup", "/login"];

export function SiteHeader() {
  const path = usePathname();
  const hidden = HIDDEN_PATHS.some(
    (p) => path === p || (p !== "/" && path.startsWith(p + "/"))
  );
  if (hidden) return null;

  return (
    <header className="border-b border-ink/10 bg-cream">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-coral text-lg font-black text-white">
            L
          </span>
          <span className="text-lg font-bold">Listero</span>
        </Link>
        <nav className="flex items-center gap-5 text-sm font-semibold">
          <Link href="/dashboard" className="transition hover:text-coral">
            Dashboard
          </Link>
          <Link href="/settings" className="transition hover:text-coral">
            Settings
          </Link>
          <SignedIn>
            <UserButton />
          </SignedIn>
        </nav>
      </div>
    </header>
  );
}
