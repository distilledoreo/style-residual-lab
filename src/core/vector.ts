const EPSILON = 1e-12;

function assertSameLength(a: number[], b: number[]): void {
  if (a.length !== b.length) throw new Error(`Vector length mismatch: ${a.length} !== ${b.length}`);
}

export function dot(a: number[], b: number[]): number {
  assertSameLength(a, b);
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

export function norm(a: number[]): number {
  return Math.sqrt(dot(a, a));
}

export function normalize(a: number[]): number[] {
  const n = norm(a);
  if (n < EPSILON) return a.map(() => 0);
  return a.map((value) => value / n);
}

export function add(a: number[], b: number[]): number[] {
  assertSameLength(a, b);
  return a.map((value, index) => value + b[index]);
}

export function subtract(a: number[], b: number[]): number[] {
  assertSameLength(a, b);
  return a.map((value, index) => value - b[index]);
}

export function scale(a: number[], scalar: number): number[] {
  return a.map((value) => value * scalar);
}

export function cosine(a: number[], b: number[]): number {
  const denom = norm(a) * norm(b);
  if (denom < EPSILON) return 0;
  return dot(a, b) / denom;
}

export function meanVector(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  const width = vectors[0].length;
  const total = new Array(width).fill(0);
  for (const vector of vectors) {
    if (vector.length !== width) throw new Error("Cannot average vectors with different lengths");
    for (let i = 0; i < width; i += 1) total[i] += vector[i];
  }
  return total.map((value) => value / vectors.length);
}

export function orthonormalize(vectors: number[][]): number[][] {
  const basis: number[][] = [];
  for (const vector of vectors) {
    let candidate = [...vector];
    for (const basisVector of basis) {
      candidate = subtract(candidate, scale(basisVector, dot(candidate, basisVector)));
    }
    const n = norm(candidate);
    if (n >= EPSILON) basis.push(scale(candidate, 1 / n));
  }
  return basis;
}

export function projectOntoBasis(vector: number[], basis: number[][]): number[] {
  if (basis.length === 0) return vector.map(() => 0);
  return basis.reduce((projection, basisVector) => add(projection, scale(basisVector, dot(vector, basisVector))), new Array(vector.length).fill(0));
}

export function residualize(vector: number[], contentVectors: number[][]): number[] {
  const basis = orthonormalize(contentVectors.map(normalize));
  const projection = projectOntoBasis(vector, basis);
  return normalize(subtract(vector, projection));
}
