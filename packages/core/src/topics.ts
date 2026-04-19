import type { Topic } from './types';

/**
 * Lightweight topic classifier using weighted keyword buckets.
 * This is the free-tier path — LLM classification only runs for ambiguous items.
 */

const RULES: Record<Topic, RegExp[]> = {
  war: [
    /\b(war|invasion|airstrike|missile|artillery|cease[- ]fire|offensive|troops|conflict|drone strike|shelling)\b/i,
  ],
  economy: [
    /\b(inflation|recession|gdp|central bank|interest rate|markets?|stocks?|bonds?|currency|tariff|sanction|oil price)\b/i,
  ],
  climate: [
    /\b(climate|emissions|drought|wildfire|flood|heatwave|glacier|carbon|COP\d+|renewable)\b/i,
  ],
  health: [
    /\b(pandemic|outbreak|virus|vaccine|WHO|epidemic|disease|cholera|ebola|measles)\b/i,
  ],
  civil: [
    /\b(protest|rally|election|vote|strike|union|referendum|coup|demonstrat)/i,
  ],
  cyber: [
    /\b(cyber|ransomware|breach|exploit|CVE-|zero[- ]day|DDoS|malware|phishing)\b/i,
  ],
  disaster: [
    /\b(earthquake|magnitude\s*\d|tsunami|hurricane|typhoon|cyclone|eruption|volcano|landslide)\b/i,
  ],
  other: [],
};

export function classifyTopic(title: string, summary?: string | null): Topic {
  const text = `${title}\n${summary ?? ''}`;
  let best: { topic: Topic; score: number } = { topic: 'other', score: 0 };
  for (const topic of Object.keys(RULES) as Topic[]) {
    let score = 0;
    for (const rx of RULES[topic]) if (rx.test(text)) score++;
    if (score > best.score) best = { topic, score };
  }
  return best.topic;
}
