# Start the local vLLM Metal server.
vllm-metal() {
  local vllm_pids

  local vllm_venv="$HOME/.venv-vllm-metal"
  vllm_pids=$(pgrep -f "$vllm_venv/bin/vllm serve" || true)
  if [[ -n "$vllm_pids" ]]; then
    kill $vllm_pids
    sleep 1
  fi

  source "$vllm_venv/bin/activate"

  VLLM_HOST_IP=127.0.0.1 \
    vllm serve Qwen/Qwen3-1.7B \
      --host 127.0.0.1 \
      --port 8000 \
      --max-model-len 40960 \
      --enforce-eager \
      --enable-auto-tool-choice \
      --tool-call-parser hermes \
      --reasoning-parser deepseek_r1
}
