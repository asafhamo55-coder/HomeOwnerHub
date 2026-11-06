/**
 * The printed letterhead: the full-colour HomeownerHub logo, about 40px tall,
 * top-left, with the association name beside it. `print-color-adjust: exact`
 * makes the browser print the logo in colour (it drops backgrounds and may
 * flatten images by default). The name is black on white so the body of the
 * page stays plain for printing and accessibility.
 */
export function Letterhead({ name, className = '' }: { name?: string | null; className?: string }) {
  return (
    <div
      data-letterhead
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 [-webkit-print-color-adjust:exact] [print-color-adjust:exact] ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG that must print at a fixed size */}
      <img src="/brand-site/logo-full.svg" alt="HomeownerHub" width={238} height={40} className="h-10 w-auto max-w-full" />
      {name ? <span className="text-base font-semibold text-black">{name}</span> : null}
    </div>
  )
}
