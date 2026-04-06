# Data Structure Specification

## Metadata

- ID: DES-DSS-`id`
- Owner: `name/role/team`
- Contributors: `list`
- Reviewers: `list`
- Team: `team`
- Stakeholders: `list`
- Status: `draft/in-progress/blocked/approved/done`
- Dates: created `YYYY-MM-DD` / updated `YYYY-MM-DD` / due `YYYY-MM-DD`
- Related: UC-`id`, REQ-`id`, DES-`id`, BS-`id`, IC-`id`, PSC-`id`, CODE-`module`, TEST-`id`

## Related Templates

- agentic/code/frameworks/sdlc-complete/templates/analysis-design/pseudocode-spec-template.md
- agentic/code/frameworks/sdlc-complete/templates/analysis-design/method-interface-contract-template.md
- agentic/code/frameworks/sdlc-complete/templates/analysis-design/data-flow-spec-template.md
- agentic/code/frameworks/sdlc-complete/templates/analysis-design/database-design-template.md

## Traceability

- Parent Use Case: UC-`id` — `title`
- Behavioral Spec: BS-`id`
- Interface Contracts: DES-MIC-`id`, DES-MIC-`id`
- Pseudo-Code Specs: DES-PSC-`id`
- Database Design: DES-DB-`id` (if persisted)

## Structure Identity

- Name: `StructureName`
- Kind: `entity / value object / DTO / event / aggregate root / enum`
- Immutable: `yes/no/partially (list mutable fields)`
- Scope: `internal (module-private) / shared (cross-module) / external (API boundary)`
- Persistence: `transient / persisted (table/collection) / serialized (JSON/Protobuf/Avro)`
- Versioning: `none / semantic (v1, v2) / schema-registry`

## Structure Definition

```pseudo
STRUCTURE StructureName
  fieldName: Type                  -- description
  fieldName: Type?                 -- nullable, description
  fieldName: Type = defaultValue   -- default, description
END STRUCTURE
```

## Field Catalog

| Field | Type | Required | Default | Constraints | Semantics | Sensitivity |
| ----- | ---- | -------- | ------- | ----------- | --------- | ----------- |
| `fieldName` | `Type` | yes/no | `value or none` | `range, format, length, pattern, FK` | `what this field represents` | `public/internal/PII` |

## Invariants

Conditions that must hold whenever an instance of this structure exists. Violations indicate a construction error or corruption.

- `invariant 1: expressed as a boolean assertion over fields`
- `invariant 2: expressed as a boolean assertion over fields`

## Construction Rules

How instances of this structure are created. Every construction path must guarantee all invariants hold.

| Constructor / Factory | Parameters | Validation | Invariants Established |
| --------------------- | ---------- | ---------- | ---------------------- |
| `constructorName(params)` | `required params` | `what is checked` | `which invariants are guaranteed` |

## Operations

Methods or functions that operate on this structure. Each row should reference a DES-MIC for the full contract.

| Operation | Signature | Mutating | Complexity | Contract |
| --------- | --------- | -------- | ---------- | -------- |
| `operationName` | `(params) → ReturnType` | yes/no | `O(n)` | DES-MIC-`id` |

## Relationships

| Related Structure | Relationship | Cardinality | Navigation | Notes |
| ----------------- | ------------ | ----------- | ---------- | ----- |
| `OtherStructure` | `contains / references / extends / implements` | `1:1 / 1:N / N:M` | `unidirectional / bidirectional` | `ownership, lifecycle` |

## Serialization Format

How this structure is represented when crossing boundaries (API, storage, messaging).

| Format | Schema | Fields Included | Fields Excluded | Notes |
| ------ | ------ | --------------- | --------------- | ----- |
| JSON (API) | `path to JSON schema or inline` | `list or "all"` | `internal fields, computed fields` | `camelCase keys` |
| SQL (persistence) | `table: tableName` | `list or "all"` | `computed fields` | `snake_case columns` |
| Protobuf (messaging) | `path to .proto` | `list or "all"` | `N/A` | `field numbers stable` |

