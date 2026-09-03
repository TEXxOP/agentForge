const highRiskPatterns = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /ignore\s+(the\s+)?system\s+prompt/i,
  /bypass\s+(the\s+)?(policy|guard|approval|limit)/i,
  /refund\s+(all|every)\s+(orders?|payments?)/i,
  /reveal\s+(your\s+)?(prompt|secret|credentials?)/i,
  /act\s+as\s+(an?\s+)?(admin|developer|system)/i,
  /do\s+not\s+(log|audit|record)/i
];

const mediumRiskPatterns = [
  /urgent(?:ly)?\s+(refund|pay|send)/i,
  /override/i,
  /new\s+recipient/i,
  /different\s+(account|upi|card)/i
];

export function analyzeUntrustedInput(text = '') {
  const value = String(text);
  const high = highRiskPatterns.find((pattern) => pattern.test(value));
  if (high) {
    return {
      level: 'high',
      score: 0.98,
      signal: 'prompt_injection_pattern',
      explanation: 'The input attempts to override instructions or expand financial scope.',
      matchedPattern: high.source
    };
  }
  const medium = mediumRiskPatterns.find((pattern) => pattern.test(value));
  if (medium) {
    return {
      level: 'medium',
      score: 0.62,
      signal: 'social_engineering_language',
      explanation: 'The input contains urgency or override language and should not be trusted as transaction state.',
      matchedPattern: medium.source
    };
  }
  return {
    level: 'low',
    score: 0.05,
    signal: 'none',
    explanation: 'No known instruction-manipulation pattern was detected.',
    matchedPattern: null
  };
}
