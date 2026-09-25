import type { AnchorHTMLAttributes, ReactNode } from "react";

type SectionLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: `#${string}`;
  children: ReactNode;
};

export function SectionLink({ href, children, ...props }: SectionLinkProps) {
  return (
    <a href={href} {...props}>
      {children}
    </a>
  );
}
