export function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" focusable="false" aria-hidden="true">
      <path
        className="brand-mark-trail"
        d="M25 8H13.4C10.4 8 8 10.1 8 12.75s2.4 4.75 5.4 4.75h5.2c3 0 5.4 2.1 5.4 4.75s-2.4 4.75-5.4 4.75H7"
      />
      <g className="brand-mark-ticks">
        <path d="M19 5.3v5.4" />
        <path d="M11 24.3v5.4" />
      </g>
      <path className="brand-mark-tick-current" d="M16 14.6v5.8" />
      <circle className="brand-mark-node brand-mark-node-start" cx="25" cy="8" r="2.15" />
      <circle className="brand-mark-node brand-mark-node-end" cx="7" cy="27" r="2.15" />
    </svg>
  );
}
