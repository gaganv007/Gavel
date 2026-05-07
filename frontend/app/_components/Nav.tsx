"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles, ShieldCheck, ExternalLink, BookOpen } from "lucide-react";

const EXPLORER = process.env.NEXT_PUBLIC_BASESCAN_URL || "https://sepolia.basescan.org";
const CONTRACT = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";
const GITHUB_URL = "https://github.com/gaganv007/Gavel";

// lucide-react removed brand icons in v1; inline GitHub mark
function Github(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.87-1.54-3.87-1.54-.52-1.33-1.27-1.69-1.27-1.69-1.04-.71.08-.69.08-.69 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.24 3.34.95.1-.74.4-1.24.72-1.53-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.62 1.59.23 2.76.11 3.05.74.8 1.18 1.83 1.18 3.09 0 4.42-2.69 5.39-5.25 5.68.41.35.78 1.05.78 2.12 0 1.53-.01 2.76-.01 3.14 0 .31.21.67.8.55C20.21 21.39 23.5 17.07 23.5 12 23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

export function Nav({ children }: { children?: React.ReactNode }) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const isHIW = pathname === "/how-it-works";

  return (
    <header className="border-b border-slate-800/60 backdrop-blur-sm sticky top-0 z-30 bg-slate-950/60">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="bg-gradient-to-br from-amber-400 to-orange-500 p-1.5 rounded-lg group-hover:scale-105 transition">
              <Sparkles className="w-5 h-5 text-slate-900" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold tracking-tight">Gavel</span>
              <span className="text-[10px] uppercase tracking-wider text-amber-400/70 font-mono hidden sm:inline">
                v0.1 · Base Sepolia
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1 text-sm">
            <Link
              href="/"
              className={`px-3 py-1.5 rounded-md transition ${
                isHome
                  ? "text-slate-100 bg-slate-800/60"
                  : "text-slate-400 hover:text-slate-100"
              }`}
            >
              Demo
            </Link>
            <Link
              href="/how-it-works"
              className={`px-3 py-1.5 rounded-md transition flex items-center gap-1.5 ${
                isHIW
                  ? "text-slate-100 bg-slate-800/60"
                  : "text-slate-400 hover:text-slate-100"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              How it works
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-400">
          {children}
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="hover:text-amber-400 transition flex items-center gap-1"
          >
            <Github className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">GitHub</span>
          </a>
          <a
            href={`${EXPLORER}/address/${CONTRACT}`}
            target="_blank"
            rel="noreferrer"
            className="hover:text-amber-400 flex items-center gap-1 transition"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Live on Base</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </header>
  );
}