## Equality and Hashing

- Equality semantics: `identity (reference) / value (all fields) / natural key (subset of fields)`
- Key fields for equality: `field1, field2`
- Hash function: `based on key fields / framework default`
- Comparable: `yes (natural ordering by field) / no`

## Completeness Checklist

- [ ] Every field has a row in the Field Catalog with type, constraints, and semantics
- [ ] At least one invariant is specified (or explicitly `none` with justification)
- [ ] Every construction path guarantees all invariants
- [ ] Every operation references a DES-MIC or is trivial (getter/setter)
- [ ] Serialization formats cover all boundary crossings (API, storage, messaging)
- [ ] Equality and hashing semantics are explicitly defined
- [ ] Nullable fields are marked with `?` in the structure definition
- [ ] PII fields are identified in the Sensitivity column
- [ ] Relationships specify cardinality and navigation direction

## How to Fill This Template

1. **Name and Classify**: Give the structure a name and identify its kind (entity, DTO, value object, etc.). This determines its lifecycle and equality semantics.
2. **Write the Definition**: Use the pseudo-code `STRUCTURE` notation. List every field with its type, nullability, and default value.
3. **Fill the Field Catalog**: One row per field. Every field needs constraints (even if "none") and sensitivity classification.
4. **Define Invariants**: What must always be true about a valid instance? These become runtime assertions and test conditions.
5. **Document Construction**: How are instances created? Every factory or constructor must guarantee invariants hold after creation.
6. **List Operations**: What can be done with this structure? Reference DES-MIC for each non-trivial operation.
7. **Map Relationships**: How does this structure relate to others? Specify cardinality and navigation.
8. **Define Serialization**: How is this structure represented at each boundary? Different consumers may see different subsets of fields.
9. **Define Equality**: How are two instances compared? This affects collections, caching, and deduplication.
10. **Validate**: Walk the completeness checklist. Every field documented; every invariant testable; every boundary crossing has a serialization spec.

## Example

### Structure: Order

**Kind**: Aggregate root (domain entity with identity).
**Immutable**: Partially — `id`, `customerId`, `createdAt` are immutable; other fields change with state transitions.
**Persistence**: Persisted in `orders` table (PostgreSQL).

```pseudo
STRUCTURE Order
  id: OrderId                         -- unique identifier (UUIDv7, immutable)
  customerId: CustomerId              -- owning customer (immutable)
  status: OrderStatus                 -- current lifecycle state (see DES-SM-001)
  lineItems: List<LineItem>           -- ordered products (1..N)
  subtotal: Money                     -- sum of line item totals
  discount: Money = Money(0)          -- applied discount amount
  tax: Money = Money(0)               -- computed tax amount
  total: Money                        -- subtotal - discount + tax
  paymentId: PaymentId?               -- set after payment authorized
  trackingNumber: String?             -- set after shipment
  createdAt: Timestamp                -- creation time (immutable)
  updatedAt: Timestamp                -- last modification time
  cancelledAt: Timestamp?             -- set if cancelled
END STRUCTURE
```

**Field Catalog**:

| Field | Type | Required | Default | Constraints | Semantics | Sensitivity |
| ----- | ---- | -------- | ------- | ----------- | --------- | ----------- |
| id | OrderId (UUIDv7) | yes | generated | unique, immutable | Primary identifier | internal |
| customerId | CustomerId (UUIDv7) | yes | none | FK to customers table, immutable | Owning customer | internal |
| status | OrderStatus (enum) | yes | DRAFT | one of: DRAFT, SUBMITTED, PROCESSING, SHIPPED, DELIVERED, CANCELLED, ARCHIVED | Lifecycle state per DES-SM-001 | internal |
| lineItems | List\<LineItem\> | yes | none | size >= 1 | Products in the order | internal |
| subtotal | Money | yes | none | >= 0, currency matches order currency | Sum of lineItem.unitPrice * quantity | internal |
| discount | Money | no | Money(0) | >= 0, <= subtotal | Applied discount | internal |
| tax | Money | no | Money(0) | >= 0 | Computed tax amount | internal |
| total | Money | yes | none | >= 0, == subtotal - discount + tax | Final payable amount | internal |
| paymentId | PaymentId? | no | null | set only when status >= PROCESSING | Payment authorization reference | internal |
| trackingNumber | String? | no | null | set only when status >= SHIPPED | Carrier tracking number | internal |
| createdAt | Timestamp | yes | now() | immutable, ISO 8601 UTC | When order was created | internal |
| updatedAt | Timestamp | yes | now() | >= createdAt, ISO 8601 UTC | Last modification time | internal |
| cancelledAt | Timestamp? | no | null | set iff status == CANCELLED | When order was cancelled | internal |

