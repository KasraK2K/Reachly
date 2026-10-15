import { cn } from "@/lib/utils"

/** Reachly mark: rounded indigo square with a "send" arrow. Same shape as the extension icon. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-6 shrink-0", className)}>
      <defs>
        <linearGradient id="reachly-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4f46e5" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="7" fill="url(#reachly-g)" />
      <path d="M10 8.5 24 16 10 23.5l2.6-7.5z" fill="#fff" />
    </svg>
  )
}
