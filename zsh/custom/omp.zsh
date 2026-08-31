# Oh My Pi profile helpers

export OMP_CONFIG_DIR="$HOME/.omp/agent"

omp-devin() {
  command omp update
  command omp --config "$OMP_CONFIG_DIR/config.yml.devin" "$@"
}

omp-empo() {
  command omp update
  command omp --config "$OMP_CONFIG_DIR/config.yml.empo-ai" "$@"
}

omp-empo-mix() {
  command omp update
  command omp --config "$OMP_CONFIG_DIR/config.yml.empo-ai-mix" "$@"
}

omp-profile() {
  local profile="$1"
  shift

  case "$profile" in
  devin)
    omp-devin "$@"
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
