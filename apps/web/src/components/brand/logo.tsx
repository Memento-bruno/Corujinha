/* eslint-disable @next/next/no-img-element */
/** Logo do Corujinha: a Sol, a gata do casal que parece uma coruja, com cifrões nos olhos. */
export function Logo({ size = 48, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/logo-sol.svg"
      width={size}
      height={size}
      alt="Corujinha: a Sol com cifrões nos olhos"
      className={className}
      style={{ width: size, height: size, flexShrink: 0 }}
    />
  );
}
