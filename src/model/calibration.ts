export interface PlattCalibration {
  method: "platt";
  slope: number;
  intercept: number;
  positives: number;
  negatives: number;
  basis: string;
}

interface LabelledScore {
  score: number;
  label: boolean;
}

const MAX_ITERATIONS = 200;
const RIDGE = 1e-6;

/**
 * Platt scaling: fit sigmoid(slope * score + intercept) to labelled decision
 * scores with Newton's method. Uses Platt's smoothed target values so the fit
 * stays finite even when the classes are perfectly separable, which is the
 * normal case for small style corpora.
 */
export function fitPlattCalibration(points: LabelledScore[], basis: string): PlattCalibration | undefined {
  const positives = points.filter((point) => point.label).length;
  const negatives = points.length - positives;
  if (positives < 2 || negatives < 2) return undefined;
  const targetPositive = (positives + 1) / (positives + 2);
  const targetNegative = 1 / (negatives + 2);
  const samples = points.map((point) => ({ score: point.score, target: point.label ? targetPositive : targetNegative }));
  let slope = 1;
  let intercept = 0;
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    let gradSlope = 0;
    let gradIntercept = 0;
    let hSlopeSlope = RIDGE;
    let hSlopeIntercept = 0;
    let hInterceptIntercept = RIDGE;
    for (const sample of samples) {
      const p = sigmoid(slope * sample.score + intercept);
      const error = p - sample.target;
      const weight = Math.max(p * (1 - p), 1e-9);
      gradSlope += error * sample.score;
      gradIntercept += error;
      hSlopeSlope += weight * sample.score * sample.score;
      hSlopeIntercept += weight * sample.score;
      hInterceptIntercept += weight;
    }
    const det = hSlopeSlope * hInterceptIntercept - hSlopeIntercept * hSlopeIntercept;
    if (Math.abs(det) < 1e-12) break;
    const stepSlope = (hInterceptIntercept * gradSlope - hSlopeIntercept * gradIntercept) / det;
    const stepIntercept = (hSlopeSlope * gradIntercept - hSlopeIntercept * gradSlope) / det;
    slope -= stepSlope;
    intercept -= stepIntercept;
    if (Math.abs(stepSlope) < 1e-10 && Math.abs(stepIntercept) < 1e-10) break;
  }
  if (!Number.isFinite(slope) || !Number.isFinite(intercept)) return undefined;
  return { method: "platt", slope, intercept, positives, negatives, basis };
}

export function applyCalibration(calibration: PlattCalibration, score: number): number {
  return sigmoid(calibration.slope * score + calibration.intercept);
}

/**
 * Percentile rank of a score within a sorted-or-unsorted reference
 * distribution, using the midpoint convention for ties. Returns a value in
 * [0, 1], or undefined when the distribution is empty.
 */
export function percentileOfScore(distribution: number[], score: number): number | undefined {
  if (distribution.length === 0) return undefined;
  let below = 0;
  let equal = 0;
  for (const value of distribution) {
    if (value < score) below += 1;
    else if (value === score) equal += 1;
  }
  return (below + equal / 2) / distribution.length;
}

function sigmoid(x: number): number {
  if (x >= 0) {
    const z = Math.exp(-x);
    return 1 / (1 + z);
  }
  const z = Math.exp(x);
  return z / (1 + z);
}
