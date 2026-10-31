export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#ffffff] text-[#161616]">
      {/* Utility Bar (Carbon Spec: #f4f4f4, 32px height, 12px caption) */}
      <div className="bg-[#f4f4f4] border-b border-[#e0e0e0] px-6 min-h-8 py-1.5 flex flex-wrap items-center justify-between text-[12px] tracking-[0.32px] text-[#525252]">
        <span>
          ⚠️ AI assistance only. Final quality disposition requires human verification.
        </span>
        <span>
          Hidden solder joints (BGA/QFN voids, head-in-pillow) require X-ray inspection.
        </span>
      </div>

      {/* Top Navigation (Carbon Spec: #ffffff, 48px height, 1px bottom hairline) */}
      <header className="h-12 bg-[#ffffff] border-b border-[#e0e0e0] px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-[14px] tracking-[0.16px] text-[#161616]">
            AOI-Lite Batam
          </span>
          <span className="text-[12px] tracking-[0.32px] text-[#525252] border-l border-[#e0e0e0] pl-3">
            SMT / PCBA Quality Inspection System
          </span>
        </div>
        <div className="text-[12px] tracking-[0.32px] text-[#525252]">
          Model: <span className="text-[#161616] font-semibold">gemma-4-26b-a4b-it</span>
        </div>
      </header>

      {/* Hero Section (Carbon Spec: weight 300 display-md 42px, flat 0px geometry) */}
      <main className="flex-1 max-w-[1584px] w-full mx-auto px-6 py-12">
        <div className="border border-[#e0e0e0] bg-[#ffffff] p-12">
          <p className="text-[14px] tracking-[0.16px] text-[#525252] mb-2">
            Hacktoberfest Hack Day Kota Batam x Batam Innovation Center
          </p>
          <h1 className="text-[42px] font-light leading-[1.2] text-[#161616] max-w-3xl">
            Human-in-the-loop multimodal PCB inspection assistant powered by Gemma 4
          </h1>
          <p className="mt-4 text-[18px] leading-[1.5] text-[#525252] max-w-2xl">
            Convert a PCB photograph into a structured, traceable quality record while keeping final quality disposition with the human inspector.
          </p>
        </div>
      </main>

      {/* Inverted Charcoal Footer (Carbon Spec: #161616) */}
      <footer className="bg-[#161616] text-[#c6c6c6] px-8 py-8 text-[14px] tracking-[0.16px]">
        <div className="max-w-[1584px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <span>AOI-Lite Batam · Open-Source AI Project (MIT License)</span>
          <span>Carbon Design System · Next.js + Supabase + Gemma 4</span>
        </div>
      </footer>
    </div>
  );
}
