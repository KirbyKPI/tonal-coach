import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FAQ — Common Questions About KPI·FIT Tonal Coach",
  description:
    "Answers about safety, privacy, how the AI works, pricing, and getting started with KPI·FIT Tonal Coach for your Tonal home gym.",
  alternates: { canonical: "/faq" },
  robots: { index: true, follow: true },
};

export default function FaqLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
