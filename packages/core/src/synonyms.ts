/**
 * News-domain synonym clusters.
 *
 * Different outlets describe the same event with different vocabulary.
 * "missile" vs "rocket", "killed" vs "dead" vs "slain" — these are
 * editorial choices, not factual disagreements.
 *
 * This module maps common news terms to a canonical representative
 * so that similarity comparison treats synonymous words as identical.
 * The clusters are intentionally small and conservative — we only
 * merge terms that are genuinely interchangeable in news headlines.
 */

// Each entry: canonical term → set of synonyms (including the canonical)
const SYNONYM_CLUSTERS: [string, string[]][] = [
  // Weapons / strikes
  ['missile', ['missile', 'missiles', 'rocket', 'rockets', 'projectile', 'projectiles']],
  ['airstrike', ['airstrike', 'airstrikes', 'air strike', 'air strikes', 'air raid', 'air raids', 'bombing', 'bombings', 'bombardment', 'aerial attack']],
  ['drone', ['drone', 'drones', 'uav', 'uavs', 'unmanned']],
  ['shelling', ['shelling', 'shell', 'shells', 'artillery', 'mortar', 'mortars']],

  // Casualties
  ['killed', ['killed', 'dead', 'slain', 'died', 'fatalities', 'deaths', 'death toll', 'perished']],
  ['wounded', ['wounded', 'injured', 'hurt', 'casualties', 'hospitalized', 'hospitalised']],
  ['survivors', ['survivors', 'rescued', 'saved', 'pulled alive']],

  // Conflict actions
  ['attack', ['attack', 'attacks', 'assault', 'assaults', 'offensive', 'offensives', 'raid', 'raids', 'incursion']],
  ['invasion', ['invasion', 'invaded', 'invade', 'invading', 'occupation', 'occupied']],
  ['ceasefire', ['ceasefire', 'truce', 'armistice', 'halt', 'pause', 'cessation', 'stand-down', 'standdown']],
  ['retreat', ['retreat', 'retreated', 'withdrew', 'withdrawal', 'pullback', 'pull back', 'pulled back']],

  // Natural disasters
  ['earthquake', ['earthquake', 'quake', 'seismic', 'tremor', 'temblor', 'aftershock', 'aftershocks']],
  ['flood', ['flood', 'floods', 'flooding', 'inundation', 'deluge', 'flash flood']],
  ['hurricane', ['hurricane', 'cyclone', 'typhoon', 'tropical storm', 'superstorm']],
  ['wildfire', ['wildfire', 'wildfires', 'bushfire', 'bushfires', 'forest fire', 'blaze', 'blazes']],
  ['eruption', ['eruption', 'erupted', 'volcanic', 'volcano']],
  ['tsunami', ['tsunami', 'tidal wave']],
  ['tornado', ['tornado', 'tornadoes', 'twister', 'twisters']],
  ['landslide', ['landslide', 'mudslide', 'mudslides', 'avalanche']],
  ['drought', ['drought', 'droughts', 'water shortage', 'water crisis']],

  // Health
  ['outbreak', ['outbreak', 'epidemic', 'pandemic', 'surge', 'wave']],
  ['virus', ['virus', 'pathogen', 'disease', 'infection', 'contagion']],
  ['vaccine', ['vaccine', 'vaccines', 'vaccination', 'vaccinations', 'immunization', 'jab', 'booster']],

  // Economy
  ['recession', ['recession', 'downturn', 'contraction', 'slowdown', 'slump']],
  ['inflation', ['inflation', 'price rise', 'price rises', 'cost of living', 'price surge']],
  ['sanction', ['sanction', 'sanctions', 'embargo', 'embargoes', 'trade ban']],
  ['tariff', ['tariff', 'tariffs', 'duty', 'duties', 'trade barrier', 'import tax']],
  ['stock', ['stock', 'stocks', 'shares', 'equities', 'equity']],
  ['crash', ['crash', 'plunge', 'plunged', 'tumble', 'tumbled', 'nosedive', 'freefall']],
  ['rally', ['rally', 'rallied', 'surge', 'surged', 'soared', 'jumped', 'gained']],

  // Civil / political
  ['protest', ['protest', 'protests', 'demonstration', 'demonstrations', 'rally', 'rallies', 'march', 'marches']],
  ['election', ['election', 'elections', 'vote', 'votes', 'ballot', 'poll', 'polls', 'referendum']],
  ['coup', ['coup', 'putsch', 'overthrow', 'overthrown', 'toppled', 'ousted']],
  ['arrest', ['arrest', 'arrested', 'detained', 'detention', 'custody', 'apprehended']],

  // Cyber
  ['cyberattack', ['cyberattack', 'cyber attack', 'hack', 'hacked', 'hacking', 'breach', 'breached', 'data breach']],
  ['ransomware', ['ransomware', 'ransom', 'extortion', 'encrypted']],
  ['malware', ['malware', 'trojan', 'spyware', 'worm', 'backdoor']],
  ['vulnerability', ['vulnerability', 'vulnerabilities', 'exploit', 'exploits', 'zero-day', 'zero day', 'cve']],

  // Humanitarian
  ['refugees', ['refugees', 'refugee', 'displaced', 'displacement', 'asylum', 'migrants', 'migration', 'exodus', 'fleeing', 'fled']],
  ['famine', ['famine', 'starvation', 'hunger', 'food crisis', 'food shortage', 'malnutrition']],
  ['aid', ['aid', 'humanitarian aid', 'relief', 'assistance', 'supplies']],

  // Negotiations
  ['talks', ['talks', 'negotiations', 'dialogue', 'summit', 'meeting', 'conference', 'diplomacy', 'diplomatic']],
  ['deal', ['deal', 'agreement', 'accord', 'pact', 'treaty']],
];

