# DPIA: trainm8 (draft)

> **DRAFT. It needs a legal review before any athlete but the owner uses trainm8
> or connects an assistant.** It is not legal advice. `[…]` marks a fact only
> the controller can supply. #549, map #541.

This follows Datatilsynet's structure for a data protection impact assessment
(_vurdering av personvernkonsekvenser_, GDPR Art. 35): describe the processing,
assess necessity and proportionality, assess the risks to the athletes, and set
the measures. Retention comes from
[ADR 0105](../adr/0105-strava-is-removed-and-every-data-class-has-a-retention-period.md).
The research behind it is in
[`ai-product-privacy-cost.md` §3](../research/ai-product-privacy-cost.md#3-privacy-and-regulation-norway-and-the-eea).

## 0. Why a DPIA is required

Datatilsynet's Art. 35(4) list says a DPIA is always required for processing
whose purpose is a commercial service that predicts health, behaviour or
movement patterns. trainm8 predicts readiness and load from wearable heart rate,
power and GPS, so it meets that item.

## 1. Systematic description

- **Controller:** [NAVN, ORGANISASJONSNUMMER, ADRESSE]. Contact: [E-POST].
- **Data subjects:** athletes with an account. Today, the owner only.
- **Data:** the account (email, username, name, image, login sessions) and the
  training record: planned and done sessions, HR, power and pace streams, GPS
  polylines, original activity files, thresholds, weight, height, birth date,
  sex, RPE and free-text session logs. Treated as Art. 9 health data.
- **Purposes:** (a) the account and the service; (b) training analysis and
  planning; (c) _later, opt-in_: sharing with the athlete's own AI assistant
  over MCP, and possibly an in-app agent.
- **Flows:** watch → Intervals.icu (Garmin through it) → trainm8; file upload →
  trainm8; trainm8 → the athlete's assistant over MCP on the athlete's OAuth
  grant (Phase 2); trainm8 → an inference processor (in-app agent, not built).
- **Processors and recipients:** Fly.io (hosting and database, Stockholm, US
  company, DPF), Tigris (images), Resend (email), Sentry if enabled [REGION]
  (errors plus performance traces and profiles, `server/utils/monitoring.ts`).
  The athlete's assistant provider (Anthropic, OpenAI) is an independent
  controller of the chat. Intervals.icu is the athlete's own source.
- **Retention:** ADR 0105 §3.

## 2. Necessity and proportionality

- **Legal basis:** Art. 6(1)(b) for the account; Art. 9(2)(a) explicit consent
  per purpose for health data. Training analysis is required to use the app;
  assistant sharing is separate, off by default and withdrawable without
  degrading the rest.
- **Minimisation:** streams downsampled to at most 1000 samples; no wellness
  data (sleep, HRV) by design (`GOAL.md`); Strava data no longer fetched (ADR
  0105); no transcripts stored.
- **Accuracy:** a number that cannot be shown truthfully is an Unavailable
  Metric with a reason, never a zero (`GOAL.md`).
- **Rights:** full JSON export (Art. 15, 20); account deletion cascades (Art.
  17); consent withdrawal (Art. 7(3)) [TO BUILD: consent page].
- **Transparency:** the Art. 13 notice at `/privacy` (draft).

## 3. Risks to the athletes

| #   | Risk                                                                                                                       | Likelihood | Severity | Notes                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ---------- | -------- | ------------------------------------------------------------- |
| R1  | Health data leaks from the database or a backup                                                                            | Low        | High     | One SQLite volume plus 5-day snapshots                        |
| R2  | Provider credentials stolen and used against the athlete's other accounts                                                  | Low        | Medium   | AES-256-GCM at rest (#548)                                    |
| R3  | An assistant receives more than the athlete meant (over-broad scopes)                                                      | Medium     | High     | MCP Phase 2                                                   |
| R4  | Prompt injection through imported titles or notes makes an assistant act against the athlete                               | Medium     | Medium   | ADR 0093: the model proposes, the athlete says yes in trainm8 |
| R5  | Hallucinated or medical-sounding advice harms the athlete                                                                  | Medium     | High     | Not a medical device; refuse diagnosis                        |
| R6  | Data in the assistant provider's account is kept or used for training beyond the athlete's expectation, and leaves the EEA | High       | Medium   | Independent controller; said at connect time                  |
| R7  | Transfer to the US loses its basis (C-703/25 P)                                                                            | Low–medium | Medium   | Fly.io on the DPF; SCC fallback                               |
| R8  | Vendor terms broken (Garmin, Strava) and data must be withdrawn                                                            | Medium     | Low      | ADR 0098 gate; Strava removed (ADR 0105)                      |
| R9  | A deleted account survives in a restored backup                                                                            | Low        | Medium   | ADR 0105 Deferred hardening                                   |
| R10 | Consent bundled or not provable                                                                                            | High today | High     | No consent record exists yet                                  |

## 4. Measures

- Per-purpose consent records with version and time;
  `hasConsent(userId, purpose)` gates every model-facing reader (#639 H5). [TO
  BUILD]
- The security hardening listed in #639 (H1–H11) before a second athlete
  connects an assistant.
- The retention sweep in ADR 0105. [TO BUILD]
- Strava removal and the secrets unset (ADR 0105 §1).
- A processor DPA for each processor above; review Fly.io's and Resend's
  subprocessors. [OWNER]
- For an in-app agent: Bedrock `eu-north-1` EU profile, DPA, and this DPIA
  redone.
- An Art. 30 record of processing. [OWNER]

## 5. Residual risk and consultation

[TO BE FILLED IN AFTER LEGAL REVIEW.] If high residual risk remains after the
measures, consult Datatilsynet before processing (Art. 36).

## 6. Sign-off

| Role         | Name | Date |
| ------------ | ---- | ---- |
| Controller   | [ ]  | [ ]  |
| Legal review | [ ]  | [ ]  |
