import type { Topic } from './types';

/**
 * Lightweight topic classifier using weighted keyword buckets.
 *
 * Each topic has multiple regex patterns. An article scores +1 for each
 * pattern that matches. The topic with the highest score wins. If none
 * match, the article falls to 'other' — but with the expanded patterns
 * below, the vast majority of news headlines should match at least one.
 */

const RULES: Record<Topic, RegExp[]> = {
  war: [
    /\b(war|invasion|airstrike|air\s*strike|missile|missiles|artillery|cease[- ]?fire|offensive|troops|conflict|drone\s*strike|shelling)\b/i,
    /\b(military|army|soldier|soldiers|marines|navy|battle|combat|battlefield|frontline|front\s*line)\b/i,
    /\b(killed|dead|deaths?|casualties|fatalities|wounded|injured)\b/i,
    /\b(bomb|bombing|bombed|rocket|rockets|shell|shells|mortar|grenade|weapon|weapons)\b/i,
    /\b(hamas|hezbollah|houthi|taliban|isis|isil|idf|nato|pentagon|kremlin)\b/i,
    /\b(ukraine|russia|gaza|israel|iran|syria|iraq|afghanistan|yemen|sudan|libya)\b/i,
    /\b(strike|strikes|struck|attack|attacks|attacked|raid|raids)\b/i,
    /\b(defense|defence|defend|siege|occupation|occupied|liberation|liberated)\b/i,
    /\b(ceasefire|truce|armistice|surrender|retreat|withdrawal|deploy|deployed|deployment)\b/i,
    /\b(hostage|hostages|prisoner|prisoners|captive|captured|kidnap)\b/i,
    /\b(nuclear|warhead|ammunition|arms|armed|militia|insurgent|rebel|rebels)\b/i,
  ],
  economy: [
    /\b(inflation|recession|gdp|central\s*bank|interest\s*rate|markets?|stocks?|bonds?|currency|tariff|sanction|oil\s*price)\b/i,
    /\b(economy|economic|trade|trading|export|import|manufacturing|unemployment|jobs?\s*report)\b/i,
    /\b(fed|federal\s*reserve|ecb|bank\s*of|imf|world\s*bank|treasury|fiscal|monetary)\b/i,
    /\b(dollar|euro|yuan|yen|pound|bitcoin|crypto|cryptocurrency)\b/i,
    /\b(revenue|profit|earnings|growth|decline|downturn|recovery|stimulus|budget|debt)\b/i,
    /\b(wall\s*street|dow|nasdaq|s&p|ftse|nikkei|shanghai|index|indices)\b/i,
    /\b(price|prices|cost|costs|expensive|cheap|surge|surged|plunge|plunged|rally|rallied)\b/i,
    /\b(investment|investor|investors|startup|acquisition|merger|ipo|valuation)\b/i,
    /\b(supply\s*chain|shortage|demand|commodit|crude|barrel|opec)\b/i,
  ],
  climate: [
    /\b(climate|emissions|drought|wildfire|flood|flooding|heatwave|heat\s*wave|glacier|carbon|COP\d+|renewable)\b/i,
    /\b(global\s*warming|greenhouse|temperature|celsius|fahrenheit|arctic|antarctic|ice\s*cap|sea\s*level)\b/i,
    /\b(deforestation|pollution|environmental|sustainability|fossil\s*fuel|solar|wind\s*power|clean\s*energy)\b/i,
    /\b(extreme\s*weather|record\s*heat|record\s*cold|el\s*ni[ñn]o|la\s*ni[ñn]a)\b/i,
  ],
  health: [
    /\b(pandemic|outbreak|virus|vaccine|vaccination|WHO|epidemic|disease|cholera|ebola|measles)\b/i,
    /\b(covid|coronavirus|infection|infected|hospital|hospitalized|health\s*care|healthcare|surgeon|medical)\b/i,
    /\b(drug|drugs|pharmaceutical|fda|treatment|therapy|clinical\s*trial|diagnosis|symptom)\b/i,
    /\b(cancer|diabetes|malaria|tuberculosis|hiv|aids|flu|influenza|bird\s*flu|mpox|monkeypox)\b/i,
    /\b(mental\s*health|overdose|opioid|fentanyl|addiction)\b/i,
  ],
  civil: [
    /\b(protest|protests|rally|rallies|election|elections|vote|votes|voting|strike|union|referendum|coup|demonstrat)\b/i,
    /\b(president|prime\s*minister|parliament|congress|senate|governor|mayor|political|politics)\b/i,
    /\b(law|legislation|bill|act|regulation|court|supreme\s*court|ruling|verdict|trial|judge)\b/i,
    /\b(rights|freedom|democracy|authoritarian|dictator|opposition|dissident|crackdown)\b/i,
    /\b(immigration|migrant|migrants|refugee|refugees|asylum|border|deportation)\b/i,
    /\b(corruption|scandal|impeach|resign|resignation|indictment|arrested|sentenced)\b/i,
    /\b(diplomacy|diplomatic|ambassador|embassy|summit|treaty|agreement|deal|negotiations|talks)\b/i,
    /\b(aid|humanitarian|relief|crisis|emergency|displaced|famine|hunger|poverty)\b/i,
  ],
  cyber: [
    /\b(cyber|ransomware|breach|breached|exploit|CVE-|zero[- ]?day|DDoS|malware|phishing)\b/i,
    /\b(hack|hacked|hacking|hacker|hackers|data\s*leak|data\s*breach|vulnerability|vulnerabilities)\b/i,
    /\b(security\s*incident|threat\s*actor|botnet|trojan|spyware|backdoor|encryption)\b/i,
    /\b(cisa|nsa|apt\d+|state[- ]?sponsored|critical\s*infrastructure)\b/i,
  ],
  disaster: [
    /\b(earthquake|quake|magnitude\s*\d|tsunami|hurricane|typhoon|cyclone|eruption|volcano|volcanic|landslide)\b/i,
    /\b(tornado|tornadoes|storm|storms|severe\s*weather|devastation|destruction|rubble|debris)\b/i,
    /\b(rescue|rescuers|survivors|missing|trapped|evacuation|evacuated|shelter|displaced)\b/i,
    /\b(aftershock|seismic|richter|epicenter|epicentre|tectonic)\b/i,
    /\b(death\s*toll|toll\s*rises|toll\s*reaches|bodies\s*recovered|search\s*and\s*rescue)\b/i,
    /\b(fire|fires|blaze|blazes|inferno|wildfire|bushfire|forest\s*fire)\b/i,
    /\b(crash|crashed|derail|derailed|explosion|exploded|collapsed|collapse|sank|sinking)\b/i,
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
