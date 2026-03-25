# CI Builder Workflow: {project_name}

**Platform**: {platform} (GitHub Actions / Gitea Actions)
**Builder Image**: {registry_url}/{image_name}:{tag}
**Last Updated**: {date}

---

## Workflow File

```yaml
# .github/workflows/ci.yml  (or .gitea/workflows/ci.yml)
name: CI

on:
  push:
    branches: [{push_branches}]
  pull_request:
    branches: [{pr_branches}]
  workflow_dispatch:

env:
  CI_BUILDER: {registry_url}/{image_name}:{tag}

jobs:
  build:
    name: Build
    runs-on: {runner}
    container:
      image: ${{{{ env.CI_BUILDER }}}}
      credentials:
        username: ${{{{ secrets.REGISTRY_USER }}}}
        password: ${{{{ secrets.REGISTRY_TOKEN }}}}
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install dependencies
        run: {install_command}

      - name: Build
        run: {build_command}

      - name: Upload build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: build-output
          path: {build_artifact_path}

  test:
    name: Test
    needs: build
    runs-on: {runner}
    container:
      image: ${{{{ env.CI_BUILDER }}}}
      credentials:
        username: ${{{{ secrets.REGISTRY_USER }}}}
        password: ${{{{ secrets.REGISTRY_TOKEN }}}}
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install dependencies
        run: {install_command}

      - name: Run tests
        run: {test_command}

      - name: Upload coverage
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: {coverage_path}

  lint:
    name: Lint
    runs-on: {runner}
    container:
      image: ${{{{ env.CI_BUILDER }}}}
      credentials:
        username: ${{{{ secrets.REGISTRY_USER }}}}
        password: ${{{{ secrets.REGISTRY_TOKEN }}}}
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install dependencies
        run: {install_command}

      - name: Lint
        run: {lint_command}

  deploy:
    name: Deploy
    needs: [build, test, lint]
    if: github.ref == 'refs/heads/{deploy_branch}' && github.event_name == 'push'
    runs-on: {runner}
    environment: {deploy_environment}
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Deploy
        run: {deploy_command}
        env:
          DEPLOY_TOKEN: ${{{{ secrets.DEPLOY_TOKEN }}}}
```

---

## Builder Image Update Workflow

```yaml
# .github/workflows/builder.yml
name: Update CI Builder

on:
  push:
    paths:
      - 'ci/Dockerfile.builder'
    branches: [main]
  workflow_dispatch:

jobs:
  build-builder:
    name: Build and Push CI Builder
    runs-on: {runner}
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Login to registry
        uses: docker/login-action@v3
        with:
          registry: {registry_host}
          username: ${{{{ secrets.REGISTRY_USER }}}}
          password: ${{{{ secrets.REGISTRY_TOKEN }}}}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          file: ci/Dockerfile.builder
          push: true
          tags: |
            {registry_url}/{image_name}:${{{{ github.sha }}}}
            {registry_url}/{image_name}:latest
```

---

## Required Secrets

| Secret | Purpose |
|--------|---------|
| `REGISTRY_USER` | Container registry username |
| `REGISTRY_TOKEN` | Container registry access token |
| `DEPLOY_TOKEN` | Deployment credential (deploy job only) |

---

## Customization Points

| Variable | Description | Default |
|----------|-------------|---------|
| `{runner}` | Runner label | `ubuntu-latest` |
| `{install_command}` | Dependency install | `npm ci` |
| `{build_command}` | Build step | `npm run build` |
| `{test_command}` | Test step | `npm test` |
| `{lint_command}` | Lint step | `npm run lint` |
| `{deploy_command}` | Deploy step | Project-specific |

---

## Notes

{additional_notes}
