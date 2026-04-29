import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center bg-black px-5 py-16 text-white">
      <div className="w-full max-w-md text-center">
        <p className="text-sm font-medium text-white/60">404</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-2 text-sm leading-6 text-white/60">
          This page does not exist. Go back home to meet Homie.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-2xl bg-white/10 px-4 text-sm font-medium ring-1 ring-white/10 transition hover:bg-white/15"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}