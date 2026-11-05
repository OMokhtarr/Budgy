import type { ReactNode } from 'react';

interface Slice {
  value: number;
  color: string;
}

interface Props {
  slices: Slice[];
  size?: number;
  thickness?: number;
  children?: ReactNode;
}

/** Plain-SVG donut chart. Center content is rendered as HTML on top. */
export default function Donut({ slices, size = 170, thickness = 16, children }: Props) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  // A slice can be negative (more came back from a debt than was sent): it just isn't drawn.
  const drawn = slices.filter((s) => s.value > 0);
  const total = drawn.reduce((s, x) => s + x.value, 0);
  const gap = drawn.length > 1 ? 3 : 0;

  let offset = 0;
  return (
    <div style={{ position: 'relative', width: size, maxWidth: '100%', aspectRatio: '1' }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`} className="b-donut" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--b-track)" strokeWidth={thickness} />
        {total > 0 &&
          drawn.map((s, i) => {
            const len = (s.value / total) * c;
            const el = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={`${Math.max(len - gap, 0.5)} ${c}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: thickness + 4,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
        }}
      >
        {children}
      </div>
    </div>
  );
}
