---
name: rhl-docker-sbom
description: Inspect and verify multi-stage Docker build caching and SBOM generation across RHL production images.
---

# RHL Docker Multi-Stage SBOM Verification

Use this skill to inspect, validate, and verify that Docker multi-stage builds correctly leverage layer caching for base dependencies and inject up-to-date SBOM metadata (`/sbom-node.json`) on commit changes.

## Verification Tool

The skill includes a dedicated verification CLI:

```bash
# Verify backend-api Dockerfile SBOM caching
bun run scripts/verify_docker_sbom_caching.ts

# Test worker target stage
bun run scripts/verify_docker_sbom_caching.ts -t worker

# Specify custom Dockerfile and build context
bun run scripts/verify_docker_sbom_caching.ts -f workspaces/sync-monorepo-to-external/Dockerfile
```

## Key Invariants Checked
1. **Base Cache Hit**: `sbom-base` layer is cached when dependency files (`yarn.lock`, `package.json`) remain unchanged.
2. **Dynamic Stamp**: `sbom-stamped` layer dynamically recompiles when `COMMIT_SHA` changes.
3. **Artifact Integrity**: `/sbom-node.json` inside the built container contains valid JSON metadata with matching commit SHA and package descriptors.
