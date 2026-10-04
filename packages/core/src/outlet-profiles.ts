/**
 * Outlet ownership / editorial-control profiles.
 *
 * Used to label *who is speaking* — never to decide truth on its own.
 * State-controlled outlets are still surfaced as a perspective (what a
 * government wants its audience to believe is itself useful evidence),
 * but they never count as independent corroboration.
 *
 * Categories:
 *   - state_controlled   government exerts direct editorial control
 *   - state_aligned      nominally private, ownership tied to a government
 *   - state_funded       government funded, with stated editorial-independence safeguards
 *   - public_broadcaster public-service broadcaster with statutory independence
 *   - wire               international news agency
 *   - fact_checker       dedicated fact-checking organisation
 *   - government         official government / intergovernmental body
 *   - independent        everything else we have a profile for
 */

export type OutletOwnership =
  | 'state_controlled'
  | 'state_aligned'
  | 'state_funded'
  | 'public_broadcaster'
  | 'wire'
  | 'fact_checker'
  | 'government'
  | 'independent'
  | 'unknown';

export interface OutletProfile {
  domain: string;
  name: string;
  /** ISO 3166-1 alpha-2 of the controlling/home country, when known. */
  country: string | null;
  ownership: OutletOwnership;
  note: string | null;
}

type Row = [domain: string, name: string, country: string | null, ownership: OutletOwnership, note?: string];

