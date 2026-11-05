/** Знак атласа: силуэт человека, вписанный в круг-линзу. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="15" fill="var(--c-ink)" />
      <circle cx="16" cy="9.2" r="3" fill="var(--c-stone)" />
      <path
        d="M16 13.4c-2.6 0-4.4 1-4.4 3.2v4.2h1.9l.6 6.1h3.8l.6-6.1h1.9v-4.2c0-2.2-1.8-3.2-4.4-3.2Z"
        fill="var(--c-stone)"
      />
      <circle cx="17.3" cy="16.9" r="1.35" fill="var(--color-sys-circulatory)" />
    </svg>
  );
}
