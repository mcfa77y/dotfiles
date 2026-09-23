#!/usr/bin/env python3
"""
Validates GitHub Actions workflow YAML files for syntax and schema structure.
Usage:
    python3 validate_yaml.py [file1.yml file2.yml ...]
    python3 validate_yaml.py .github/workflows/
"""

import sys
import yaml
from pathlib import Path

def validate_workflow_yaml(filepath: Path) -> bool:
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        
        if not isinstance(data, dict):
            print(f"✗ {filepath}: Root must be a mapping/dictionary", file=sys.stderr)
            return False

        # Basic GitHub Actions workflow structure checks
        missing_keys = [k for k in ("on", "jobs") if k not in data and True not in [k in str(data)]]
        # Some workflows use 'on:' which PyYAML parses as True if unquoted in YAML 1.1
        has_on = "on" in data or True in data
        if not has_on:
            print(f"✗ {filepath}: Missing required 'on' trigger specification", file=sys.stderr)
            return False
        if "jobs" not in data or not isinstance(data["jobs"], dict):
            print(f"✗ {filepath}: Missing required 'jobs' mapping", file=sys.stderr)
            return False

        print(f"✓ {filepath} is valid ({len(data['jobs'])} jobs defined)")
        return True
    except yaml.YAMLError as e:
        print(f"✗ {filepath} YAML syntax error:\n  {e}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"✗ {filepath} error: {e}", file=sys.stderr)
        return False

def main():
    targets = sys.argv[1:]
    files = []

    if targets:
        for target in targets:
            p = Path(target)
            if p.is_dir():
                files.extend(sorted(p.glob("*.yml")) + sorted(p.glob("*.yaml")))
            elif p.is_file():
                files.append(p)
            else:
                print(f"Warning: path not found: {target}", file=sys.stderr)
    else:
        # Default search in current directory .github/workflows
        default_dir = Path(".github/workflows")
        if default_dir.is_dir():
            files = sorted(default_dir.glob("*.yml")) + sorted(default_dir.glob("*.yaml"))
        else:
            print("Error: No files specified and .github/workflows directory not found.", file=sys.stderr)
            sys.exit(1)

    if not files:
        print("No YAML workflow files found to validate.", file=sys.stderr)
        sys.exit(1)

    print(f"Validating {len(files)} workflow file(s)...")
    success = True
    for f in files:
        if not validate_workflow_yaml(f):
            success = False

    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
