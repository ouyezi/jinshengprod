export function roundScore(value: number): number {
  return Math.round(value * 100) / 100
}

export function calculateScores(scores: (number | null)[]) {
  if (scores.some((s) => s === null)) {
    return { avgValues: null, avgCapability: null, avgOutput: null, finalScore: null }
  }
  const s = scores as number[]
  const avgValues = roundScore((s[0] + s[1] + s[2]) / 3)
  const avgCapability = roundScore(s.slice(3, 10).reduce((a, b) => a + b, 0) / 7)
  const avgOutput = roundScore((s[10] + s[11]) / 2)
  const finalScore = roundScore(avgValues * 0.2 + avgCapability * 0.4 + avgOutput * 0.4)
  return { avgValues, avgCapability, avgOutput, finalScore }
}

export function suggestResult(finalScore: number): { sys: string; result: string | null } {
  if (finalScore <= 2) return { sys: '不通过', result: '不通过晋升' }
  if (finalScore >= 4) return { sys: '通过', result: '通过晋升' }
  return { sys: '评委自选', result: null }
}
