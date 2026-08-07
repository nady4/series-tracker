"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function TopbarNav() {
  const pathname = usePathname();

  return (
    <nav className="topbar-nav">
      <Link href="/" aria-current={pathname === "/" ? "page" : undefined}>
        Dashboard
      </Link>
      <Link href="/settings" aria-current={pathname.startsWith("/settings") ? "page" : undefined}>
        Settings
      </Link>
    </nav>
  );
}
