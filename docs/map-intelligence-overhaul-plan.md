# Map Intelligence Overhaul Plan (Production)

## Why this upgrade is needed

Current map behavior is useful but underpowered for verification workflows:

- The UI mostly renders **one point per signal**, so rich multi-source coverage can look thin.
- Many signals fallback to country centroids, creating sparse or misleading spatial context.
- Analysts cannot quickly separate:
  - exact vs approximate locations
  - verified vs developing vs unverified
  - sensor/official vs social/market/context signals
- Dense or colocated points can overlap and hide important events.

Goal: make the map a first-class verification surface, not a secondary visualization.

---

## User research synthesis

This plan combines:

1. **Existing in-product telemetry model**
   - `map_opened`
   - `map_filter_changed`
   - `signal_opened_from_map`
   - existing map-open-to-signal-open KPI in `docs/runbooks.md`

2. **Map UX research patterns**
   - high-density maps need clustering/aggregation and progressive disclosure
   - uncertainty must be explicit (exact vs approximate)
   - source transparency and confidence context should be visible at click-time
   - map filtering should prioritize investigation intent, not only visual style

3. **Verification-domain requirements**
   - users need to answer fast:
     1) where is this happening?
     2) how strong is support?
     3) what is exact vs inferred?
     4) which signals deserve follow-up now?

### Primary user jobs-to-be-done

1. **Scan**
   - "Show me where important events cluster globally right now."
2. **Triage**
   - "Show high-severity + corroborated events first."
3. **Validate**
   - "Separate exact geospatial evidence from approximate inferred locations."
4. **Investigate**
   - "Open the strongest/most disputed signal from this location quickly."

---

## Product requirements

### R1. Multi-point geospatial model

- A signal must support multiple geospatial points when available.
- Geospatial points should preserve provenance:
  - source id
  - precision (`exact` | `approximate`)
  - optional label

### R2. Better location extraction coverage

- Ingest should collect map locations from all raw items in a cluster, not only primary.
- Country fallback inference should be improved for records that lack explicit coordinates.

### R3. Verification-first map controls

- In-map filters:
  - verification state
  - precision (exact vs approximate)
  - source class
- Stats bar should summarize filtered map evidence quality.

### R4. Overlap-safe rendering

- Co-located points should aggregate into stack markers with counts.
- Popups should show grouped signals with direct open actions.

### R5. Telemetry for outcomes

- Reuse `map_filter_changed` and `signal_opened_from_map` with richer props.
- Keep event names inside existing DB constraint.

---

## Technical implementation plan

## Phase 1 — Data model and extraction

1. Extend ingest geospatial extraction:
   - collect coordinates from known raw patterns (`geometry`, `coordinates`, `lat/lon`, etc.)
   - gather map candidates from every raw item in a clustered signal
2. Persist into `signals.raw_data.map_locations` (JSON) with provenance fields
3. Improve inferred country fallback where possible
4. Update backfill job to populate map locations for existing recent rows

## Phase 2 — Web geo pipeline

1. Replace one-point helper with multi-point helper:
   - `signalGeoPoints(signal): SignalGeoPoint[]`
2. Deduplicate and cap per-signal points for performance
3. Enrich point metadata for map filtering and popup context

## Phase 3 — Map UX overhaul

1. Add verification filters (all/verified/developing/unverified)
2. Add precision filters (all/exact/approximate)
3. Add source class filters (all/sensor/news/social/markets/other)
4. Aggregate co-located points into stack markers
5. Rich popups:
   - support counts
   - quick links to highest priority signals
   - explicit approximate labeling

## Phase 4 — Observability and hardening

1. Enrich map telemetry payloads
2. Ensure graceful behavior with zero-point, low-point, and high-point result sets
3. Keep map responsive and deterministic without adding fragile dependencies

---

## Success metrics

Primary:
- Increase `map_open_to_signal_open_pct` by improving map-to-investigation handoff.

Secondary:
- Increase map usage share (`map_feed_share_pct`) on feed/intel.
- Increase filtered-map interactions (`map_filter_changed` richness).
- Increase exact-point share where data allows.

---

## Risks and mitigations

1. **Over-clutter from too many points**
   - Mitigation: co-location aggregation + default filters + per-signal cap
2. **False precision from inferred locations**
   - Mitigation: explicit `approximate` labeling and visual distinction
3. **Performance regressions**
   - Mitigation: deterministic dedupe/aggregation and bounded render sets
4. **Telemetry writes rejected by DB CHECK**
   - Mitigation: reuse existing event names only

---

## Rollout notes

- No schema migration required for core feature delivery (uses `raw_data` JSON).
- Existing map pages (`feed`, `intel`) adopt the richer pipeline automatically.
- Can be extended later with dedicated map tables / tiles if scale demands.

---

## Implementation status (this branch)

- [x] Plan + user-research synthesis documented.
- [x] Worker geospatial extraction upgraded:
  - shared `extractMapLocationsFromRawItems(...)` helper added
  - ingest now stores `raw_data.map_locations` from all clustered raw items
  - backfill now rehydrates missing map locations for recent existing signals
- [x] Web geo pipeline upgraded:
  - `signalGeoPoint` replaced by `signalGeoPoints`
  - supports multi-point per signal, dedupe + bounded cardinality
  - preserves point provenance metadata (kind/source/location label/precision)
- [x] Feed + Intel map data path upgraded to multi-point mapping.
- [x] Map UI upgraded with investigation-first controls:
  - verification-state filter
  - precision filter
  - source-class filter
  - co-location aggregation stack markers
  - richer telemetry payload on `map_filter_changed`
- [x] Product event contract updated for new map interactions:
  - no new event names added in this phase (constraint-safe)
  - richer `map_filter_changed` + `signal_opened_from_map` payloads only
