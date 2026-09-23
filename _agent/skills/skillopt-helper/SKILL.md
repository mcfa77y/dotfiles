---
name: skillopt-helper
description: Evaluates, benchmarks, and optimizes agent skills (SKILL.md) and instructions using Microsoft SkillOpt and SkillOpt-Sleep with held-out validation gates, transcript replay, and regression checks.
---

# SkillOpt Helper

This skill provides utilities, benchmarks, and execution workflows to optimize, evaluate, and self-evolve agent skill documents (`SKILL.md`, rules, system prompts) using [Microsoft SkillOpt](https://github.com/microsoft/SkillOpt).

SkillOpt treats natural language skill documents as **trainable parameters** of a frozen LLM agent:
- **Reflect & Propose**: Grades trajectories, diagnoses mistakes, and proposes bounded diffs (`add`, `delete`, `replace`).
- **Text Learning Rate**: Keeps edits compact, preventing prompt bloat and catastrophic forgetting.
- **Strict Validation Gate**: Candidate edits are **only accepted if they strictly improve performance on held-out validation tasks without regressing existing passes**.
- **Deployable Artifact**: Produces a minimized, regression-tested `best_skill.md`.

---

## Bundled Scripts (`scripts/`)

All scripts include PEP 723 metadata and should be run with `uv run`:

### 1. `rhl_skillopt.py`
Unified manager and orchestrator for all 10 `rhl-*` skills in `/Users/joe/dotfiles/_agent/skills`.
Supports native **oh-my-pi (`omp`)** and **Antigravity (`agy`)** execution backends and transcript harvesting from `~/.omp/agent/sessions`.

```bash
# List all 10 discovered rhl-* skills:
uv run scripts/rhl_skillopt.py list

# Audit lines, words, character counts:
uv run scripts/rhl_skillopt.py audit

# Dry-run across all RHL skills using omp sessions:
uv run scripts/rhl_skillopt.py dry-run --backend mock --source omp

# Dry-run targeting a specific skill with omp or agy:
uv run scripts/rhl_skillopt.py dry-run --skill rhl-commit-push --backend omp --source omp
uv run scripts/rhl_skillopt.py dry-run --skill rhl-commit-push --backend agy --source omp

# Run live consolidation and stage proposals for human review:
uv run scripts/rhl_skillopt.py run --skill rhl-commit-push --backend omp --source omp

# Inspect staged diffs:
uv run scripts/rhl_skillopt.py status

# Adopt vetted skill proposal (with backup):
uv run scripts/rhl_skillopt.py adopt --skill rhl-commit-push
```

### 2. `eval_runner.py`
Runs the SkillOpt-Sleep evaluation and consolidation cycle on a target skill.

```bash
# Preview consolidation on a target skill (dry-run, mock backend):
uv run scripts/eval_runner.py --skill-path /path/to/SKILL.md --backend mock

# Run evaluation with an active agent backend (e.g. pi, claude, codex):
uv run scripts/eval_runner.py \
  --backend pi \
  --skill-path /Users/joe/.gemini/config/skills/rhl-pr-helper/SKILL.md \
  --project /Users/joe/Projects/empo_health/remote-health-link

# Live run: stages proposed changes under .skillopt/ for review
uv run scripts/eval_runner.py --backend pi --run --skill-path /path/to/SKILL.md
```

### 2. `generate_pr_tasks.py`
Generates deterministic test benchmarks (`pr_helper_eval_tasks.json`) with `train` and `val` splits.

```bash
uv run scripts/generate_pr_tasks.py \
  --output scripts/pr_helper_eval_tasks.json \
  --skill-path /Users/joe/.gemini/config/skills/rhl-pr-helper/SKILL.md
```

### 3. `test_judges.py`
Offline test harness (0 LLM cost / 0 tokens) verifying that rule judges accurately reward compliant responses (1.00 score) and fail non-compliant outputs with explanations.

```bash
uv run scripts/test_judges.py --tasks-file scripts/pr_helper_eval_tasks.json
```

---

## Standard Workflows

### Workflow A: Benchmark-Driven Skill Optimization
1. **Define or generate tasks**: Create a `tasks.json` containing test cases with rule judges (`contains`, `not_contains`, `regex`, `min_chars`, `max_chars`).
2. **Verify judges offline**:
   ```bash
   uv run scripts/test_judges.py
   ```
3. **Run gated consolidation**:
   ```bash
   uv run scripts/eval_runner.py --tasks-file scripts/pr_helper_eval_tasks.json --backend pi
   ```
4. **Review & adopt**:
   ```bash
   skillopt-sleep status   # View staged diff & score delta
   skillopt-sleep adopt    # Backs up the original and applies vetted changes
   ```

### Workflow B: Nightly Session Harvesting & Sleep Cycle
Evolve skills based on real past developer sessions:
```bash
# Harvest real sessions (e.g. from ~/.pi/agent/sessions/ or ~/.claude):
skillopt-sleep dry-run \
  --source pi \
  --project /Users/joe/Projects/empo_health/remote-health-link \
  --lookback-hours 0 \
  --target-skill-path /Users/joe/.gemini/config/skills/rhl-pr-helper/SKILL.md \
  --backend pi \
  --progress
```

### Workflow C: Training with `skillopt-train`
For multi-epoch optimizer training over standard benchmark datasets:
```bash
skillopt-train \
  --backend claude \
  --skill_init /path/to/initial_skill.md \
  --data_path ./benchmark_data.json \
  --num_epochs 3 \
  --edit_budget 300 \
  --use_gate true
```

---

## Supported Backends & Sources

| Backend / Source | Identifier | Notes |
|---|---|---|
| **Mock** | `mock` | Local offline mode, 0 API calls (ideal for structural validation) |
| **Pi CLI** | `pi` | Uses local authenticated Pi coding agent |
| **Claude Code** | `claude` | Uses local Claude Code agent CLI |
| **Codex** | `codex` | Uses local OpenAI Codex CLI |
| **VS Code Copilot** | `copilot` | Harvests sessions from VS Code workspace storage |
| **Cursor** | `cursor` | Uses Cursor Agent CLI |
| **Azure OpenAI** | `azure_openai` | Direct API endpoint |
