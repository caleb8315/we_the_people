/**
 * Lightweight named-entity extraction for news headlines.
 *
 * Extracts countries, major cities, geopolitical regions, key organisations,
 * and prominent proper nouns using a curated gazetteer + regex patterns.
 * No NLP library or LLM needed — regex + set lookups only.
 *
 * Entities carry more signal for event matching than common words:
 * two headlines mentioning "Gaza" and "Israel" are almost certainly about
 * the same event even if no other words overlap.
 */

// ── Country name → ISO code (top ~120 news-relevant countries) ───────────
const COUNTRY_MAP: Record<string, string> = {
  afghanistan: 'AF', albania: 'AL', algeria: 'DZ', argentina: 'AR',
  armenia: 'AM', australia: 'AU', austria: 'AT', azerbaijan: 'AZ',
  bahrain: 'BH', bangladesh: 'BD', belarus: 'BY', belgium: 'BE',
  bolivia: 'BO', brazil: 'BR', bulgaria: 'BG', cambodia: 'KH',
  cameroon: 'CM', canada: 'CA', chad: 'TD', chile: 'CL',
  china: 'CN', colombia: 'CO', congo: 'CD', 'costa rica': 'CR',
  croatia: 'HR', cuba: 'CU', cyprus: 'CY', czech: 'CZ', czechia: 'CZ',
  denmark: 'DK', ecuador: 'EC', egypt: 'EG', 'el salvador': 'SV',
  eritrea: 'ER', estonia: 'EE', ethiopia: 'ET', finland: 'FI',
  france: 'FR', georgia: 'GE', germany: 'DE', ghana: 'GH',
  greece: 'GR', guatemala: 'GT', haiti: 'HT', honduras: 'HN',
  hungary: 'HU', india: 'IN', indonesia: 'ID', iran: 'IR',
  iraq: 'IQ', ireland: 'IE', israel: 'IL', italy: 'IT',
  'ivory coast': 'CI', jamaica: 'JM', japan: 'JP', jordan: 'JO',
  kazakhstan: 'KZ', kenya: 'KE', kosovo: 'XK', kuwait: 'KW',
  kyrgyzstan: 'KG', laos: 'LA', latvia: 'LV', lebanon: 'LB',
  libya: 'LY', lithuania: 'LT', malaysia: 'MY', mali: 'ML',
  mexico: 'MX', moldova: 'MD', mongolia: 'MN', morocco: 'MA',
  mozambique: 'MZ', myanmar: 'MM', nepal: 'NP', netherlands: 'NL',
  'new zealand': 'NZ', nicaragua: 'NI', niger: 'NE', nigeria: 'NG',
  'north korea': 'KP', norway: 'NO', oman: 'OM', pakistan: 'PK',
  palestine: 'PS', panama: 'PA', peru: 'PE', philippines: 'PH',
  poland: 'PL', portugal: 'PT', qatar: 'QA', romania: 'RO',
  russia: 'RU', rwanda: 'RW', 'saudi arabia': 'SA', senegal: 'SN',
  serbia: 'RS', singapore: 'SG', slovakia: 'SK', slovenia: 'SI',
  somalia: 'SO', 'south africa': 'ZA', 'south korea': 'KR',
  'south sudan': 'SS', spain: 'ES', 'sri lanka': 'LK', sudan: 'SD',
  sweden: 'SE', switzerland: 'CH', syria: 'SY', taiwan: 'TW',
  tajikistan: 'TJ', tanzania: 'TZ', thailand: 'TH', tunisia: 'TN',
  turkey: 'TR', turkmenistan: 'TM', uganda: 'UG', ukraine: 'UA',
  'united arab emirates': 'AE', uae: 'AE',
  'united kingdom': 'GB', uk: 'GB', britain: 'GB', 'great britain': 'GB',
  'united states': 'US', usa: 'US', us: 'US', 'u.s.': 'US', 'u.s.a.': 'US', america: 'US',
  uzbekistan: 'UZ', venezuela: 'VE', vietnam: 'VN', yemen: 'YE',
  zambia: 'ZM', zimbabwe: 'ZW',
};