const ROWS: Row[] = [
  // ── Russia ────────────────────────────────────────────────────────────────
  ['rt.com', 'RT', 'RU', 'state_controlled', 'Russian state-funded international broadcaster; sanctioned in the EU, UK and US.'],
  ['sputnikglobe.com', 'Sputnik', 'RU', 'state_controlled', 'Owned by Russian state media group Rossiya Segodnya.'],
  ['sputniknews.com', 'Sputnik', 'RU', 'state_controlled', 'Owned by Russian state media group Rossiya Segodnya.'],
  ['ria.ru', 'RIA Novosti', 'RU', 'state_controlled', 'Russian state news agency (Rossiya Segodnya).'],
  ['tass.ru', 'TASS', 'RU', 'state_controlled', 'Russian state news agency.'],
  ['tass.com', 'TASS', 'RU', 'state_controlled', 'Russian state news agency.'],
  ['rg.ru', 'Rossiyskaya Gazeta', 'RU', 'state_controlled', 'Official newspaper of the Russian government.'],
  ['1tv.ru', 'Channel One Russia', 'RU', 'state_controlled', 'Majority state-controlled Russian broadcaster.'],
  ['smotrim.ru', 'VGTRK / Rossiya', 'RU', 'state_controlled', 'Russian state broadcaster.'],
  ['vesti.ru', 'Vesti (VGTRK)', 'RU', 'state_controlled', 'Russian state broadcaster.'],
  ['iz.ru', 'Izvestia', 'RU', 'state_aligned', 'Owned by National Media Group, closely tied to the Kremlin.'],
  // ── Belarus ───────────────────────────────────────────────────────────────
  ['belta.by', 'BelTA', 'BY', 'state_controlled', 'Belarusian state news agency.'],
  // ── China ─────────────────────────────────────────────────────────────────
  ['xinhuanet.com', 'Xinhua', 'CN', 'state_controlled', 'Chinese state news agency.'],
  ['news.cn', 'Xinhua', 'CN', 'state_controlled', 'Chinese state news agency.'],
  ['cgtn.com', 'CGTN', 'CN', 'state_controlled', 'International arm of China Central Television.'],
  ['cctv.com', 'CCTV', 'CN', 'state_controlled', 'Chinese state broadcaster.'],
  ['globaltimes.cn', 'Global Times', 'CN', 'state_controlled', "Tabloid published by the Chinese Communist Party's People's Daily."],
  ['chinadaily.com.cn', 'China Daily', 'CN', 'state_controlled', 'Owned by the Chinese Communist Party publicity department.'],
  ['people.com.cn', "People's Daily", 'CN', 'state_controlled', 'Official newspaper of the Chinese Communist Party.'],
  ['ecns.cn', 'China News Service', 'CN', 'state_controlled', 'Chinese state news agency.'],
  // ── Iran ──────────────────────────────────────────────────────────────────
  ['presstv.ir', 'Press TV', 'IR', 'state_controlled', 'English-language arm of Iranian state broadcaster IRIB.'],
  ['irna.ir', 'IRNA', 'IR', 'state_controlled', 'Iranian state news agency.'],
  ['tasnimnews.com', 'Tasnim', 'IR', 'state_controlled', 'Affiliated with the Islamic Revolutionary Guard Corps.'],
  ['farsnews.ir', 'Fars News', 'IR', 'state_controlled', 'Affiliated with the Islamic Revolutionary Guard Corps.'],
  ['mehrnews.com', 'Mehr News', 'IR', 'state_controlled', 'Owned by the Islamic Development Organization (state).'],
  // ── North Korea ───────────────────────────────────────────────────────────
  ['kcna.kp', 'KCNA', 'KP', 'state_controlled', 'North Korean state news agency.'],
  ['rodong.rep.kp', 'Rodong Sinmun', 'KP', 'state_controlled', "Official newspaper of North Korea's ruling party."],
  // ── Turkey ────────────────────────────────────────────────────────────────
  ['trtworld.com', 'TRT World', 'TR', 'state_controlled', 'Turkish state broadcaster; leadership appointed by the government.'],
  ['trthaber.com', 'TRT Haber', 'TR', 'state_controlled', 'Turkish state broadcaster.'],
  ['aa.com.tr', 'Anadolu Agency', 'TR', 'state_controlled', 'Turkish state-run news agency.'],
  // ── Gulf / Middle East ────────────────────────────────────────────────────
  ['aljazeera.com', 'Al Jazeera', 'QA', 'state_funded', 'Funded by the government of Qatar.'],
  ['aljazeera.net', 'Al Jazeera Arabic', 'QA', 'state_funded', 'Funded by the government of Qatar.'],
  ['alarabiya.net', 'Al Arabiya', 'SA', 'state_aligned', 'Saudi-owned broadcaster (MBC Group).'],
  ['arabnews.com', 'Arab News', 'SA', 'state_aligned', 'Saudi Research and Media Group, closely tied to the Saudi state.'],
  ['spa.gov.sa', 'Saudi Press Agency', 'SA', 'state_controlled', 'Saudi state news agency.'],
  ['wam.ae', 'WAM', 'AE', 'state_controlled', 'UAE state news agency.'],
  ['ahram.org.eg', 'Al-Ahram', 'EG', 'state_controlled', 'Egyptian state-owned newspaper.'],
  ['sana.sy', 'SANA', 'SY', 'state_controlled', 'Syrian state news agency.'],
  // ── Latin America ─────────────────────────────────────────────────────────
  ['telesurtv.net', 'teleSUR', 'VE', 'state_controlled', 'Funded primarily by the Venezuelan government.'],
  ['telesurenglish.net', 'teleSUR English', 'VE', 'state_controlled', 'Funded primarily by the Venezuelan government.'],
  ['granma.cu', 'Granma', 'CU', 'state_controlled', 'Official newspaper of the Cuban Communist Party.'],
  // ── Government-funded international broadcasters (Western) ───────────────
  ['voanews.com', 'Voice of America', 'US', 'state_funded', 'Funded by the US government (USAGM) with a statutory firewall.'],
  ['rferl.org', 'Radio Free Europe/Radio Liberty', 'US', 'state_funded', 'Funded by the US government (USAGM) with a statutory firewall.'],
  ['rfa.org', 'Radio Free Asia', 'US', 'state_funded', 'Funded by the US government (USAGM) with a statutory firewall.'],
  ['polygraph.info', 'Polygraph.info', 'US', 'state_funded', 'Fact-check site run by VOA and RFE/RL (US government funded).'],
  ['france24.com', 'France 24', 'FR', 'state_funded', 'State-owned France Médias Monde, with editorial-independence charter.'],
  ['rfi.fr', 'RFI', 'FR', 'state_funded', 'State-owned France Médias Monde, with editorial-independence charter.'],
  ['dw.com', 'Deutsche Welle', 'DE', 'state_funded', 'Funded by the German federal budget; independent under the DW Act.'],
  ['channelnewsasia.com', 'CNA', 'SG', 'state_aligned', 'Mediacorp, owned by the Singapore state investment company Temasek.'],
  // ── Public-service broadcasters ───────────────────────────────────────────
  ['bbc.com', 'BBC', 'GB', 'public_broadcaster'],
  ['bbc.co.uk', 'BBC', 'GB', 'public_broadcaster'],
  ['cbc.ca', 'CBC', 'CA', 'public_broadcaster'],
  ['abc.net.au', 'ABC Australia', 'AU', 'public_broadcaster'],
  ['nhk.or.jp', 'NHK', 'JP', 'public_broadcaster'],
  ['npr.org', 'NPR', 'US', 'public_broadcaster'],
  ['pbs.org', 'PBS', 'US', 'public_broadcaster'],
  ['rte.ie', 'RTÉ', 'IE', 'public_broadcaster'],
  ['tagesschau.de', 'ARD Tagesschau', 'DE', 'public_broadcaster'],
  ['zdf.de', 'ZDF', 'DE', 'public_broadcaster'],
  ['francetvinfo.fr', 'France Télévisions', 'FR', 'public_broadcaster'],
  ['svt.se', 'SVT', 'SE', 'public_broadcaster'],
  ['nrk.no', 'NRK', 'NO', 'public_broadcaster'],
  ['yle.fi', 'Yle', 'FI', 'public_broadcaster'],
  ['kbs.co.kr', 'KBS', 'KR', 'public_broadcaster'],
  ['rai.it', 'RAI', 'IT', 'public_broadcaster'],
  ['rtve.es', 'RTVE', 'ES', 'public_broadcaster'],
  ['suspilne.media', 'Suspilne', 'UA', 'public_broadcaster'],
  // ── Wires ─────────────────────────────────────────────────────────────────
  ['reuters.com', 'Reuters', 'GB', 'wire'],
  ['apnews.com', 'Associated Press', 'US', 'wire'],
  ['afp.com', 'AFP', 'FR', 'wire'],
  ['efe.com', 'EFE', 'ES', 'wire', 'Spanish news agency, majority state-owned.'],
  ['ansa.it', 'ANSA', 'IT', 'wire'],
  ['dpa.com', 'dpa', 'DE', 'wire'],
  ['yna.co.kr', 'Yonhap', 'KR', 'wire', 'South Korean news agency, publicly funded.'],
  ['kyodonews.net', 'Kyodo', 'JP', 'wire'],
  ['ptinews.com', 'Press Trust of India', 'IN', 'wire'],
  ['ukrinform.net', 'Ukrinform', 'UA', 'state_controlled', 'Ukrainian state news agency.'],
  ['ukrinform.ua', 'Ukrinform', 'UA', 'state_controlled', 'Ukrainian state news agency.'],
];

