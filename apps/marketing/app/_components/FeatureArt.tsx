import type { ReactElement } from "react";

const shared = {
  fill: "none",
  stroke: "#211d16",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Practice() {
  return (
    <svg viewBox="0 0 220 220" {...shared} strokeWidth={5}>
      <rect x={30} y={20} width={140} height={180} rx={8} strokeWidth={4} />
      <path d="M55 55 q10 20 0 36" />
      <path d="M80 50 v50" />
      <path d="M65 70 h30" />
      <path d="M110 55 h35 M110 75 h35 M110 95 h30" strokeWidth={3.5} />
      <path d="M55 130 q10 20 0 36" />
      <path d="M80 125 v50" />
      <path d="M65 145 h30" />
      <circle cx={150} cy={150} r={30} stroke="#8a2a1c" strokeWidth={6} />
      <path d="M138 150 l8 9 l16 -18" stroke="#8a2a1c" strokeWidth={6} />
    </svg>
  );
}

function Play() {
  return (
    <svg viewBox="0 0 220 220" {...shared} strokeWidth={4}>
      <rect x={20} y={20} width={180} height={180} rx={6} strokeWidth={5} />
      <line x1={56} y1={20} x2={56} y2={200} strokeWidth={3} />
      <line x1={92} y1={20} x2={92} y2={200} strokeWidth={3} />
      <line x1={128} y1={20} x2={128} y2={200} strokeWidth={3} />
      <line x1={164} y1={20} x2={164} y2={200} strokeWidth={3} />
      <line x1={20} y1={56} x2={200} y2={56} strokeWidth={3} />
      <line x1={20} y1={92} x2={200} y2={92} strokeWidth={3} />
      <line x1={20} y1={128} x2={200} y2={128} strokeWidth={3} />
      <line x1={20} y1={164} x2={200} y2={164} strokeWidth={3} />
      <rect x={56} y={56} width={36} height={36} fill="#211d16" stroke="none" />
      <rect x={128} y={56} width={36} height={36} fill="#211d16" stroke="none" />
      <rect x={92} y={92} width={36} height={36} fill="#211d16" stroke="none" />
      <rect x={20} y={128} width={36} height={36} fill="#211d16" stroke="none" />
      <rect x={164} y={128} width={36} height={36} fill="#211d16" stroke="none" />
    </svg>
  );
}

function Read() {
  return (
    <svg viewBox="0 0 220 220" {...shared} strokeWidth={5}>
      <rect x={34} y={70} width={150} height={18} rx={3} transform="rotate(-4 34 70)" />
      <rect x={30} y={92} width={158} height={18} rx={3} transform="rotate(-2 30 92)" />
      <rect x={28} y={115} width={164} height={70} rx={4} />
      <line x1={44} y1={134} x2={176} y2={134} strokeWidth={3} />
      <line x1={44} y1={150} x2={176} y2={150} strokeWidth={3} />
      <line x1={44} y1={166} x2={130} y2={166} strokeWidth={3} />
    </svg>
  );
}

function Live() {
  return (
    <svg viewBox="0 0 220 220" {...shared} strokeWidth={5}>
      <path d="M40 110 L110 55 L180 110" />
      <path d="M56 100 v70 h108 v-70" />
      <line x1={94} y1={170} x2={94} y2={128} strokeWidth={4} />
      <line x1={126} y1={170} x2={126} y2={128} strokeWidth={4} />
      <circle cx={150} cy={55} r={16} strokeWidth={4} />
      <path d="M150 30 v10 M172 55 h-10 M164 39 l-7 7" strokeWidth={3.5} />
    </svg>
  );
}

function Health() {
  return (
    <svg viewBox="0 0 220 220" {...shared} strokeWidth={5}>
      <path d="M70 30 v50 a20 20 0 0 0 40 0 v-50" />
      <line x1={90} y1={80} x2={90} y2={190} />
      <path d="M140 30 c-18 0 -18 34 0 50 v110" />
      <path d="M78 30 v30 M90 30 v30 M102 30 v30" strokeWidth={3.5} />
    </svg>
  );
}

const artByFeatureId: Record<string, () => ReactElement> = {
  practice: Practice,
  play: Play,
  read: Read,
  live: Live,
  health: Health,
};

export function FeatureArt({ id }: { id: string }) {
  const Art = artByFeatureId[id];
  if (!Art) return null;
  return <Art />;
}
