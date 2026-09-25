import { LegalPage, legalMetadata } from "@/components/legal/legal-page";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  return legalMetadata((await params).locale, "terms");
}
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  return <LegalPage locale={(await params).locale} kind="terms" />;
}