// ── Demonym → ISO code (helps match "Iranian missiles" → IR) ─────────────
const DEMONYM_MAP: Record<string, string> = {
  afghan: 'AF', albanian: 'AL', algerian: 'DZ', american: 'US',
  argentine: 'AR', armenian: 'AM', australian: 'AU', austrian: 'AT',
  azerbaijani: 'AZ', bahraini: 'BH', bangladeshi: 'BD', belarusian: 'BY',
  belgian: 'BE', bolivian: 'BO', brazilian: 'BR', british: 'GB',
  bulgarian: 'BG', cambodian: 'KH', cameroonian: 'CM', canadian: 'CA',
  chilean: 'CL', chinese: 'CN', colombian: 'CO', congolese: 'CD',
  croatian: 'HR', cuban: 'CU', cypriot: 'CY', czech: 'CZ',
  danish: 'DK', dutch: 'NL', ecuadorian: 'EC', egyptian: 'EG',
  eritrean: 'ER', estonian: 'EE', ethiopian: 'ET', finnish: 'FI',
  french: 'FR', georgian: 'GE', german: 'DE', ghanaian: 'GH',
  greek: 'GR', guatemalan: 'GT', haitian: 'HT', honduran: 'HN',
  hungarian: 'HU', indian: 'IN', indonesian: 'ID', iranian: 'IR',
  iraqi: 'IQ', irish: 'IE', israeli: 'IL', italian: 'IT',
  jamaican: 'JM', japanese: 'JP', jordanian: 'JO', kazakh: 'KZ',
  kenyan: 'KE', kosovar: 'XK', kuwaiti: 'KW', latvian: 'LV',
  lebanese: 'LB', libyan: 'LY', lithuanian: 'LT', malaysian: 'MY',
  malian: 'ML', mexican: 'MX', moldovan: 'MD', mongolian: 'MN',
  moroccan: 'MA', mozambican: 'MZ', nepalese: 'NP', nicaraguan: 'NI',
  nigerian: 'NG', norwegian: 'NO', omani: 'OM', pakistani: 'PK',
  palestinian: 'PS', panamanian: 'PA', peruvian: 'PE', philippine: 'PH',
  filipino: 'PH', polish: 'PL', portuguese: 'PT', qatari: 'QA',
  romanian: 'RO', russian: 'RU', rwandan: 'RW', saudi: 'SA',
  senegalese: 'SN', serbian: 'RS', singaporean: 'SG', slovak: 'SK',
  slovenian: 'SI', somali: 'SO', spanish: 'ES', sudanese: 'SD',
  swedish: 'SE', swiss: 'CH', syrian: 'SY', taiwanese: 'TW',
  tajik: 'TJ', tanzanian: 'TZ', thai: 'TH', tunisian: 'TN',
  turkish: 'TR', ugandan: 'UG', ukrainian: 'UA', emirati: 'AE',
  uzbek: 'UZ', venezuelan: 'VE', vietnamese: 'VN', yemeni: 'YE',
  zambian: 'ZM', zimbabwean: 'ZW',
};

