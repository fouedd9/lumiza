import type { ProductPack } from "@/features/product/types/product";
import type { AppLocale } from "@/i18n/routing";
import { Price } from "@/components/shared/price";
import { getPackSavingsInCents } from "@/features/product/data/pricing";

type OfferCardProps = {
  pack: ProductPack;
  locale: AppLocale;
  lampLabel: string;
  soloNote: string;
  selectLabel: string;
  professionalLabel: string;
  savingsLabel: string;
  soloPriceInCents: number;
};

export function OfferCard({
  pack,
  locale,
  lampLabel,
  soloNote,
  selectLabel,
  professionalLabel,
  savingsLabel,
  soloPriceInCents,
}: OfferCardProps) {
  const isProfessional = pack.id === "pro";
  const savingsInCents = getPackSavingsInCents(pack, soloPriceInCents);

  return (
    <article
      className={`group flex min-h-[25rem] flex-col justify-between rounded-[1.75rem] border p-7 transition-transform duration-300 hover:-translate-y-1 sm:p-8 ${
        isProfessional
          ? "border-accent bg-accent text-accent-foreground"
          : "border-offer-border bg-offer-surface text-white"
      }`}
    >
      <div>
        <div className="mb-10 flex min-h-7 items-center justify-between gap-3">
          <p className="text-xs font-bold tracking-[0.18em] uppercase">
            {pack.label}
          </p>
          {isProfessional ? (
            <span className="bg-offer-ink rounded-full px-3 py-1 text-[0.68rem] font-bold tracking-wide text-white uppercase">
              {professionalLabel}
            </span>
          ) : null}
        </div>
        <h3 className="font-display text-3xl font-extrabold tracking-[-0.04em]">
          {pack.quantity} × {lampLabel}
        </h3>
        <Price
          amountInCents={pack.priceInCents}
          currency={pack.currency}
          locale={locale}
          className="font-display mt-5 block text-5xl font-extrabold tracking-[-0.06em]"
        />
        {savingsInCents > 0 ? (
          <p className="mt-3 text-sm font-semibold">
            {savingsLabel}{" "}
            <Price
              amountInCents={savingsInCents}
              currency={pack.currency}
              locale={locale}
            />
          </p>
        ) : (
          <p className="mt-3 text-sm opacity-70">{soloNote}</p>
        )}
      </div>
      <a
        href="#cart"
        className={`mt-10 inline-flex min-h-11 w-full items-center justify-center rounded-full px-5 font-bold ${isProfessional ? "bg-offer-ink text-white" : "text-offer-ink bg-white"}`}
      >
        {selectLabel}
      </a>
    </article>
  );
}
