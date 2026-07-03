import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Combine Tailwind class names, deduping conflicts. */
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}