// ── City → country linkage (so "Tehran" also produces C:IR) ──────────
const CITY_COUNTRY: Record<string, string> = {
  kabul: 'AF', baghdad: 'IQ', basra: 'IQ', mosul: 'IQ',
  tehran: 'IR', isfahan: 'IR', damascus: 'SY', aleppo: 'SY',
  idlib: 'SY', homs: 'SY', beirut: 'LB', tripoli: 'LY',
  benghazi: 'LY', aden: 'YE', sanaa: 'YE', riyadh: 'SA',
  jeddah: 'SA', doha: 'QA', dubai: 'AE', muscat: 'OM',
  amman: 'JO', jerusalem: 'IL', 'tel aviv': 'IL', haifa: 'IL',
  gaza: 'PS', rafah: 'PS', ramallah: 'PS', nablus: 'PS',
  hebron: 'PS', 'khan younis': 'PS', jenin: 'PS',
  kyiv: 'UA', kharkiv: 'UA', odesa: 'UA', kherson: 'UA',
  zaporizhzhia: 'UA', mariupol: 'UA', donetsk: 'UA', luhansk: 'UA',
  moscow: 'RU', minsk: 'BY', ankara: 'TR', istanbul: 'TR',
  cairo: 'EG', khartoum: 'SD', mogadishu: 'SO', nairobi: 'KE',
  lagos: 'NG', kinshasa: 'CD', johannesburg: 'ZA', beijing: 'CN',
  shanghai: 'CN', taipei: 'TW', pyongyang: 'KP', seoul: 'KR',
  tokyo: 'JP', 'new delhi': 'IN', mumbai: 'IN', islamabad: 'PK',
  karachi: 'PK', dhaka: 'BD', bangkok: 'TH', hanoi: 'VN',
  manila: 'PH', jakarta: 'ID', london: 'GB', paris: 'FR',
  berlin: 'DE', rome: 'IT', madrid: 'ES', brussels: 'BE',
  vienna: 'AT', warsaw: 'PL', bucharest: 'RO', budapest: 'HU',
  athens: 'GR', stockholm: 'SE', oslo: 'NO', dublin: 'IE',
  'mexico city': 'MX', bogota: 'CO', lima: 'PE',
  'buenos aires': 'AR', santiago: 'CL', caracas: 'VE',
  havana: 'CU', ottawa: 'CA', toronto: 'CA', sydney: 'AU',
  melbourne: 'AU', canberra: 'AU',
};

// ── US states (news-prominent subnational entities) ──────────────────
const US_STATE_SET: ReadonlySet<string> = new Set([
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado',
  'connecticut', 'delaware', 'florida', 'georgia', 'hawaii', 'idaho',
  'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana',
  'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota',
  'mississippi', 'missouri', 'montana', 'nebraska', 'nevada',
  'new hampshire', 'new jersey', 'new mexico', 'new york', 'north carolina',
  'north dakota', 'ohio', 'oklahoma', 'oregon', 'pennsylvania',
  'rhode island', 'south carolina', 'south dakota', 'tennessee', 'texas',
  'utah', 'vermont', 'virginia', 'washington', 'west virginia',
  'wisconsin', 'wyoming',
]);

// ── Major cities and conflict zones (news-prominent) ─────────────────────
const CITY_SET: ReadonlySet<string> = new Set([
  'kabul', 'baghdad', 'basra', 'mosul', 'tehran', 'isfahan', 'damascus',
  'aleppo', 'idlib', 'homs', 'beirut', 'tripoli', 'benghazi', 'aden',
  'sanaa', 'riyadh', 'jeddah', 'doha', 'abu dhabi', 'dubai', 'muscat',
  'amman', 'jerusalem', 'tel aviv', 'haifa', 'gaza', 'rafah', 'ramallah',
  'nablus', 'hebron', 'khan younis', 'jenin',
  'kyiv', 'kharkiv', 'odesa', 'kherson', 'zaporizhzhia', 'mariupol',
  'donetsk', 'luhansk', 'crimea', 'sevastopol', 'moscow', 'minsk',
  'ankara', 'istanbul', 'cairo', 'alexandria', 'khartoum', 'addis ababa',
  'mogadishu', 'nairobi', 'lagos', 'abuja', 'kinshasa', 'luanda',
  'johannesburg', 'cape town', 'pretoria',
  'beijing', 'shanghai', 'hong kong', 'taipei', 'pyongyang', 'seoul',
  'tokyo', 'osaka', 'new delhi', 'mumbai', 'islamabad', 'karachi',
  'lahore', 'dhaka', 'colombo', 'kathmandu', 'yangon', 'bangkok',
  'hanoi', 'manila', 'jakarta', 'kuala lumpur', 'singapore',
  'washington', 'new york', 'los angeles', 'chicago', 'houston',
  'london', 'paris', 'berlin', 'rome', 'madrid', 'brussels',
  'amsterdam', 'vienna', 'warsaw', 'prague', 'bucharest', 'budapest',
  'athens', 'lisbon', 'stockholm', 'oslo', 'copenhagen', 'helsinki',
  'dublin', 'zurich', 'geneva', 'moscow', 'kyiv',
  'mexico city', 'bogota', 'lima', 'buenos aires', 'santiago',
  'sao paulo', 'rio de janeiro', 'caracas', 'havana',
  'ottawa', 'toronto', 'montreal', 'vancouver',
  'canberra', 'sydney', 'melbourne', 'auckland', 'wellington',
]);

