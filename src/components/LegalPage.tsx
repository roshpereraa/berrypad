export function LegalPage({
  title,
  sections,
}: {
  title: string
  sections: readonly (readonly [string, string])[]
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <div className="glass mt-5 border-amber-400/25 p-4 text-xs text-amber-200/90">
        This is a plain-language description of how Berrypad operates, written to be accurate
        rather than to serve as a legal instrument. It has not been reviewed by a lawyer and should
        be before the product is relied on commercially.
      </div>
      <div className="glass mt-4 divide-y divide-white/10 p-6">
        {sections.map(([heading, body]) => (
          <section key={heading} className="py-4 first:pt-0 last:pb-0">
            <h2 className="text-sm font-semibold">{heading}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-muted)]">{body}</p>
          </section>
        ))}
      </div>
    </div>
  )
}
