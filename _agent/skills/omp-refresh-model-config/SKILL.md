---
name: omp-refresh-model-config
description: "Refresh any agent/config.yml.provider model catalog from omp models, picking the newest/best models per role. Use when new models are available and a provider config (empo-ai, devin, etc.) needs updating."
---

# Refresh omp provider model config

Update `agent/config.yml.<provider>` (e.g. `config.yml.empo-ai`, `config.yml.devin`) to use the newest available models from `omp models <provider>`. Works for any provider; pick the best model for each role regardless of family, or restrict to a single family (e.g. `google/*`) if the user asks.

## Steps

1. **Read current config.** Read `agent/config.yml.<provider>` to see existing `modelRoles` and `retry.fallbackChains`. Preserve all non-model settings (`dev`, `symbolPreset`, `prewalk`, `autolearn`, `github`, etc.) verbatim.

2. **Fetch the live catalog.**

   ```sh
   omp models <provider> --json 2>/dev/null | jq -r '.models[] | "\(.id)\tctx=\(.contextWindow)\tmax=\(.maxTokens)\tthink=\(.thinking|tostring)\tinput=\(.input|join(","))\treasoning=\(.reasoning)"'
   ```

   Add a `select(.id|startswith("google/"))` filter if the user wants a single family.

3. **Identify upgrades.** Compare current config models against the catalog. Look for:
   - Same model with larger context (e.g. `glm-5-2` 200K → `glm-5-2-1m` 1M).
   - Newer version of the same tier (e.g. `gemini-3-6-flash` → `gemini-3-7-flash`, `swe-1-6` → `swe-1-7`).
   - New flagship models for the `slow` role (most capable).
   - Exclude downgrades: smaller context, text-only for vision/designer, image/video/TTS generation models, models missing needed thinking levels.

4. **Pick models by role.**
   - **default/task/advisor**: workhorse — newest capable model with large context. Match the user's current family choice unless a clear upgrade exists.
   - **slow**: most capable model available (flagship tier — opus, sonnet, etc.).
   - **plan**: strong reasoning model at moderate thinking.
   - **vision/designer**: must support image input. Flash-tier or multimodal models.
   - **smol/commit**: lighter/faster model at low thinking.
   - **tiny**: lightest/fastest model available.

5. **Thinking-level conventions differ by provider.**
   - **empo-ai**: `:level` suffix on all models (e.g. `empo-ai/google/gemini-3.7-flash:high`). Levels: `minimal`, `low`, `medium`, `high`, `xhigh`.
   - **devin**: mixed —
     - Claude models: `-level` suffix (e.g. `devin/claude-opus-5-high`, `devin/claude-sonnet-5-medium`).
     - GPT/SWE models with `think` array: `:level` suffix (e.g. `devin/gpt-5-6-luna:low`, `devin/swe-1-7:medium`).
     - Gemini 3-7 flash / grok / nemotron: level encoded in model name (e.g. `devin/gemini-3-7-flash-medium`). These appear as separate catalog entries with `think=null`.
     - Models with `think=null` and no level variants: no suffix (e.g. `devin/glm-5-2-1m`, `devin/swe-1-7-lightning`).
   - Check the catalog: if `think` is an array, use `:level` (or `-level` for devin claude). If the model has `think=null` and level-specific variants exist in the catalog, use the variant name directly.

6. **Build fallback chains.** For each role, order newest → previous → older:
   - First fallback at one thinking notch below the primary.
   - Then the prior primary model (the one being replaced) at the same notch.
   - Then the generation before that.
   - For smol/tiny/commit: newest light model → older light model.
   - Keep chains to 2-3 entries.

7. **Write the config.** Overwrite `agent/config.yml.<provider>` with new `modelRoles` + `retry.fallbackChains`, preserving all other keys verbatim. Every selector is `<provider>/<model><level-suffix>`.

8. **Validate.** Confirm every referenced model exists in the live catalog:

   ```sh
   LC_ALL=C omp models <provider> --json 2>/dev/null \
     | jq -r '.models[] | .id' | LC_ALL=C sort > /tmp/avail.txt
   # Extract referenced models, strip provider prefix and :level suffix
   LC_ALL=C grep -oE '<provider>/[a-zA-Z0-9._-]+(:[a-z]+)?' agent/config.yml.<provider> \
     | sed 's/^<provider>\///' | LC_ALL=C sort -u > /tmp/used_raw.txt
   # Check each: exact match, or base model (strip :level) in catalog, or -level variant base in catalog
   while IFS= read -r entry; do
     base=$(echo "$entry" | sed 's/:[a-z]*$//')
     grep -qx "$entry" /tmp/avail.txt && continue
     grep -qx "$base" /tmp/avail.txt && continue
     echo "MISSING: $entry"
   done < /tmp/used_raw.txt
   ```

   No `MISSING:` lines = all models valid. Fix any missing before finishing.

## Notes

- `omp models <provider>` (no `--json`) gives a human-readable table; `--json` is for parsing.
- The JSON root is an object with a `models[]` array (not a bare array).
- `defaultThinkingLevel: auto` lets the harness pick; keep it unless told otherwise.
- Provider configs are scoped: `config.yml.empo-ai`, `config.yml.devin`, etc. The base `config.yml` is separate.
- When upgrading, prefer same-family upgrades (same model +more context, or next version) over switching families, unless the user requests a family change.
- For devin, `swe-*` models are coding-specialized; good for task/commit/tiny roles. `glm-*` are general workhorses. Claude models are strong for slow/designer. GPT models for plan/reasoning.
