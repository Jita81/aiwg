# Media/Marketing Kit Overview

The Media/Marketing Kit (MMK) is a complete campaign management framework for AI-assisted marketing work. It provides 37 specialized agents, 87+ templates, phase-based workflows, and validation tooling covering the full marketing lifecycle from strategy through performance analysis.

## What It Is

MMK treats a marketing campaign the way SDLC treats a software project: defined phases, artifact templates for each phase, review gates between phases, and agents specialized for distinct roles. Rather than asking a general-purpose AI to write everything, you deploy role-specific agents — brand strategist, copywriter, legal reviewer, analytics specialist — and coordinate them through structured workflows.

The lifecycle runs in five phases:

| Phase | What Happens | Key Milestone |
|-------|--------------|---------------|
| **Strategy** | Goals, audience, messaging, channel plan | Strategy Baseline (SB) |
| **Creation** | Content, copy, creative assets across all channels | Content Complete (CC) |
| **Review** | Brand compliance, legal clearance, accessibility | Brand & Legal OK (BL) |
| **Publication** | Deploy, schedule, launch | Go-Live Ready (GL) |
| **Analysis** | Measure, report, optimize | Performance Review (PR) |

## Use Cases

**New product launch**: Define positioning and messaging (Strategy), produce launch content for blog, email, and social (Creation), validate claims legally (Review), publish on launch day (Publication), track KPIs (Analysis).

**Ongoing content programs**: Use the Creation phase workflows in a repeating cycle with the content calendar commands to produce consistent output across channels.

**Agency handoff**: Use `/intake-from-campaign` to analyze existing materials and generate structured intake documentation, then pass to the framework for structured production.

**PR and media relations**: The PR specialist agent and media kit templates support press releases, spokesperson briefs, embargo management, and crisis response.

## What Gets Deployed

When you run `aiwg use marketing`, the framework deploys:

- **37 agents** organized by function: strategy and planning (7), content creation (8), creative production (5), brand and governance (4), communications (3), analytics and optimization (5), orchestration and coordination (5)
- **Phase transition flow commands**: `flow-strategy-to-creation`, `flow-creation-to-review`, `flow-review-to-publication`, `flow-publication-to-analysis`
- **Continuous workflow commands**: brand compliance, content production, creative review, performance optimization
- **Content generators**: campaign strategy, content calendar, social content, email sequences, media kit
- **Quality commands**: `brand-validate`, `legal-clearance`, `accessibility-audit`

## Artifact Storage

All campaign artifacts go in `.aiwg/marketing/`:

```
.aiwg/marketing/
├── intake/            # Campaign briefs, stakeholder requirements
├── strategy/          # Campaign strategy, messaging, audience profiles
├── brand/             # Brand guidelines, voice frameworks
├── content/           # Content calendars, editorial plans
├── social/            # Social media calendars, platform strategies
├── email/             # Email campaigns, sequences
├── advertising/       # Ad creative, media plans
├── pr-communications/ # Press releases, media kits, crisis plans
├── sales-enablement/  # Sales collateral, battlecards
├── product-marketing/ # Launch plans, GTM strategy, positioning
├── events/            # Event plans, sponsorship strategies
├── analytics/         # Performance dashboards, KPI tracking
├── creative/          # Creative briefs, asset specifications
├── governance/        # Brand compliance, legal clearance
├── operations/        # Production timelines, vendor management
├── working/           # Temporary scratch (safe to delete)
└── reports/           # Generated reports
```

## Template Library

87+ templates organized by marketing discipline. Categories include intake, strategy, brand, content, social, email, advertising, PR, sales enablement, product marketing, events, analytics, creative production, governance, and operations.

All templates follow the `card-metadata-standard.md` format used across AIWG frameworks, enabling consistent metadata, traceability, and index generation.

## Integration with SDLC

MMK and sdlc-complete can coexist in the same project. The artifact directories do not overlap (`.aiwg/marketing/` vs `.aiwg/requirements/`, `.aiwg/architecture/`, etc.). For product launches, they share artifacts: product requirements from SDLC feed the product marketing templates in MMK; release timing from the SDLC deployment plan coordinates with the MMK publication phase.

## Compliance Extensions

The `add-ons/compliance/` directory provides framework extensions for:

- **FTC** — Endorsement disclosures, native advertising, influencer compliance
- **GDPR Marketing** — Consent management, privacy policy templates, cookie compliance
- **Industry-specific** — Healthcare (HIPAA), financial services (FINRA/SEC), pharma (FDA), legal services

## What MMK Does Not Do

MMK provides templates, workflows, and validation — not execution infrastructure. It does not publish to social platforms, send emails, or push ad campaigns. For actual deployment, integrate with marketing automation tools (HubSpot, Marketo), social platforms (Meta, LinkedIn), email service providers (Mailchimp, SendGrid), and analytics tools.

## References

- `@$AIWG_ROOT/agentic/code/frameworks/media-marketing-kit/docs/quickstart.md` — Deploy and first campaign
- `@$AIWG_ROOT/agentic/code/frameworks/media-marketing-kit/plan-act-mmk.md` — Lifecycle phases and milestones
- `@$AIWG_ROOT/agentic/code/frameworks/media-marketing-kit/agents/` — Agent catalog
- `@$AIWG_ROOT/agentic/code/frameworks/media-marketing-kit/templates/` — Template library
