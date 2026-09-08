# Oh My Pi profile helpers with Headroom context compression

export OMP_CONFIG_DIR="$HOME/.omp/agent"

_omp_launch() {
  if command -v headroom >/dev/null 2>&1; then
    headroom wrap omp -- "$@"
  else
    command omp "$@"
  fi
}

omp-devin() {
  command omp update
  _omp_launch --config "$OMP_CONFIG_DIR/config.yml.devin" "$@"
}

omp-empo() {
  command omp update
  _omp_launch --config "$OMP_CONFIG_DIR/config.yml.empo-ai" "$@"
}

omp-empo-mix() {
  command omp update
  _omp_launch --config "$OMP_CONFIG_DIR/config.yml.empo-ai-mix" "$@"
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
