import type { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "neutral" | "dark";
};

export function Button({
  className = "",
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) {
  const variantClass =
    variant === "primary"
      ? "bg-primary text-primary-foreground hover:brightness-95"
      : variant === "dark"
        ? "bg-offer-ink text-white hover:bg-black"
        : "bg-offer-button text-offer-ink hover:bg-offer-button-hover";

  return (
    <button
      className={`inline-flex min-h-12 items-center justify-center rounded-full px-6 py-3 text-sm font-bold transition-all focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-100 ${variantClass} ${className}`}
      type={type}
      {...props}
    />
  );
}
