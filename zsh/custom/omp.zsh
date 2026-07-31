# Oh My Pi profile helpers

export OMP_CONFIG_DIR="$HOME/.omp/agent"

omp-devin() {
  command omp --config "$OMP_CONFIG_DIR/config.yml.devin" "$@"
}

omp-gemini() {
  command omp --config "$OMP_CONFIG_DIR/config.yml.google-antigravity" "$@"
}

omp-empo() {
  command omp --config "$OMP_CONFIG_DIR/config.yml.empo-ai" "$@"
}

omp-profile() {
  local profile="$1"
  shift

  case "$profile" in
    devin)
      omp-devin "$@"
      ;;
    gemini|antigravity)
      omp-gemini "$@"
      ;;
    empo)
      omp-empo "$@"
      ;;
    *)
      print -u2 "Usage: omp-profile {devin|gemini|empo} [omp arguments...]"
      return 2
      ;;
  esac
}
