import Link from "next/link";
import { AuthCta } from "./AuthCta";

export function SiteNav() {
  return (
    <nav
      aria-label="Main"
      className="flex items-center justify-between px-4 py-6 sm:px-8 lg:px-12"
    >
      <Link href="/" className="text-xl font-bold tracking-tight text-foreground">
        KPI<span className="text-primary">·</span>FIT
      </Link>
      <AuthCta variant="nav" />
    </nav>
  );
}