const FACT_CHECKERS: Array<[string, string, string | null]> = [
  ['snopes.com', 'Snopes', 'US'],
  ['politifact.com', 'PolitiFact', 'US'],
  ['factcheck.org', 'FactCheck.org', 'US'],
  ['leadstories.com', 'Lead Stories', 'US'],
  ['checkyourfact.com', 'Check Your Fact', 'US'],
  ['healthfeedback.org', 'Health Feedback', null],
  ['climatefeedback.org', 'Climate Feedback', null],
  ['sciencefeedback.co', 'Science Feedback', null],
  ['fullfact.org', 'Full Fact', 'GB'],
  ['factcheck.afp.com', 'AFP Fact Check', 'FR'],
  ['factuel.afp.com', 'AFP Factuel', 'FR'],
  ['maldita.es', 'Maldita', 'ES'],
  ['newtral.es', 'Newtral', 'ES'],
  ['correctiv.org', 'CORRECTIV', 'DE'],
  ['mimikama.org', 'Mimikama', 'AT'],
  ['pagellapolitica.it', 'Pagella Politica', 'IT'],
  ['facta.news', 'Facta', 'IT'],
  ['demagog.org.pl', 'Demagog', 'PL'],
  ['demagog.cz', 'Demagog.cz', 'CZ'],
  ['stopfake.org', 'StopFake', 'UA'],
  ['euvsdisinfo.eu', 'EUvsDisinfo', 'EU'],
  ['provereno.media', 'Provereno', null],
  ['boomlive.in', 'BOOM', 'IN'],
  ['altnews.in', 'Alt News', 'IN'],
  ['factly.in', 'Factly', 'IN'],
  ['newschecker.in', 'Newschecker', 'IN'],
  ['vishvasnews.com', 'Vishvas News', 'IN'],
  ['africacheck.org', 'Africa Check', 'ZA'],
  ['pesacheck.org', 'PesaCheck', 'KE'],
  ['dubawa.org', 'Dubawa', 'NG'],
  ['chequeado.com', 'Chequeado', 'AR'],
  ['aosfatos.org', 'Aos Fatos', 'BR'],
  ['colombiacheck.com', 'Colombiacheck', 'CO'],
  ['verificado.com.mx', 'Verificado', 'MX'],
  ['misbar.com', 'Misbar', null],
  ['fatabyyano.net', 'Fatabyyano', 'JO'],
  ['teyit.org', 'Teyit', 'TR'],
  ['dogrulukpayi.com', 'Doğruluk Payı', 'TR'],
  ['tfc-taiwan.org.tw', 'Taiwan FactCheck Center', 'TW'],
  ['mygopen.com', 'MyGoPen', 'TW'],
  ['verafiles.org', 'VERA Files', 'PH'],
  ['logicallyfacts.com', 'Logically Facts', null],
  ['nieuwscheckers.nl', 'Nieuwscheckers', 'NL'],
  ['faktisk.no', 'Faktisk', 'NO'],
  ['kallkritikbyran.se', 'Källkritikbyrån', 'SE'],
  ['tjekdet.dk', 'TjekDet', 'DK'],
  ['faktabaari.fi', 'Faktabaari', 'FI'],
  ['factcheck.kz', 'Factcheck.kz', 'KZ'],
  ['cekfakta.com', 'CekFakta', 'ID'],
  ['turnbackhoax.id', 'Turn Back Hoax', 'ID'],
  ['bellingcat.com', 'Bellingcat', 'NL'],
];

