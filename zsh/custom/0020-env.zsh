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
