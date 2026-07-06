import { describe, it, expect } from 'vitest'
import { cn } from '../lib/cn'

describe('cn utility', () => {
  it('merges class names and drops falsy values', () => {
    expect(cn('a', false && 'b', 'c')).toBe('a c')
    expect(cn('px-2', 'px-4')).toContain('px-')
  })
})