// ── Geopolitical regions & blocs ─────────────────────────────────────────
const REGION_SET: ReadonlySet<string> = new Set([
  'middle east', 'west bank', 'gaza strip', 'golan heights',
  'sahel', 'horn of africa', 'east africa', 'west africa', 'north africa',
  'sub-saharan', 'central africa', 'southern africa',
  'south asia', 'southeast asia', 'east asia', 'central asia',
  'asia pacific', 'indo-pacific',
  'eastern europe', 'western europe', 'northern europe', 'southern europe',
  'balkans', 'caucasus', 'baltics', 'scandinavia',
  'latin america', 'central america', 'caribbean', 'south america',
  'north america', 'arctic', 'antarctic',
  'donbas', 'crimea', 'taiwan strait', 'south china sea',
  'persian gulf', 'red sea', 'black sea', 'mediterranean',
  'eu', 'european union', 'un', 'united nations',
  'asean', 'brics', 'g7', 'g20', 'african union', 'arab league',
  'opec',
]);

// ── Key organisations in the news ────────────────────────────────────────
const ORG_SET: ReadonlySet<string> = new Set([
  'hamas', 'hezbollah', 'houthi', 'houthis', 'isis', 'isil',
  'islamic state', 'al qaeda', 'al-qaeda', 'taliban',
  'idf', 'irgc', 'wagner', 'pmc wagner',
  'nato', 'cia', 'fbi', 'nsa', 'mi6', 'mossad', 'fsb', 'gru',
  'pentagon', 'kremlin', 'white house', 'congress', 'senate',
  'parliament', 'bundestag', 'duma',
  'who', 'imf', 'world bank', 'icc', 'icj',
  'red cross', 'icrc', 'msf', 'unhcr', 'unicef', 'unrwa',
  'iaea', 'opcw', 'interpol',
  'fed', 'federal reserve', 'ecb', 'boj',
  'tesla', 'apple', 'google', 'meta', 'microsoft', 'amazon',
  'openai', 'nvidia', 'spacex',
]);

// ── Prominent political leaders (current as of 2024-2026) ────────────────
const LEADER_SET: ReadonlySet<string> = new Set([
  'biden', 'trump', 'harris', 'obama', 'putin', 'zelensky', 'zelenskyy',
  'xi jinping', 'xi', 'modi', 'erdogan', 'macron', 'scholz',
  'starmer', 'sunak', 'netanyahu', 'sinwar', 'nasrallah',
  'kim jong un', 'kim', 'lavrov', 'blinken', 'sullivan',
  'guterres', 'von der leyen', 'stoltenberg', 'rutte',
  'lula', 'milei', 'amlo', 'sheinbaum',
  'sisi', 'mbs', 'mohammed bin salman', 'khamenei', 'raisi',
  'marcos', 'kishida', 'ishiba', 'albanese',
]);

export interface ExtractedEntities {
  countries: string[];
  cities: string[];
  regions: string[];
  organisations: string[];
  leaders: string[];
  numbers: number[];
}

/**
 * Build a set of all entity terms (lowercased) found in the text.
 * Multi-word entities are joined with underscore for easy set membership.
 */
