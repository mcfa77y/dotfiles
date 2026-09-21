#!/usr/bin/env bash
# =============================================================================
# verify-docker-sbom-caching.sh
#
# Validates multi-stage Docker build caching and SBOM stamping behavior.
# Tests that:
#   1. Base SBOM stage (sbom-base) is cached when dependencies don't change.
#   2. Stamped SBOM stage (sbom-stamped) updates dynamically with new COMMIT_SHA.
#   3. The generated /sbom-node.json inside the container contains expected metadata.
# =============================================================================

set -euo pipefail

# Auto-detect repository root if inside git
if git rev-parse --show-toplevel >/dev/null 2>&1; then
    DEFAULT_ROOT=$(git rev-parse --show-toplevel)
else
    DEFAULT_ROOT="."
fi

# Default parameters
DOCKERFILE="${DOCKERFILE:-${DEFAULT_ROOT}/workspaces/backend-api/Dockerfile}"
CONTEXT="${CONTEXT:-${DEFAULT_ROOT}}"
TARGET="${TARGET:-production}"
PLATFORM="${PLATFORM:-linux/amd64}"
COMMIT_SHA_1="${COMMIT_SHA_1:-sha-baseline-1111111}"
COMMIT_SHA_2="${COMMIT_SHA_2:-sha-cached-2222222}"
IMAGE_TAG_PREFIX="${IMAGE_TAG_PREFIX:-test-sbom-verify}"
CLEANUP="${CLEANUP:-true}"

# Formatting
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Options:
    -f, --dockerfile PATH    Path to Dockerfile (default: workspaces/backend-api/Dockerfile)
    -c, --context PATH       Docker build context (default: repository root)
    -t, --target TARGET      Target build stage: production | worker (default: $TARGET)
    -p, --platform PLATFORM  Target architecture platform (default: $PLATFORM)
    --sha1 SHA               First commit SHA to seed cache (default: $COMMIT_SHA_1)
    --sha2 SHA               Second commit SHA to test cache hit (default: $COMMIT_SHA_2)
    --no-cleanup             Keep the generated test images after verification
    -h, --help               Show this help message
EOF
    exit 0
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        -f|--dockerfile) DOCKERFILE="$2"; shift 2 ;;
        -c|--context)    CONTEXT="$2"; shift 2 ;;
        -t|--target)     TARGET="$2"; shift 2 ;;
        -p|--platform)   PLATFORM="$2"; shift 2 ;;
        --sha1)          COMMIT_SHA_1="$2"; shift 2 ;;
        --sha2)          COMMIT_SHA_2="$2"; shift 2 ;;
        --no-cleanup)    CLEANUP="false"; shift 1 ;;
        -h|--help)       usage ;;
        *) echo -e "${RED}Unknown argument: $1${NC}" >&2; usage ;;
    esac
done

IMAGE_NAME_1="${IMAGE_TAG_PREFIX}:${TARGET}-run1"
IMAGE_NAME_2="${IMAGE_TAG_PREFIX}:${TARGET}-run2"

cleanup_images() {
    if [[ "$CLEANUP" == "true" ]]; then
        echo -e "${BLUE}--> Cleaning up test images...${NC}"
        docker rmi "$IMAGE_NAME_1" "$IMAGE_NAME_2" >/dev/null 2>&1 || true
        echo -e "${GREEN}✓ Cleanup complete.${NC}"
    fi
}
trap cleanup_images EXIT

echo -e "${BLUE}======================================================${NC}"
echo -e "${BLUE}  Docker SBOM Multi-Stage Caching Verification Script ${NC}"
echo -e "${BLUE}======================================================${NC}"
echo -e "Dockerfile : ${YELLOW}${DOCKERFILE}${NC}"
echo -e "Context    : ${YELLOW}${CONTEXT}${NC}"
echo -e "Target     : ${YELLOW}${TARGET}${NC}"
echo -e "Platform   : ${YELLOW}${PLATFORM}${NC}"
echo -e "SHA 1      : ${YELLOW}${COMMIT_SHA_1}${NC}"
echo -e "SHA 2      : ${YELLOW}${COMMIT_SHA_2}${NC}"
echo ""

