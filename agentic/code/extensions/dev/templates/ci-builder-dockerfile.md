# CI Builder Dockerfile: {project_name}

**Base Image**: {base_image}
**Purpose**: Self-contained CI builder for {project_name}
**Registry**: {registry_url}/{image_name}:{tag}
**Last Updated**: {date}

---

## Dockerfile

```dockerfile
# ci/Dockerfile.builder
# Self-contained CI builder for {project_name}
# All build dependencies are pinned in this image.
# No external repos are fetched at build time.

FROM {base_image} AS builder

LABEL maintainer="{maintainer}"
LABEL description="CI builder for {project_name}"
LABEL version="{builder_version}"

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    {system_packages} \
    && rm -rf /var/lib/apt/lists/*

# Language toolchain
{toolchain_install_commands}

# Project dependencies (cached layer)
WORKDIR /workspace
COPY {dependency_files} ./
RUN {dependency_install_command}

# Default entrypoint for CI
ENTRYPOINT ["{entrypoint}"]
CMD ["{default_cmd}"]
```

---

## Build and Push

```bash
# Build the CI builder image
docker build -f ci/Dockerfile.builder -t {registry_url}/{image_name}:{tag} .

# Push to registry
docker push {registry_url}/{image_name}:{tag}

# Tag as latest (after verification)
docker tag {registry_url}/{image_name}:{tag} {registry_url}/{image_name}:latest
docker push {registry_url}/{image_name}:latest
```

---

## Usage in CI

```yaml
# In your workflow file
jobs:
  build:
    runs-on: {runner}
    container:
      image: {registry_url}/{image_name}:{tag}
    steps:
      - uses: actions/checkout@v4
      - run: {build_command}
      - run: {test_command}
```

---

## Update Procedure

1. Modify `ci/Dockerfile.builder`
2. Build and test locally: `docker build -f ci/Dockerfile.builder -t {image_name}:test .`
3. Run project tests inside the builder: `docker run --rm -v $(pwd):/workspace {image_name}:test {test_command}`
4. Push with new version tag
5. Update workflow to reference new tag

---

## Pinned Versions

| Dependency | Version | Pin Reason |
|-----------|---------|-----------|
| {dep_name} | {dep_version} | {reason} |

---

## Notes

{additional_notes}
