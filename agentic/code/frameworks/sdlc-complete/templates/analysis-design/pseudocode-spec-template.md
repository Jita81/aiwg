# Pseudo-Code Specification

## Metadata

- ID: DES-PSC-`id`
- Owner: `name/role/team`
- Contributors: `list`
- Reviewers: `list`
- Team: `team`
- Stakeholders: `list`
- Status: `draft/in-progress/blocked/approved/done`
- Dates: created `YYYY-MM-DD` / updated `YYYY-MM-DD` / due `YYYY-MM-DD`
- Related: UC-`id`, REQ-`id`, DES-`id`, BS-`id`, IC-`id`, PC-`id`, CODE-`module`, TEST-`id`
- Links: `paths/urls`

## Related Templates

- agentic/code/frameworks/sdlc-complete/templates/analysis-design/interface-contract-card.md
- agentic/code/frameworks/sdlc-complete/templates/analysis-design/component-design-card.md
- agentic/code/frameworks/sdlc-complete/templates/analysis-design/sequence-diagram-template.md
- agentic/code/frameworks/sdlc-complete/templates/requirements/use-case-acceptance-template.md

## Traceability

- Use Case: UC-`id` — `title`
- Behavioral Spec: BS-`id`
- Interface Contract: IC-`id`
- Source Code: `src/{path}`
- Tests: `test/{path}`

## Signature

```text
FUNCTION {name}({param}: {type}, {param}: {type}) → {return_type}
```

## Preconditions

- {condition that must be true before this function is called}
- {condition_2}

## Postconditions

- {condition that must be true when this function returns successfully}
- {condition_2}

## Algorithm

```pseudo
FUNCTION processOrder(order: Order) → Result
  VALIDATE order.items IS NOT EMPTY
    ON FAILURE: RETURN Error("empty order")

  SET total ← 0
  FOR EACH item IN order.items
    SET price ← lookupPrice(item.sku)
    VALIDATE price IS NOT NULL
      ON FAILURE: RETURN Error("unknown SKU: {item.sku}")
    SET total ← total + (price × item.quantity)
  END FOR

  IF order.coupon IS NOT NULL
    SET discount ← applyCoupon(order.coupon, total)
    SET total ← total - discount
  END IF

  SET transaction ← chargePayment(order.paymentMethod, total)
  VALIDATE transaction.success
    ON FAILURE: RETURN Error("payment failed: {transaction.reason}")

  RETURN Success(orderId: generateId(), total: total)
END FUNCTION
```

## Error Handling Tree

| Exception | Handler | Recovery |
|-----------|---------|----------|
| {exception} | {handler action} | {recovery strategy} |

## Data Structures

```pseudo
STRUCTURE {Name}
  {field}: {type}
  {field}: {type}? (nullable)
END STRUCTURE
```

## Invariants

- {invariant that must hold throughout execution}

## Concurrency Notes

{None / mutex requirements / async boundaries}

## Completeness Checklist

- [ ] Every branch in behavioral spec has corresponding pseudo-code path
- [ ] Every exception in interface contract has an error handling entry
- [ ] Data structures match interface contract types
- [ ] Algorithm is walkable by a non-programmer domain expert
- [ ] All VALIDATE blocks have ON FAILURE handlers
- [ ] Preconditions and postconditions match interface contract

## How to Fill This Template

1. **Start from the Interface Contract**: Read the parent DES-MIC. The method signature, preconditions, postconditions, and exception specs define what your pseudo-code must accomplish.
2. **Write the Signature**: Copy the function signature from the interface contract, using the pseudo-code notation (`FUNCTION name(param: Type) → ReturnType`).
3. **Copy Preconditions and Postconditions**: These come directly from the DES-MIC. Every precondition becomes a `VALIDATE` block at the start of the algorithm.
4. **Write the Algorithm**: Express the logic step-by-step using the pseudo-code keywords (`SET`, `FOR EACH`, `IF`, `VALIDATE`, `RETURN`). Keep it language-neutral — no syntax from any specific programming language.
5. **Fill the Error Handling Tree**: For every `VALIDATE ... ON FAILURE` block and every exception in the interface contract, add a row mapping exception → handler → recovery strategy.
6. **Define Data Structures**: Document any intermediate data structures the algorithm creates or consumes using the `STRUCTURE` notation.
7. **State Invariants**: Conditions that must hold throughout execution (not just pre/post).
8. **Note Concurrency**: If the algorithm touches shared state or crosses async boundaries, document mutex requirements or await points.
9. **Validate**: Walk the completeness checklist. Every behavioral spec branch must have a pseudo-code path; every interface contract exception must have a handler.

## Ownership & Collaboration

- Document Owner: Architecture Designer
- Contributor Roles: Requirements Analyst (verification against use cases), Domain Expert (business logic validation)
- Automation Inputs: Behavioral spec (BS-`id`), Interface contract (IC-`id`), Decision tables (DT-`id`)
- Automation Outputs: `pseudocode-spec-{id}.md` with walkable algorithm

## Agent Notes

- Generate pseudo-code from behavioral spec sequence + interface contract preconditions/postconditions
- Every VALIDATE block must correspond to a precondition or error in the interface contract
- Use consistent indentation (2 spaces per nesting level)
- Keep functions under 30 lines of pseudo-code; decompose larger algorithms into sub-functions with their own specs
- Cross-reference decision tables for branching logic (IF/SWITCH blocks)
- Verify the Automation Outputs entry is satisfied before signaling completion