// Common stem truncations for news words. Added here so that when the
// Porter stemmer turns "missiles" → "missil" or "killed" → "kill", the
// synonym map still resolves to the canonical form.
const STEM_FORMS: Record<string, string[]> = {
  missile: ['missil'],
  killed: ['kill'],
  wounded: ['wound'],
  attack: ['attack'],
  airstrike: ['airstrik'],
  shelling: ['shell'],
  ceasefire: ['ceasefir'],
  invasion: ['invas'],
  earthquake: ['earthquak'],
  flood: ['flood'],
  hurricane: ['hurrican'],
  wildfire: ['wildfir'],
  eruption: ['erupt'],
  tornado: ['tornado'],
  outbreak: ['outbreak'],
  vaccine: ['vaccin'],
  recession: ['recess'],
  sanction: ['sanction'],
  protest: ['protest'],
  election: ['elect'],
  coup: ['coup'],
  arrest: ['arrest'],
  cyberattack: ['cyberattack'],
  ransomware: ['ransomwar'],
  vulnerability: ['vulner'],
  refugees: ['refuge'],
  famine: ['famin'],
  deal: ['deal'],
  talks: ['talk'],
};

// Build a fast lookup: word → canonical form
const wordToCanonical = new Map<string, string>();
for (const [canonical, variants] of SYNONYM_CLUSTERS) {
  for (const variant of variants) {
    const normalised = variant.toLowerCase().replace(/\s+/g, '_');
    wordToCanonical.set(normalised, canonical);
    if (!variant.includes(' ')) {
      wordToCanonical.set(variant.toLowerCase(), canonical);
    }
  }
  // Also register known stem forms → canonical
  const stemForms = STEM_FORMS[canonical];
  if (stemForms) {
    for (const sf of stemForms) {
      wordToCanonical.set(sf, canonical);
    }
  }
}

/**
 * Map a word to its canonical synonym. Returns the original word
 * if no synonym cluster contains it.
 */
export function canonicalSynonym(word: string): string {
  const lower = word.toLowerCase();
  return wordToCanonical.get(lower) ?? lower;
}

/**
 * Expand a set of terms by mapping each to its canonical synonym.
 * This ensures that "missile" and "rocket" both become "missile",
 * making Jaccard treat them as the same token.
 */
export function expandSynonyms(terms: Set<string>): Set<string> {
  const expanded = new Set<string>();
  for (const term of terms) {
    expanded.add(canonicalSynonym(term));
  }
  return expanded;
}
