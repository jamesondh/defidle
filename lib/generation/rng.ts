/**
 * Deterministic RNG Utilities
 * 
 * Provides stable, reproducible random number generation
 * for deterministic episode generation.
 */

/**
 * FNV-1a 32-bit hash function - fast and produces good distribution
 */
function fnv1a32(str: string): number {
  let hash = 2166136261 // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    // FNV prime - using multiplication that works well in JS
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0 // Convert to unsigned 32-bit
}

/**
 * Create a stable 64-bit-ish hash from a string
 * Combines two FNV-1a hashes for better distribution
 */
export function stableHash64(input: string): number {
  const hash1 = fnv1a32(input)
  const hash2 = fnv1a32(input + "\x00") // Different input for second hash
  // Combine into a positive number in safe integer range
  return (hash1 * 0x100000000 + hash2) % Number.MAX_SAFE_INTEGER
}

/**
 * Create a seed from multiple string parts
 * Joins parts with pipe separator for consistent hashing
 */
export function seedFromParts(...parts: string[]): number {
  const input = parts.join("|")
  return stableHash64(input)
}

/**
 * Mulberry32 PRNG - simple, fast, deterministic
 * Returns a function that produces values in [0, 1)
 */
export function createRng(seed: number): () => number {
  let state = seed >>> 0 // Ensure unsigned 32-bit

  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Get a random integer in range [min, max] (inclusive)
 */
export function randomInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min
}

/**
 * Pick a random element from an array
 */
export function randomPick<T>(rng: () => number, items: T[]): T | undefined {
  if (items.length === 0) return undefined
  return items[Math.floor(rng() * items.length)]
}

/**
 * Deterministic shuffle using Fisher-Yates with seeded RNG
 */
export function deterministicShuffle<T>(
  items: T[],
  ...seedParts: string[]
): T[] {
  const seed = seedFromParts(...seedParts)
  const rng = createRng(seed)
  const result = [...items]

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }

  return result
}

/**
 * Weighted random selection
 * Returns the index of the selected item
 */
export function weightedRandomIndex(
  rng: () => number,
  weights: number[]
): number {
  const total = weights.reduce((sum, w) => sum + w, 0)
  if (total <= 0) return 0

  let threshold = rng() * total
  for (let i = 0; i < weights.length; i++) {
    threshold -= weights[i]
    if (threshold <= 0) return i
  }

  return weights.length - 1
}

/**
 * Weighted random pick from array
 * Each item needs an associated weight
 */
export function weightedRandomPick<T>(
  items: T[],
  weights: number[],
  rng: () => number
): T | undefined {
  if (items.length === 0 || weights.length === 0) return undefined
  const index = weightedRandomIndex(rng, weights)
  return items[index]
}

/**
 * Get N unique random items from array without replacement
 */
export function randomSample<T>(
  rng: () => number,
  items: T[],
  count: number
): T[] {
  const available = [...items]
  const result: T[] = []

  const n = Math.min(count, available.length)
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(rng() * available.length)
    result.push(available[idx])
    // Remove selected item efficiently by swapping with last
    available[idx] = available[available.length - 1]
    available.pop()
  }

  return result
}
