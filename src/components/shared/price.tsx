import type { AppLocale } from "@/i18n/routing";
import { formatCurrency } from "@/lib/utils/format-currency";

type PriceProps = {
  amountInCents: number;
  currency: string;
  locale: AppLocale;
  className?: string;
};

export function Price({
  amountInCents,
  currency,
  locale,
  className = "",
}: PriceProps) {
  return (
    <data
      className={className}
      value={(amountInCents / 100).toFixed(2)}
      aria-label={formatCurrency(amountInCents, currency, locale)}
    >
      {formatCurrency(amountInCents, currency, locale)}
    </data>
  );
}
