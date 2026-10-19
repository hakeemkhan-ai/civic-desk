import type { SVGProps } from 'react';
export function Charminar({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="M5 58h54M10 58V20h8v38M46 58V20h8v38M8 20h12M44 20h12M9 15h10l-5-7-5 7Zm36 0h10l-5-7-5 7ZM14 8V4m36 4V4M18 30h28M18 38h28M24 58V46q8-14 16 0v12M10 27h8m28 0h8M10 46h8m28 0h8M23 30V20h5v10m8 0V20h5v10M22 20h7l-3.5-5L22 20Zm13 0h7l-3.5-5L35 20Z" />
  </svg>;
}
