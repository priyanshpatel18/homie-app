import Link from "next/link";

export function BlogFooter() {
  return (
    <footer className="relative z-10 mt-auto">
      <div className="mx-auto w-full max-w-[1280px] border-t border-white/10 px-5 py-8 sm:px-8">
        <div className="flex flex-col items-center justify-between gap-4 text-xs text-white/45 sm:flex-row">
          <p>© {new Date().getFullYear()} HeyHomieAI</p>
          <div className="flex items-center gap-5">
            <Link href="/" className="hh-link hover:text-white">
              Home
            </Link>
            <Link href="/blog" className="hh-link hover:text-white">
              Blog
            </Link>
            <Link href="/chat" className="hh-link hover:text-white">
              Ask
            </Link>
            <a
              href="https://x.com/HeyHomieAI"
              target="_blank"
              rel="noreferrer"
              className="hh-link hover:text-white"
            >
              @HeyHomieAI
            </a>
            <a
              href="https://www.linkedin.com/company/heyhomieai/"
              target="_blank"
              rel="noreferrer"
              className="hh-link hover:text-white"
            >
              LinkedIn
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
