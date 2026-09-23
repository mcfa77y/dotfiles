#!/usr/bin/env python3
"""
Reusable Graphify automation script.
Extracts AST structure, clusters relationships, labels communities, generates diagnostics, and outputs reports.
"""

import argparse
import glob
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


def ensure_graphify_environment():
    """Ensure we run in an environment with graphifyy installed."""
    try:
        import graphify
        return
    except ImportError:
        pass

    # Re-exec via uv run --with graphifyy if uv is available
    if shutil.which("uv"):
        os.execvp("uv", ["uv", "run", "--with", "graphifyy", "python3"] + sys.argv)

    # Fallback: install and re-exec
    subprocess.run([sys.executable, "-m", "pip", "install", "graphifyy", "--break-system-packages", "-q"], check=False)
    try:
        import graphify
    except ImportError:
        print("Failed to import graphify. Please install with `uv tool install graphifyy` or `pip install graphifyy`.")
        sys.exit(1)


def run_pipeline(target_path: Path, output_dir: Path, is_directed: bool = False, no_viz: bool = False):
    target_path = target_path.resolve()
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    from graphify.analyze import god_nodes, surprising_connections, suggest_questions
    from graphify.build import build_from_json
    from graphify.cluster import cluster, score_all
    from graphify.detect import detect, save_manifest
    from graphify.diagnostics import diagnose_extraction, format_diagnostic_report
    from graphify.export import to_json
    from graphify.extract import collect_files, extract
    from graphify.report import generate

    print(f"🔍 Detecting files in {target_path}...")
    detect_res = detect(target_path)
    (output_dir / ".graphify_detect.json").write_text(json.dumps(detect_res, ensure_ascii=False), encoding="utf-8")
    
    total_files = detect_res.get("total_files", 0)
    print(f"Corpus: {total_files} files · ~{detect_res.get('total_words', 0):,} words")
    for category, files in detect_res.get("files", {}).items():
        if files:
            print(f"  {category}: {len(files)} files")

    if total_files == 0:
        print("No supported files found.")
        return

    # Part A: AST extraction for code files
    code_files = []
    for f in detect_res.get("files", {}).get("code", []):
        p = Path(f)
        code_files.extend(collect_files(p) if p.is_dir() else [p])

    if code_files:
        print(f"⚡ Extracting AST from {len(code_files)} code files...")
        ast_res = extract(code_files, cache_root=target_path)
        print(f"AST: {len(ast_res['nodes'])} nodes, {len(ast_res['edges'])} edges")
    else:
        ast_res = {"nodes": [], "edges": [], "input_tokens": 0, "output_tokens": 0}

    # For pure-code repositories or when semantic is empty:
    sem_res = {"nodes": [], "edges": [], "hyperedges": [], "input_tokens": 0, "output_tokens": 0}

    # Merge AST + Semantic
    seen_ids = {n["id"] for n in ast_res["nodes"]}
    merged_nodes = list(ast_res["nodes"])
    for n in sem_res["nodes"]:
        if n["id"] not in seen_ids:
            merged_nodes.append(n)
            seen_ids.add(n["id"])

    merged_edges = ast_res["edges"] + sem_res["edges"]
    merged_hyperedges = sem_res.get("hyperedges", [])
    merged_extract = {
        "nodes": merged_nodes,
        "edges": merged_edges,
        "hyperedges": merged_hyperedges,
        "input_tokens": sem_res.get("input_tokens", 0),
        "output_tokens": sem_res.get("output_tokens", 0),
    }

    # Build Graph
    print("🔨 Building graph...")
    G = build_from_json(merged_extract, root=str(target_path), directed=is_directed)
    if G.number_of_nodes() == 0:
        print("ERROR: Graph is empty.")
        return

    # Cluster & Analyze
    communities = cluster(G)
    cohesion = score_all(G, communities)
    gods = god_nodes(G)
    surprises = surprising_connections(G, communities)

    # Community labeling
    community_labels = {}
    for cid, node_list in communities.items():
        top_names = [G.nodes[n].get("name", str(n)) for n in node_list[:3]]
        label_candidate = " / ".join(top_names)
        if len(label_candidate) > 40:
            label_candidate = label_candidate[:37] + "..."
        community_labels[cid] = f"Community {cid}: {label_candidate}" if label_candidate else f"Community {cid}"

    questions = suggest_questions(G, communities, community_labels)
    tokens = {"input": 0, "output": 0}

    # Export outputs
    graph_json_path = output_dir / "graph.json"
    to_json(G, communities, str(graph_json_path), community_labels=community_labels)

    report_md = generate(
        G,
        communities,
        cohesion,
        community_labels,
        gods,
        surprises,
        detect_res,
        tokens,
        str(target_path),
        suggested_questions=questions,
    )
    report_path = output_dir / "GRAPH_REPORT.md"
    report_path.write_text(report_md, encoding="utf-8")

    # Save manifest
    from graphify.cli import _stamped_manifest_files
    corpus = detect_res.get("all_files") or detect_res["files"]
    manifest_files = _stamped_manifest_files(corpus, merged_extract, target_path)
    scan = {f for fl in corpus.values() for f in fl}
    save_manifest(manifest_files, root=str(target_path), scan_corpus=scan)

    # Run diagnostics
    diag = diagnose_extraction(merged_extract, directed=is_directed, root=str(target_path))
    print(format_diagnostic_report(diag))

    print(f"\n✅ Graph complete! ({G.number_of_nodes()} nodes, {G.number_of_edges()} edges, {len(communities)} communities)")
    print(f"📁 Outputs written to {output_dir}/")
    print(f"   - {report_path.name}")
    print(f"   - {graph_json_path.name}")

    # Export HTML visualization unless disabled
    if not no_viz:
        html_cmd = shutil.which("graphify")
        if html_cmd:
            try:
                subprocess.run(["graphify", "export", "html"], cwd=target_path, check=False)
            except Exception:
                pass


def main():
    parser = argparse.ArgumentParser(description="Run Graphify knowledge graph extraction on a target codebase.")
    parser.add_argument("path", nargs="?", default=".", help="Target project root directory (default: current dir)")
    parser.add_argument("--output", "-o", default="graphify-out", help="Output directory (default: graphify-out)")
    parser.add_argument("--directed", action="store_true", help="Build directed graph preserving edge direction")
    parser.add_argument("--no-viz", action="store_true", help="Skip generating interactive HTML visualization")
    args = parser.parse_args()

    ensure_graphify_environment()
    target_dir = Path(args.path).resolve()
    output_dir = target_dir / args.output if not Path(args.output).is_absolute() else Path(args.output)
    run_pipeline(target_dir, output_dir, is_directed=args.directed, no_viz=args.no_viz)


if __name__ == "__main__":
    main()
