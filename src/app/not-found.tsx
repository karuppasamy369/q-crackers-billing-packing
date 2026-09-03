import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-lg font-semibold text-gray-900">Page not found</h1>
        <p className="mt-1 text-sm text-gray-500">
          The page you are looking for does not exist.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
        >
          Go home
        </Link>
      </div>
    </main>
  );
}
