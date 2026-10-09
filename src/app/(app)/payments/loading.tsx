import { Skeleton } from "@/components/ui/skeleton";

/** Squelette affiché pendant le chargement d'une page de l'application. */
export default function Loading() {
  return (
    <main
      className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-10"
      aria-busy="true"
      aria-label="Chargement"
    >
      <Skeleton className="h-9 w-64 max-w-full" />
      <Skeleton className="mt-3 h-4 w-40" />
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="mt-6 h-72 rounded-xl" />
    </main>
  );
}
