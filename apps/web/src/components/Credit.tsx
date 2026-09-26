// Global attribution shown at the bottom of every app page.
// Theme-aware (uses --color-text / --color-text-muted vars) so it reads in
// both light and dark. Kept subtle and non-interactive.
export default function Credit({ className = '' }: { className?: string }) {
  return (
    <footer className={`w-full text-center text-xs text-text-muted py-4 px-4 ${className}`}>
      Developed by{' '}
      <span className="font-medium text-text">Dr. Mohamed Sabek</span>{' '}
      at the IHT Lab, University of Alberta
    </footer>
  );
}