**Invariants**:

- `lineItems.size() >= 1` (an order must have at least one item)
- `total == subtotal - discount + tax` (total is always consistent)
- `discount <= subtotal` (discount cannot exceed subtotal)
- `createdAt <= updatedAt` (temporal ordering)
- `cancelledAt != null iff status == CANCELLED`
- `paymentId != null iff status in {PROCESSING, SHIPPED, DELIVERED, ARCHIVED}`
- `trackingNumber != null iff status in {SHIPPED, DELIVERED, ARCHIVED}`

**Construction Rules**:

| Constructor / Factory | Parameters | Validation | Invariants Established |
| --------------------- | ---------- | ---------- | ---------------------- |
| `Order.create(customerId, lineItems)` | customerId (required), lineItems (1..N) | lineItems not empty; all items have valid SKU and quantity > 0 | id generated, status = DRAFT, subtotal computed, total = subtotal, timestamps set |

**Operations**:

| Operation | Signature | Mutating | Complexity | Contract |
| --------- | --------- | -------- | ---------- | -------- |
| addLineItem | `(item: LineItem) → void` | yes | O(1) | DES-MIC-010 |
| removeLineItem | `(sku: SKU) → void` | yes | O(n) | DES-MIC-011 |
| applyDiscount | `(discount: Money) → void` | yes | O(1) | DES-MIC-012 |
| submit | `() → void` | yes | O(1) | DES-MIC-013 |
| cancel | `(reason: String) → void` | yes | O(1) | DES-MIC-014 |

**Relationships**:

| Related Structure | Relationship | Cardinality | Navigation | Notes |
| ----------------- | ------------ | ----------- | ---------- | ----- |
| Customer | references | N:1 | unidirectional (Order → Customer) | Order knows its customer; customer does not hold order list |
| LineItem | contains | 1:N | unidirectional (Order → LineItems) | Lifecycle bound to Order |
| Payment | references | 1:1 | unidirectional (Order → Payment) | Set after authorization |

**Serialization (JSON API)**:

| Format | Schema | Fields Included | Fields Excluded | Notes |
| ------ | ------ | --------------- | --------------- | ----- |
| JSON (API response) | OpenAPI `OrderResponse` | id, status, lineItems, subtotal, discount, tax, total, trackingNumber, createdAt | customerId (caller context), paymentId (internal), updatedAt, cancelledAt | camelCase keys |
| SQL (persistence) | table `orders` | all fields | none | snake_case columns, lineItems in separate table |

**Equality and Hashing**:

- Equality: identity-based (two Orders are equal iff `id` matches)
- Key fields: `id`
- Hash: `id.hashCode()`
- Comparable: yes, natural ordering by `createdAt` descending

## Agent Notes

- Create one DES-DSS per data structure; do not combine multiple structures into one document.
- Value objects should have value-based equality; entities should have identity-based equality. Getting this wrong causes subtle bugs in collections and caching.
- Every invariant becomes a test assertion: write a test that constructs a valid instance, then verify each invariant holds.
- Construction rules are the first line of defense for invariants — if the constructor allows an invalid state, invariants are meaningless.
- When a structure crosses a serialization boundary (API, storage, messaging), document what fields are included and excluded. Fields excluded at the API boundary for security must be explicitly noted.
- Save finalized spec to `.aiwg/architecture/data-structures/DES-DSS-{id}.md`.
