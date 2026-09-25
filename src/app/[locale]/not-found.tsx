import { Link } from "@/i18n/navigation";

export default function NotFound() {
  return (
    <main className="bg-background grid min-h-screen place-items-center px-6 text-center">
      <div>
        <p className="text-accent text-sm font-semibold tracking-[0.2em]">
          404
        </p>
        <h1 className="mt-4 font-serif text-5xl">Page introuvable</h1>
        <Link
          className="mt-8 inline-block underline underline-offset-4"
          href="/"
        >
          Retour à LUMIZA
        </Link>
      </div>
    </main>
  );
}
