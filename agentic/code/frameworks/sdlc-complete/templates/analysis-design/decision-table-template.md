# Decision Table

## Metadata

- ID: DES-DT-`id`
- Owner: `name/role/team`
- Contributors: `list`
- Reviewers: `list`
- Team: `team`
- Stakeholders: `list`
- Status: `draft/in-progress/blocked/approved/done`
- Dates: created `YYYY-MM-DD` / updated `YYYY-MM-DD` / due `YYYY-MM-DD`
- Related: UC-`id`, REQ-`id`, DES-`id`, BS-`id`, CODE-`module`, TEST-`id`

## Related Templates

- agentic/code/frameworks/sdlc-complete/templates/analysis-design/use-case-realization-template.md
- agentic/code/frameworks/sdlc-complete/templates/analysis-design/activity-diagram-spec-template.md
- agentic/code/frameworks/sdlc-complete/templates/analysis-design/method-interface-contract-template.md

## Traceability

- Parent Use Case: UC-`id` — `title`
- Behavioral Spec: BS-`id`
- Interface Contracts: IC-`id`, IC-`id`

## Decision Context

- Decision Name: `human-readable name for this branching logic`
- Trigger: `what event or call invokes this decision`
- Scope: `which component/service/function evaluates this table`
- Evaluation Order: `all conditions simultaneously / top-to-bottom priority / first-match`

## Condition Catalog

Each condition stub maps to one row in the Rules Matrix. Conditions must be boolean-evaluable at runtime.

| # | Condition | Type | Source | Notes |
| - | --------- | ---- | ------ | ----- |
| C1 | `condition description` | `boolean/enum/range` | `field or expression` | `clarification` |
| C2 | `condition description` | `boolean/enum/range` | `field or expression` | `clarification` |
| C3 | `condition description` | `boolean/enum/range` | `field or expression` | `clarification` |

## Action Catalog

Each action stub maps to one row in the Rules Matrix. Actions must be concrete operations with observable effects.

| # | Action | Type | Effect | Notes |
| - | ------ | ---- | ------ | ----- |
| A1 | `action description` | `return value/side effect/exception` | `what changes in the system` | `clarification` |
| A2 | `action description` | `return value/side effect/exception` | `what changes in the system` | `clarification` |
| A3 | `action description` | `return value/side effect/exception` | `what changes in the system` | `clarification` |

## Rules Matrix

