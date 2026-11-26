import Link from "next/link";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/calendar", label: "Calendar" },
  { href: "/settings", label: "Settings" },
] as const;

export function Nav({ active }: { active: (typeof LINKS)[number]["href"] }) {
  return (
    <nav className="nav" aria-label="Main">
      <span className="brand">CEDT Hub</span>
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={l.href === active ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
