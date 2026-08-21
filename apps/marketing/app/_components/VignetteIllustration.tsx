const shared = {
  fill: "none",
  stroke: "#211d16",
  strokeWidth: 4.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function ReadingChair() {
  return (
    <svg viewBox="0 0 100 100" {...shared}>
      <path d="M20 80 h60" />
      <path d="M28 80 v-24 a22 22 0 0 1 44 0 v24" />
      <circle cx={50} cy={42} r={14} />
      <circle cx={45} cy={40} r={1.6} fill="#211d16" stroke="none" />
      <circle cx={55} cy={40} r={1.6} fill="#211d16" stroke="none" />
      <path d="M44 46 q6 6 12 0" />
    </svg>
  );
}

function CorrectedPage() {
  return (
    <svg viewBox="0 0 100 100" {...shared}>
      <rect x={30} y={18} width={40} height={56} rx={6} />
      <path d="M40 32 h20 M40 42 h20 M40 52 h12" strokeWidth={3} />
      <path d="M22 82 q28 -14 56 0" />
    </svg>
  );
}

function MorningCoffee() {
  return (
    <svg viewBox="0 0 100 100" {...shared}>
      <path d="M22 60 h56 l-6 26 a8 8 0 0 1 -8 6 H36 a8 8 0 0 1 -8 -6 Z" />
      <path d="M78 66 h10 a10 10 0 0 1 0 20 h-8" />
      <path d="M34 44 q6 -8 0 -16 M50 44 q6 -8 0 -16 M66 44 q6 -8 0 -16" />
    </svg>
  );
}

const vignetteArt = [ReadingChair, CorrectedPage, MorningCoffee];

export function VignetteIllustration({ index }: { index: number }) {
  const Art = vignetteArt[index % vignetteArt.length];
  return <Art />;
}
