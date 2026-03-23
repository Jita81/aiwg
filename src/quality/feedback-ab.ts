/**
 * Feedback A/B Testing Framework
 *
 * Provides significance testing for comparing feedback strategies
 * using Welch's t-test and Cohen's d effect size calculations.
 *
 * @module quality/feedback-ab
 * @issue #148
 */

// ============================================================================
// Types
// ============================================================================

export interface ABVariant {
  name: string;
  deltas: number[];
}

export interface ABTestResult {
  controlName: string;
  treatmentName: string;
  controlMean: number;
  treatmentMean: number;
  controlStdDev: number;
  treatmentStdDev: number;
  tStatistic: number;
  degreesOfFreedom: number;
  pValue: number;
  significant: boolean;
  alpha: number;
  effectSize: number;
  effectInterpretation: 'negligible' | 'small' | 'medium' | 'large';
  controlN: number;
  treatmentN: number;
}

export interface ABTestConfig {
  alpha?: number;
  minSamples?: number;
}

// ============================================================================
// A/B Testing Engine
// ============================================================================

export function runABTest(
  control: ABVariant,
  treatment: ABVariant,
  config: ABTestConfig = {}
): ABTestResult {
  const alpha = config.alpha ?? 0.05;
  const minSamples = config.minSamples ?? 10;

  if (control.deltas.length < minSamples || treatment.deltas.length < minSamples) {
    throw new Error(
      `Insufficient samples: control=${control.deltas.length}, treatment=${treatment.deltas.length}, minimum=${minSamples}`
    );
  }

  const controlMean = mean(control.deltas);
  const treatmentMean = mean(treatment.deltas);
  const controlStdDev = stdDev(control.deltas);
  const treatmentStdDev = stdDev(treatment.deltas);
  const controlN = control.deltas.length;
  const treatmentN = treatment.deltas.length;

  const { tStatistic, degreesOfFreedom } = welchTTest(
    controlMean,
    treatmentMean,
    controlStdDev,
    treatmentStdDev,
    controlN,
    treatmentN
  );

  const pValue = tTestPValue(Math.abs(tStatistic), degreesOfFreedom);

  const pooledStdDev = Math.sqrt(
    ((controlN - 1) * controlStdDev ** 2 + (treatmentN - 1) * treatmentStdDev ** 2) /
      (controlN + treatmentN - 2)
  );
  const effectSize =
    pooledStdDev > 0 ? (treatmentMean - controlMean) / pooledStdDev : 0;

  return {
    controlName: control.name,
    treatmentName: treatment.name,
    controlMean: round(controlMean),
    treatmentMean: round(treatmentMean),
    controlStdDev: round(controlStdDev),
    treatmentStdDev: round(treatmentStdDev),
    tStatistic: round(tStatistic),
    degreesOfFreedom: Math.round(degreesOfFreedom),
    pValue: round(pValue, 4),
    significant: pValue < alpha,
    alpha,
    effectSize: round(effectSize),
    effectInterpretation: interpretEffectSize(Math.abs(effectSize)),
    controlN,
    treatmentN,
  };
}

// ============================================================================
// Statistical Helpers
// ============================================================================

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance =
    values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function welchTTest(
  mean1: number,
  mean2: number,
  sd1: number,
  sd2: number,
  n1: number,
  n2: number
): { tStatistic: number; degreesOfFreedom: number } {
  const se1 = (sd1 ** 2) / n1;
  const se2 = (sd2 ** 2) / n2;
  const seDiff = Math.sqrt(se1 + se2);

  const tStatistic = seDiff > 0 ? (mean1 - mean2) / seDiff : 0;

  const numerator = (se1 + se2) ** 2;
  const denominator =
    (se1 ** 2) / (n1 - 1) + (se2 ** 2) / (n2 - 1);
  const degreesOfFreedom = denominator > 0 ? numerator / denominator : 1;

  return { tStatistic, degreesOfFreedom };
}

export function tTestPValue(tAbs: number, df: number): number {
  if (df > 1000) {
    return 2 * normalCDF(-tAbs);
  }

  const x = df / (df + tAbs ** 2);
  const p = incompleteBeta(x, df / 2, 0.5);
  return Math.min(1, Math.max(0, p));
}

function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const y =
    1.0 -
    ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2);

  return 0.5 * (1.0 + sign * y);
}

function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const lnBeta = lnGamma(a) + lnGamma(b) - lnGamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta) / a;

  let f = 1;
  let c = 1;
  let d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  f = d;

  for (let m = 1; m <= 200; m++) {
    let numerator = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 + numerator * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + numerator / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    f *= c * d;

    numerator = -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + numerator * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + numerator / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;

    const delta = c * d;
    f *= delta;

    if (Math.abs(delta - 1.0) < 1e-10) break;
  }

  return front * f;
}

function lnGamma(z: number): number {
  if (z <= 0) return 0;
  const g = 7;
  const c = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];

  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  }

  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) {
    x += c[i] / (z + i);
  }

  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

export function interpretEffectSize(
  d: number
): 'negligible' | 'small' | 'medium' | 'large' {
  const absD = Math.abs(d);
  if (absD < 0.2) return 'negligible';
  if (absD < 0.5) return 'small';
  if (absD < 0.8) return 'medium';
  return 'large';
}

function round(value: number, decimals: number = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