Column headers are rule identifiers (R1, R2, …). Rows are conditions then actions. Use `Y` (yes/true), `N` (no/false), a specific value, or `-` (don't care / irrelevant for this rule).

For N conditions, the table should contain 2^N rules or justify any collapsed rules in the Simplification Notes section.

|    | R1 | R2 | R3 | R4 | R5 | R6 | R7 | R8 |
| -- | -- | -- | -- | -- | -- | -- | -- | -- |
| **C1** | Y | Y | Y | Y | N | N | N | N |
| **C2** | Y | Y | N | N | Y | Y | N | N |
| **C3** | Y | N | Y | N | Y | N | Y | N |
| **A1** | X |   |   |   |   |   |   |   |
| **A2** |   | X | X |   | X |   |   |   |
| **A3** |   |   |   | X |   | X | X | X |

## Simplification Notes

Document any rules that were merged (collapsed) using "don't care" entries, and justify why no meaningful distinction exists between them.

| Merged Rules | Justification |
| ------------ | ------------- |
| `R5 + R6` | `C3 has no effect when C1=N and C2=Y` |

## Default Rule

State what happens when no rule matches (should be explicit, not a silent fall-through):

- Default Action: `throw UnhandledDecisionError / return default value / apply fallback action`
- Logging: `log unmatched input with all condition values for diagnosis`

## Completeness Checklist

- [ ] Total rules equal 2^N or all collapsed rules are justified in Simplification Notes
- [ ] Every rule column has at least one action marked
- [ ] No two rule columns are identical (duplicate rules indicate a modeling error)
- [ ] A default rule is defined for unmatched inputs
- [ ] Every condition is boolean-evaluable from available data at decision time
- [ ] Every action is a concrete operation traceable to code
- [ ] Evaluation order is specified and consistent with implementation
- [ ] Each rule maps to at least one test case

## How to Fill This Template

1. **Name the Decision**: What branching logic is this table formalizing? Link it to the parent use case and behavioral spec.
2. **List Conditions**: Identify all boolean-evaluable conditions that affect the outcome. Each condition becomes a row in the Rules Matrix.
3. **List Actions**: Identify all possible outcomes. Each action must be a concrete operation (return value, side effect, or exception).
4. **Build the Rules Matrix**: For N conditions, start with 2^N columns. Fill in Y/N for each condition, then mark which action(s) each rule triggers.
5. **Simplify**: Look for rules that produce identical actions regardless of one condition — merge them using `-` (don't care) and document the justification.
6. **Define the Default**: What happens when no rule matches? This must be explicit (exception, fallback, or log-and-skip).
7. **Validate**: Walk the completeness checklist. Confirm total rules equal 2^N or all collapses are justified. Every rule must have at least one action.

## Example

### Decision: Discount Calculation

**Context**: Determine the discount percentage to apply at checkout based on customer tier, order amount, and coupon usage.

**Evaluation Order**: All conditions evaluated simultaneously; first matching rule wins.

**Condition Catalog**:

| # | Condition | Type | Source | Notes |
| - | --------- | ---- | ------ | ----- |
| C1 | Customer tier is Premium | boolean | `customer.tier == PREMIUM` | Gold and above |
| C2 | Order subtotal >= $100 | boolean | `order.subtotal >= 100.00` | Pre-tax, post-items |
| C3 | Valid coupon applied | boolean | `order.couponCode != null && coupon.valid` | Coupon validated upstream |

**Action Catalog**:

| # | Action | Type | Effect | Notes |
| - | ------ | ---- | ------ | ----- |
| A1 | Apply 25% discount | return value | `discount = subtotal * 0.25` | Premium + large + coupon |
| A2 | Apply 20% discount | return value | `discount = subtotal * 0.20` | Premium + large, or premium + coupon |
| A3 | Apply 15% discount | return value | `discount = subtotal * 0.15` | Premium only, or large + coupon |
| A4 | Apply 10% discount | return value | `discount = subtotal * 0.10` | Large order, no other qualifier |
| A5 | Apply 5% discount | return value | `discount = subtotal * 0.05` | Coupon only |
| A6 | Apply 0% discount | return value | `discount = 0.00` | No qualifying conditions |

**Rules Matrix**:

|    | R1 | R2 | R3 | R4 | R5 | R6 | R7 | R8 |
| -- | -- | -- | -- | -- | -- | -- | -- | -- |
| **C1 Premium** | Y | Y | Y | Y | N | N | N | N |
| **C2 >= $100** | Y | Y | N | N | Y | Y | N | N |
| **C3 Coupon** | Y | N | Y | N | Y | N | Y | N |
| **A1 25%** | X |   |   |   |   |   |   |   |
| **A2 20%** |   | X | X |   |   |   |   |   |
| **A3 15%** |   |   |   | X |   |   | X |   |
| **A4 10%** |   |   |   |   | X |   |   |   |
| **A5 5%** |   |   |   |   |   |   |   |   |
| **A6 0%** |   |   |   |   |   | X |   | X |

Note: R7 (non-premium, under $100, coupon) applies A3 (15%) — coupon alone yields 5% (A5) but the example intentionally collapses this; teams should confirm the business rule.

**Default Rule**: If order state is invalid and no rule matches, throw `DiscountCalculationError` and log all condition values.

## Agent Notes

- Use this template for any branching logic with 3 or more interacting conditions; simpler logic belongs in the method spec (DES-MIC).
- Verify rule count: 3 conditions = 8 rules maximum before simplification.
- Every rule column becomes a distinct test case; generate test fixtures from each column directly.
- Mark "don't care" entries `-` only after confirming with the product owner that the condition genuinely has no effect in that combination.
- When two rules produce the same action, consider merging them with a `-` entry and documenting the simplification.
- Save finalized table to `.aiwg/architecture/decision-tables/DES-DT-{id}.md`.
