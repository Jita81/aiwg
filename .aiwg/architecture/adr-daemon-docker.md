# ADR: Daemon Runs Inside a Single Docker Container

## Status

**PROPOSED**

## Date

2026-03-25

## Context

The daemon executes long-running agent loops with access to provider credentials, the local file system, and potentially network services. Running this process directly on the host raises security concerns: a compromised agent loop has full access to the operator's environment. Security isolation is a stated requirement for the daemon headend.

Docker is already present in the development environment and is the established mechanism for process isolation in AIWG's existing toolchain. The question is how to structure the container boundary.

## Decision

The entire daemon runs inside a single Docker container. No daemon components execute on the host outside the container.

Mount strategy:

| Host path | Container path | Mode |
|-----------|----------------|------|
| Project directory | `/workspace` | read-write |
| `~/.config/` (provider credentials) | `/run/secrets/config` | read-only |

The Web UI is exposed via port mapping (`-p 3000:3000` by default, configurable in `daemon.yaml`).

A `ContainerManager` class owns the full container lifecycle: image pull, `docker run` invocation with the correct mount and port arguments, health checks, and `docker stop` on daemon shutdown. Operators interact with `ContainerManager` through CLI commands; they do not invoke `docker` directly for routine operation.

The container image is published alongside framework releases and referenced by digest in `daemon.yaml` to ensure reproducibility.

## Alternatives Considered

1. **Split mode: daemon on host, agent subprocesses in containers** -- Each agent loop spawns in its own container via `docker exec` or `docker run`. Rejected because it adds 2-5 seconds of container startup latency per loop, complicates credential injection (each container needs its own secret mount), and requires `ContainerManager` to manage an unbounded number of container lifecycles simultaneously. The single-container model is simpler and provides equivalent isolation for the common case.

2. **No Docker support; bare-metal only** -- Simplest implementation path. Rejected because security isolation is a key requirement. Without a container boundary, a misbehaving agent loop can read any file the operator's user account can access, including SSH keys and other credentials adjacent to `~/.config/`.

3. **Rootless Podman** -- Drop-in Docker alternative with better default security posture (no root daemon). Not rejected on principle; deferred. `ContainerManager` will abstract the container runtime so Podman support can be added later without an ADR revision.

## Consequences

**Positive:**
- Agent loops are isolated from the host file system except for explicitly mounted paths
- Provider credentials are mounted read-only, limiting blast radius of a compromised loop
- Reproducible image digest prevents silent runtime drift between environments
- `ContainerManager` encapsulates all Docker complexity; operators do not need Docker knowledge for routine use

**Negative:**
- Docker is now a runtime dependency; operators without Docker installed cannot run the daemon in its default configuration (bare-metal fallback is possible but unsupported)
- Volume mounts on macOS with Docker Desktop have known I/O performance overhead for large file trees; operators with very large workspaces may notice latency
- Single container means a daemon crash takes down all loops simultaneously (mitigated by crash-resilient state files and `DaemonSupervisor` restart logic)

## References

- Issue #512
- RFC: `.aiwg/planning/rfc-daemon-behaviors.md`
- ADR: `adr-daemon-as-headend.md` — DaemonSupervisor and restart resilience
- ADR: `adr-native-web-operator-interface.md` — Web UI port mapping context
