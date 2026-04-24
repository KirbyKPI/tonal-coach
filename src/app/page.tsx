import { SiteNav } from "./_components/SiteNav";
import { AuthCta } from "./_components/AuthCta";

import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const ANIM_STYLES = `
  @keyframes float-orb {
    0%, 100% { transform: scale(1) rotate(0deg); opacity: 0.6; }
    33% { transform: scale(1.08) rotate(120deg); opacity: 0.8; }
    66% { transform: scale(0.95) rotate(240deg); opacity: 0.65; }
  }
  @keyframes fade-up {
    from { opacity: 0; transform: translateY(24px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .anim-fade-up {
    animation: fade-up 0.8s ease-out both;
  }
  .anim-delay-1 { animation-delay: 0.1s; }
  .anim-delay-2 { animation-delay: 0.2s; }
  .anim-delay-3 { animation-delay: 0.3s; }

  @media (prefers-reduced-motion: reduce) {
    .anim-fade-up { animation: none; opacity: 1; }
    .orb-animated { animation: none !important; }
  }
`;

export default function HomePage() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <style dangerouslySetInnerHTML={{ __html: ANIM_STYLES }} />

      <SiteNav />

      <main className="relative flex flex-1 flex-col items-center justify-center px-6 text-center">
        {/* Animated orb */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
          <div
            className="orb-animated h-[500px] w-[500px] rounded-full blur-[120px] sm:h-[700px] sm:w-[700px]"
            style={{
              background:
                "conic-gradient(from 0deg, oklch(0.82 0.24 145), oklch(0.90 0.08 150), oklch(0.92 0.05 150), oklch(0.82 0.24 145))",
              animation: "float-orb 20s ease-in-out infinite",
            }}
          />
        </div>

        <div className="relative z-10 mx-auto max-w-3xl">
          <h1
            className="anim-fade-up anim-delay-1 text-4xl font-bold tracking-tight sm:text-5xl lg:text-7xl"
            style={{
              background: "linear-gradient(135deg, oklch(0.82 0.24 145), oklch(0.92 0.05 150))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            AI-powered custom workouts for your Tonal
          </h1>

          <p className="anim-fade-up anim-delay-2 mx-auto mt-8 max-w-lg text-lg leading-relaxed text-muted-foreground sm:text-xl">
            Connect your Tonal account. Tell the AI your goals. Get a personalized program pushed
            directly to your machine every week.
          </p>

          <div className="anim-fade-up anim-delay-3 mt-10">
            <AuthCta variant="hero" />
          </div>
        </div>
      </main>
    </div>
  );
}