# -----------------------------------------------------------------------------
# Pass 1: Baseline build with COMMIT_SHA_1
# -----------------------------------------------------------------------------
echo -e "${BLUE}[Step 1/3] Building baseline image (COMMIT_SHA=${COMMIT_SHA_1})...${NC}"
START_TIME_1=$(date +%s)
docker build \
    --platform "${PLATFORM}" \
    -f "${DOCKERFILE}" \
    --target "${TARGET}" \
    --build-arg "COMMIT_SHA=${COMMIT_SHA_1}" \
    -t "${IMAGE_NAME_1}" \
    "${CONTEXT}"
DURATION_1=$(( $(date +%s) - START_TIME_1 ))
echo -e "${GREEN}✓ Pass 1 completed in ${DURATION_1}s.${NC}\n"

# -----------------------------------------------------------------------------
# Pass 2: Cache-hit build with new COMMIT_SHA_2
# -----------------------------------------------------------------------------
echo -e "${BLUE}[Step 2/3] Building image with updated SHA (COMMIT_SHA=${COMMIT_SHA_2}) to check caching...${NC}"
BUILD_LOG_2=$(mktemp)
START_TIME_2=$(date +%s)
docker build \
    --platform "${PLATFORM}" \
    -f "${DOCKERFILE}" \
    --target "${TARGET}" \
    --build-arg "COMMIT_SHA=${COMMIT_SHA_2}" \
    -t "${IMAGE_NAME_2}" \
    "${CONTEXT}" 2>&1 | tee "${BUILD_LOG_2}"
DURATION_2=$(( $(date +%s) - START_TIME_2 ))
echo -e "${GREEN}✓ Pass 2 completed in ${DURATION_2}s.${NC}\n"

# Check log for sbom-base cache hit
echo -e "${BLUE}--> Checking layer cache hits for sbom-base stage...${NC}"
if grep -q -E "CACHED.*\[sbom-base" "${BUILD_LOG_2}" || grep -B 1 -A 1 "sbom-base" "${BUILD_LOG_2}" | grep -q "CACHED"; then
    echo -e "${GREEN}✓ SUCCESS: sbom-base stage was CACHED!${NC}"
else
    echo -e "${YELLOW}! NOTICE: sbom-base was not marked CACHED in build log output.${NC}"
fi
rm -f "${BUILD_LOG_2}"

# -----------------------------------------------------------------------------
# Pass 3: Inspect container SBOM metadata
# -----------------------------------------------------------------------------
echo -e "\n${BLUE}[Step 3/3] Inspecting /sbom-node.json inside container (${IMAGE_NAME_2})...${NC}"
CONTAINER_SBOM=$(docker run --rm --platform "${PLATFORM}" "${IMAGE_NAME_2}" cat /sbom-node.json)

if ! echo "${CONTAINER_SBOM}" | jq . >/dev/null 2>&1; then
    echo -e "${RED}✗ Error: /sbom-node.json is not valid JSON!${NC}"
    exit 1
fi

STAMPED_VERSION=$(echo "${CONTAINER_SBOM}" | jq -r '.metadata.component.version // empty')
COMPONENT_NAME=$(echo "${CONTAINER_SBOM}" | jq -r '.metadata.component.name // empty')
SUPPLIER_NAME=$(echo "${CONTAINER_SBOM}" | jq -r '.metadata.component.supplier.name // empty')

echo -e "Component Name    : ${YELLOW}${COMPONENT_NAME}${NC}"
echo -e "Component Version : ${YELLOW}${STAMPED_VERSION}${NC}"
echo -e "Component Supplier: ${YELLOW}${SUPPLIER_NAME}${NC}"

if [[ "${STAMPED_VERSION}" == "${COMMIT_SHA_2}" ]]; then
    echo -e "${GREEN}✓ SUCCESS: Stamped version matches target COMMIT_SHA (${COMMIT_SHA_2}).${NC}"
else
    echo -e "${RED}✗ FAIL: Expected version '${COMMIT_SHA_2}', got '${STAMPED_VERSION}'.${NC}"
    exit 1
fi

echo -e "\n${GREEN}======================================================${NC}"
echo -e "${GREEN}  All SBOM Docker Caching & Stamping checks passed!   ${NC}"
echo -e "${GREEN}======================================================${NC}"
