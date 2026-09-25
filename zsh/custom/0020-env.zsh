# --- Docker ---
# Apple Silicon often needs amd64 images for project compatibility; native Linux should use host architecture.
if [[ "$(uname -s)" == "Darwin" && "$(uname -m)" == "arm64" ]]; then
  export DOCKER_DEFAULT_PLATFORM=linux/amd64
fi
export DOCKER_REGISTRY_PORT=5575

# --- Projects & Editor ---
export PROJECTS_DIR="$HOME/Projects"
export JS_DIR="$PROJECTS_DIR/js_for_fun"
export PY_DIR="$PROJECTS_DIR/python_for_fun"
export EDITOR='nvim'
export VISUAL="nvim"

# export AI_HARNESS='agy'
export AI_HARNESS='omp-empo'

# Google Antigravity
export GOOGLE_CLOUD_PROJECT_ID='empo-health-antigravity'

# --- Lazygit ---
LAZY_GIT_CONFIG_DIR="$HOME/.config/lazygit"
export LG_CONFIG_FILE="$LAZY_GIT_CONFIG_DIR/config.yml"

# --- Yazi ---
export YAZI_CONFIG_DIR="$HOME/.config/yazi"

# --- Oh My Zsh ---
OMZ_CUSTOM_DIR="$HOME/dotfiles/zsh/custom"

# --- Headroom AI Context Compression ---
export OPENAI_TARGET_API_URL='https://ai.empohealth.com/v1'
export HEADROOM_HOST='127.0.0.1'
export HEADROOM_PORT=8787
export EMPO_AI_BASE_URL='http://127.0.0.1:8787/v1'
# Beta output shaper: trims model output ceremony (preambles, restated code)
export HEADROOM_ROLLOUT_CHANNEL='beta'
export HEADROOM_OUTPUT_SHAPER=1
export HEADROOM_OUTPUT_HOLDOUT=0.1
export HEADROOM_MODE=token
