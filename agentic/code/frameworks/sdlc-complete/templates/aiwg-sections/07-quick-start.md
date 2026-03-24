## Quick Start

1. **Initialize Project**:

   ```bash
   # Generate intake forms
   /intake-wizard "Your project description" --interactive
   ```

2. **Start Inception**:

   ```bash
   # Validate intake and kick off Inception
   /intake-start .aiwg/intake/

   # Execute Concept → Inception workflow
   /flow-concept-to-inception .
   ```

3. **Check Status**:

   ```bash
   # View current phase and next steps
   /project-status
   ```

4. **Progress Through Phases**:

   ```bash
   # When Inception complete, transition to Elaboration
   /flow-gate-check inception  # Validate gate criteria
   /flow-inception-to-elaboration  # Transition phase
   ```