const PROFILE_MAP: Map<string, OutletProfile> = (() => {
  const m = new Map<string, OutletProfile>();
  for (const [domain, name, country, ownership, note] of ROWS) {
    m.set(domain, { domain, name, country, ownership, note: note ?? null });
  }
  for (const [domain, name, country] of FACT_CHECKERS) {
    m.set(domain, {
      domain,
      name,
      country,
      ownership: 'fact_checker',
      note: 'Dedicated fact-checking organisation.',
    });
  }
  return m;
})();

const FACT_CHECK_PATH = /\/(?:fact-?checks?|factcheck|ap-fact-check|fact-checker|checknews|les-decodeurs|webqoof|verificacion|verifica|faktencheck|faktenfuchs|hechos|comprova|fact-check-hub)(?:\/|$|-)/i;

const GOVERNMENT_SUFFIXES = ['.gov', '.mil', '.gov.uk', '.gouv.fr', '.gc.ca', '.gov.au', '.go.jp', '.gov.in', '.europa.eu', '.int'];

function normalizeHost(domainOrUrl: string): string {
  let host = domainOrUrl.trim().toLowerCase();
  if (host.includes('://')) {
    try {
      host = new URL(host).hostname.toLowerCase();
    } catch {
      return '';
    }
  }
  return host.replace(/^www\./, '').replace(/\/.*$/, '');
}

/** Look up a profile for a domain or URL. Subdomains inherit the parent profile. */
export function outletProfile(domainOrUrl: string | null | undefined): OutletProfile | null {
  if (!domainOrUrl) return null;
  const host = normalizeHost(domainOrUrl);
  if (!host) return null;
  const parts = host.split('.');
  for (let i = 0; i < parts.length - 1; i += 1) {
    const candidate = parts.slice(i).join('.');
    const hit = PROFILE_MAP.get(candidate);
    if (hit) return hit;
  }
  if (GOVERNMENT_SUFFIXES.some((s) => host.endsWith(s)) || host === 'un.org' || host.endsWith('.un.org')) {
    return { domain: host, name: host, country: null, ownership: 'government', note: null };
  }
  return null;
}

export function isStateControlledDomain(domainOrUrl: string | null | undefined): boolean {
  return outletProfile(domainOrUrl)?.ownership === 'state_controlled';
}

/**
 * True for dedicated fact-checkers and for fact-check sections of general
 * outlets (reuters.com/fact-check/…, apnews.com/ap-fact-check/…).
 */
export function isFactCheckSource(url: string | null | undefined, domain?: string | null): boolean {
  const profile = outletProfile(domain ?? url ?? null);
  if (profile?.ownership === 'fact_checker') return true;
  if (!url) return false;
  try {
    return FACT_CHECK_PATH.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

export function ownershipLabel(o: OutletOwnership): string {
  switch (o) {
    case 'state_controlled':
      return 'State-controlled media';
    case 'state_aligned':
      return 'State-aligned media';
    case 'state_funded':
      return 'Government-funded media';
    case 'public_broadcaster':
      return 'Public broadcaster';
    case 'wire':
      return 'News agency';
    case 'fact_checker':
      return 'Fact-checker';
    case 'government':
      return 'Government / official';
    case 'independent':
      return 'Independent media';
    default:
      return 'Unprofiled outlet';
  }
}
