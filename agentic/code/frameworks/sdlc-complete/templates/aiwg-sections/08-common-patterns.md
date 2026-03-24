## Common Patterns

**Risk Management** (run weekly or when risks identified):

```bash
# Natural language
User: "Update risks with focus on technical debt"

# Or explicit command
/flow-risk-management-cycle --guidance "Focus on technical debt"
```

**Architecture Evolution** (when architecture changes needed):

```bash
# Natural language
User: "Evolve architecture for database migration"

# Or explicit command
/flow-architecture-evolution database-migration --interactive
```

**Security Review** (before each phase gate):

```bash
# Natural language
User: "Run security review for SOC2 audit prep"

# Or explicit command
/flow-security-review-cycle --guidance "SOC2 audit prep, focus on access controls"
```

**Test Execution** (run continuously in Construction):

```bash
# Natural language
User: "Execute integration tests with 5 minute timeout"

# Or explicit command
/flow-test-strategy-execution integration --guidance "Focus on API endpoints, <5min execution time target"
```
