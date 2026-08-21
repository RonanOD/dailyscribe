export function HeroIllustration() {
  return (
    <svg
      viewBox="0 0 420 460"
      fill="none"
      stroke="#211d16"
      strokeWidth={5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x={52} y={26} width={220} height={330} rx={20} />
      <rect x={72} y={52} width={180} height={272} rx={8} strokeWidth={3.5} />
      <line x1={92} y1={96} x2={232} y2={96} strokeWidth={2.5} />
      <line x1={92} y1={126} x2={232} y2={126} strokeWidth={2.5} />
      <line x1={92} y1={156} x2={200} y2={156} strokeWidth={2.5} />
      <path d="M110 200 q18 -22 36 0 q18 22 36 0" strokeWidth={2.5} />
      <circle cx={162} cy={342} r={5} strokeWidth={3} />
      <rect x={292} y={52} width={20} height={240} rx={10} />
      <line x1={292} y1={270} x2={312} y2={270} strokeWidth={3} />
      <path d="M292 286 L312 286 L302 316 Z" />
      <g>
        <path
          d="M74 400 h130 l-10 46 a14 14 0 0 1 -14 12 h-92 a14 14 0 0 1 -14 -12 Z"
          strokeWidth={4}
        />
        <path d="M204 408 h20 a18 18 0 0 1 0 36 h-14" strokeWidth={4} />
        <path d="M96 372 q6 -14 0 -26" strokeWidth={3} />
        <path d="M120 372 q6 -14 0 -26" strokeWidth={3} />
        <path d="M144 372 q6 -14 0 -26" strokeWidth={3} />
      </g>
    </svg>
  );
}