export function extractEntities(text: string): ExtractedEntities {
  const lower = text.toLowerCase();
  const result: ExtractedEntities = {
    countries: [],
    cities: [],
    regions: [],
    organisations: [],
    leaders: [],
    numbers: [],
  };

  // Multi-word lookups first (longer phrases before single words)
  for (const [name, code] of Object.entries(COUNTRY_MAP)) {
    if (name.includes(' ')) {
      if (lower.includes(name)) result.countries.push(code);
    }
  }
  for (const region of REGION_SET) {
    if (region.includes(' ') && lower.includes(region)) {
      result.regions.push(region.replace(/\s+/g, '_'));
    }
  }
  for (const city of CITY_SET) {
    if (city.includes(' ') && lower.includes(city)) {
      result.cities.push(city.replace(/\s+/g, '_'));
      const cc = CITY_COUNTRY[city];
      if (cc) result.countries.push(cc);
    }
  }
  for (const org of ORG_SET) {
    if (org.includes(' ') && lower.includes(org)) {
      result.organisations.push(org.replace(/\s+/g, '_'));
    }
  }
  for (const leader of LEADER_SET) {
    if (leader.includes(' ') && lower.includes(leader)) {
      result.leaders.push(leader.replace(/\s+/g, '_'));
    }
  }

  // Single-word lookups via word tokenization
  const words = lower.replace(/[^a-z0-9.\-' ]/g, ' ').split(/\s+/).filter(Boolean);
  for (const w of words) {
    const clean = w.replace(/[.''-]/g, '');
    if (COUNTRY_MAP[w]) result.countries.push(COUNTRY_MAP[w]!);
    else if (COUNTRY_MAP[clean]) result.countries.push(COUNTRY_MAP[clean]!);

    if (DEMONYM_MAP[w]) result.countries.push(DEMONYM_MAP[w]!);
    else if (DEMONYM_MAP[clean]) result.countries.push(DEMONYM_MAP[clean]!);

    if (CITY_SET.has(w)) {
      result.cities.push(w);
      // City → country linkage
      const cc = CITY_COUNTRY[w];
      if (cc) result.countries.push(cc);
    }
    if (REGION_SET.has(w)) result.regions.push(w);
    if (ORG_SET.has(w)) result.organisations.push(w);
    if (LEADER_SET.has(w)) result.leaders.push(w);
    if (US_STATE_SET.has(w)) result.regions.push(`US:${w}`);
  }

  // Multi-word US states
  for (const state of US_STATE_SET) {
    if (state.includes(' ') && lower.includes(state)) {
      result.regions.push(`US:${state.replace(/\s+/g, '_')}`);
    }
  }

  // Numbers (significant — 2+ digits, like casualty counts or magnitudes)
  const numRx = /\b(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\b/g;
  let m: RegExpExecArray | null;
  while ((m = numRx.exec(text)) !== null) {
    const n = Number(m[1]!.replace(/,/g, ''));
    if (Number.isFinite(n) && n >= 2 && n < 10_000_000) {
      result.numbers.push(n);
    }
  }

  // Deduplicate
  result.countries = [...new Set(result.countries)];
  result.cities = [...new Set(result.cities)];
  result.regions = [...new Set(result.regions)];
  result.organisations = [...new Set(result.organisations)];
  result.leaders = [...new Set(result.leaders)];
  result.numbers = [...new Set(result.numbers)];

  return result;
}

/**
 * Flatten extracted entities into a set of tokens for similarity comparison.
 * Entity tokens are prefixed to avoid collisions with regular words.
 * Country codes are normalised (e.g. "IL" not "israel" and "israeli").
 */
export function entityTokens(entities: ExtractedEntities): Set<string> {
  const tokens = new Set<string>();
  for (const c of entities.countries) tokens.add(`C:${c}`);
  for (const c of entities.cities) tokens.add(`CITY:${c}`);
  for (const r of entities.regions) tokens.add(`R:${r}`);
  for (const o of entities.organisations) tokens.add(`ORG:${o}`);
  for (const l of entities.leaders) tokens.add(`L:${l}`);
  for (const n of entities.numbers) {
    tokens.add(`N:${Math.floor(Math.log2(Math.max(1, n)))}`);
  }
  return tokens;
}
