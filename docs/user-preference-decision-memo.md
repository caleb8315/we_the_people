# User Preference Decision Memo (14-Day)

Use this memo after each 14-day beta window to decide whether to keep or change defaults.

## Window

- Start date: YYYY-MM-DD
- End date: YYYY-MM-DD
- Cohort size: N users

## Defaults under evaluation

- Feed mode default: `personalized`
- Briefing frequency default: `daily`
- Alert defaults:
  - `alert_intensity_preference = critical_only`
  - `max_alerts_per_day_preference = 3`
  - hard cap = 5/day
- AI chat limit: 10/day (beta)

## Readout

- Personalization adoption (% feed_viewed in personalized):
  - Result: __%
  - Guardrail: >= 60%
  - Pass/Fail: __
- Global escape-rate (% users switching to global):
  - Result: __%
  - Guardrail: <= 35%
  - Pass/Fail: __
- Alert fatigue (% users muted within 48h of first alert):
  - Result: __%
  - Guardrail: <= 20%
  - Pass/Fail: __
- Briefing engagement (% users with >=4 briefing events in 14 days):
  - Result: __%
  - Guardrail: >= 30%
  - Pass/Fail: __
- AI limit pressure (% active chat users hitting 10/day):
  - Result: __%
  - Guardrail: <= 25%
  - Pass/Fail: __

## Decision

- Keep current defaults: yes/no
- Changes for next cohort:
  - Feed:
  - Briefings:
  - Alerts:
  - AI limit messaging:

## Rationale (evidence)

- Key findings:
  - 
  - 
- Risks:
  - 

## Next experiments

- Experiment 1:
- Experiment 2:
- Experiment 3:
