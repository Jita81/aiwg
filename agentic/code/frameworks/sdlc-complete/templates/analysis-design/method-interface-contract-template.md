# Method Interface Contract

## Metadata

- ID: DES-MIC-`id`
- Owner: `name/role/team`
- Contributors: `list`
- Reviewers: `list`
- Team: `team`
- Stakeholders: `list`
- Status: `draft/in-progress/blocked/approved/done`
- Dates: created `YYYY-MM-DD` / updated `YYYY-MM-DD` / due `YYYY-MM-DD`
- Related: UC-`id`, REQ-`id`, DES-`id`, BS-`id`, CODE-`module`, TEST-`id`

## Related Templates

- agentic/code/frameworks/sdlc-complete/templates/analysis-design/interface-contract-card.md
- agentic/code/frameworks/sdlc-complete/templates/analysis-design/decision-table-template.md
- agentic/code/frameworks/sdlc-complete/templates/analysis-design/state-machine-spec-template.md
- agentic/code/frameworks/sdlc-complete/templates/analysis-design/sequence-diagram-template.md

## Traceability

- Parent Use Case: UC-`id` — `title`
- Behavioral Spec: BS-`id`
- Component Interface Contract: IC-`id`

## Method Identity

- Class / Module: `fully qualified class or module name`
- Method Name: `methodName`
- Visibility: `public/protected/package-private/internal`
- Static: `yes/no`
- Thread Safety: `thread-safe/not-thread-safe/conditional (document condition)`
- Idempotent: `yes/no/conditional (document condition)`
- Pure Function: `yes/no` (no side effects, deterministic output)

## Method Signature

```
methodName(parameterName: Type, parameterName: Type) → ReturnType
```

### Parameters

| Name | Type | Required | Constraints | Semantics |
| ---- | ---- | -------- | ----------- | --------- |
| `paramName` | `Type` | yes/no | `range, format, null policy` | `what this parameter represents` |

### Return Value

| Type | Null Possible | Description |
| ---- | ------------- | ----------- |
| `ReturnType` | yes/no | `what the return value represents` |

## Preconditions

All conditions that must be true **before** the method is called. Violation of a precondition is a programming error (caller responsibility). Implementations may assert or throw an unchecked exception; they are not required to recover.

- `precondition 1: expressed as a boolean assertion`
- `precondition 2: expressed as a boolean assertion`

## Postconditions

All conditions that must be true **after** the method returns normally. The implementation must guarantee these hold. Postconditions define the observable contract with the caller.

- `postcondition 1: expressed as a boolean assertion referencing inputs and/or return value`
- `postcondition 2: expressed as a boolean assertion`

## Invariants

Conditions on the owning object that must hold before and after every call, regardless of outcome.

- `invariant 1: expressed as a boolean assertion on object state`
- `invariant 2: expressed as a boolean assertion on object state`

## Data Transformation

Describe the logical mapping from inputs to outputs. Use prose, pseudocode, or a mapping table — whichever communicates the transformation most clearly.

```
input → transformation step 1 → intermediate form → transformation step 2 → output
```

| Input | Transformation Rule | Output |
| ----- | ------------------- | ------ |
| `field or expression` | `rule in plain language` | `output field or value` |

## Exception Specifications

Document every exception the method may throw and the conditions that trigger each. Callers must handle or propagate all checked exceptions.

| Exception | Type | Trigger Condition | Recovery Guidance |
| --------- | ---- | ----------------- | ----------------- |
| `ExceptionName` | checked/unchecked | `condition that causes this exception` | `what the caller should do` |

## Side Effects

List every observable effect beyond the return value. Write `none` if the method is pure.

| Effect | Condition | Reversible |
| ------ | --------- | ---------- |
| `what changes` | `when it changes` | yes/no |

## Performance Characteristics

| Characteristic | Value | Notes |
| -------------- | ----- | ----- |
| Time complexity | `O(n)` | `what n represents` |
| Space complexity | `O(n)` | `what n represents` |
| I/O calls | `count or none` | `database, network, disk` |
| Caching | `none/result cached/reads cache` | `cache key, TTL` |
| Maximum safe call frequency | `N/sec or unbounded` | `throttling consideration` |

## Completeness Checklist

- [ ] Method signature is complete: all parameters typed and named, return type specified
- [ ] Every parameter has a row in the Parameters table with null policy stated
- [ ] At least one precondition is specified (or explicitly `none` with justification)
- [ ] At least one postcondition is specified
- [ ] All invariants of the owning class affected by this method are listed
- [ ] Data transformation is described clearly enough to implement without ambiguity
- [ ] Every exception the method may throw is listed with its trigger condition
- [ ] Side effects section is present (even if `none`)
- [ ] Thread safety and idempotency are explicitly stated

## How to Fill This Template

1. **Identify the Method**: Specify the class/module, method name, visibility, and behavioral properties (thread safety, idempotency, purity).
2. **Write the Signature**: Use language-neutral notation: `methodName(param: Type) → ReturnType`. Document every parameter with constraints and null policy.
3. **Define Preconditions**: What must be true before the method is called? These are the caller's responsibility — violations are programming errors.
4. **Define Postconditions**: What must be true after the method returns normally? These are the implementer's guarantee.
5. **Define Invariants**: What object-level conditions must hold before and after every call?
6. **Describe the Transformation**: Explain how inputs map to outputs. Use pseudocode or a mapping table — whichever is clearer.
7. **List Exceptions**: Every exception the method may throw, its trigger condition, and what the caller should do about it.
8. **List Side Effects**: Every observable effect beyond the return value. Write `none` if the method is pure.
9. **Estimate Performance**: Time/space complexity, I/O calls, caching behavior. This informs callers and testers.
10. **Validate**: Walk the completeness checklist. Every parameter needs a row; every exception needs a trigger; side effects must be explicit.

## Example

### Method: `calculateOrderTotal`

**Context**: `OrderPricingService` computes the final payable amount for an order, applying discounts and taxes.

**Method Signature**:

```
calculateOrderTotal(order: Order, pricingContext: PricingContext) → Money
```

**Parameters**:

| Name | Type | Required | Constraints | Semantics |
| ---- | ---- | -------- | ----------- | --------- |
| order | Order | yes | `order.id != null; order.lineItems not empty` | The order to price |
| pricingContext | PricingContext | yes | `pricingContext.taxLocale != null` | Tax jurisdiction and discount rules |

**Return Value**:

| Type | Null Possible | Description |
| ---- | ------------- | ----------- |
| Money | no | Final amount the customer owes, in the order's currency, rounded to 2 decimal places |

**Preconditions**:

- `order != null`
- `order.lineItems.size() > 0`
- `order.currency != null`
- `pricingContext != null`
- `pricingContext.taxLocale != null`
- All `lineItem.unitPrice.currency == order.currency`

**Postconditions**:

- `result.amount >= 0`
- `result.currency == order.currency`
- `result.amount == sum(lineItem.unitPrice * lineItem.quantity) - appliedDiscount + applicableTax`
- `order` object is not mutated (read-only operation)

**Invariants**:

- `pricingService.discountRules` is not modified by this call
- `pricingService.taxRates` is not modified by this call

**Data Transformation**:

```
1. Compute subtotal: sum(lineItem.unitPrice * lineItem.quantity) for all lineItems
2. Apply discount: subtotal - discountAmount (from PricingContext.discountRules, evaluated per DES-DT-{id})
3. Compute tax: discountedSubtotal * taxRate (from PricingContext.taxLocale)
4. Round result: round(discountedSubtotal + tax, scale=2, mode=HALF_UP)
5. Return: Money(amount=roundedTotal, currency=order.currency)
```

| Input | Transformation Rule | Output |
| ----- | ------------------- | ------ |
| `lineItems` | sum of `unitPrice * quantity` per item | `subtotal` |
| `subtotal, discountRules` | lookup in DES-DT-{id} and subtract | `discountedSubtotal` |
| `discountedSubtotal, taxLocale` | multiply by tax rate from locale table | `taxAmount` |
| `discountedSubtotal + taxAmount` | round HALF_UP to 2 decimal places | `Money result` |

**Exception Specifications**:

| Exception | Type | Trigger Condition | Recovery Guidance |
| --------- | ---- | ----------------- | ----------------- |
| `CurrencyMismatchException` | unchecked | Any `lineItem.unitPrice.currency != order.currency` | Caller must normalize currencies before calling |
| `TaxLocaleNotFoundException` | checked | `pricingContext.taxLocale` not found in tax rate table | Caller should fallback to default locale or surface error to user |
| `PricingRuleException` | checked | Discount rules evaluation produces negative result | Caller should log and apply 0% discount as safe fallback |

**Side Effects**: none (pure computation; no persistence, no events emitted)

**Performance Characteristics**:

| Characteristic | Value | Notes |
| -------------- | ----- | ----- |
| Time complexity | O(n) | n = number of line items |
| Space complexity | O(1) | No intermediate collections retained |
| I/O calls | 1 (cached) | Tax rate lookup reads from in-memory cache; cache TTL = 1 hour |
| Caching | reads cache | Cache key = `taxLocale.code`; populated by `TaxRateLoader` on startup |
| Maximum safe call frequency | unbounded | Read-only, no I/O under normal operation |

## Agent Notes

- Create one DES-MIC per method being formally specified; do not bundle multiple methods into one document.
- This template applies design-by-contract semantics (Hoare logic), not HTTP API contracts — use DES-IFC for service-level contracts.
- Preconditions are the caller's responsibility; postconditions are the implementer's guarantee.
- Derive unit tests directly: one test per precondition violation (assert exception), one per postcondition, one per exception trigger, one per side effect.
- If the data transformation requires branching logic with 3 or more interacting conditions, extract it to a DES-DT and reference it.
- If the method modifies entity state, reference the governing DES-SM for valid transition rules.
- Save finalized contract to `.aiwg/architecture/method-contracts/DES-MIC-{id}.md`.
