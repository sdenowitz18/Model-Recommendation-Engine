/**
 * BrandFooter — replaces the "Powered by Transcend Education" footer with a
 * brand-aligned strip: the dashed teal swoop motif from marketing materials,
 * a small navy mark, and the same byline.
 */
export default function BrandFooter() {
  return (
    <footer className="relative border-t border-border py-6 overflow-hidden">
      {/* dashed teal swoop motif (decorative) */}
      <svg
        aria-hidden="true"
        viewBox="0 0 1200 60"
        preserveAspectRatio="none"
        className="absolute inset-x-0 bottom-0 h-10 w-full opacity-40 pointer-events-none"
      >
        <path
          d="M0,30 C200,10 400,50 600,30 C800,10 1000,50 1200,30"
          fill="none"
          stroke="#5BC3B4"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
      </svg>
      <p className="relative text-center text-[11px] font-display font-bold uppercase tracking-[0.18em] text-muted-foreground">
        Powered by Transcend Education
      </p>
    </footer>
  );
}
