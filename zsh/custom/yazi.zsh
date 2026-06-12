# 2020-06-09 set config dir
export YAZI_CONFIG_DIR="$HOME/.config/yazi"

# 2020-06-09 allows yazi to enter cwd upon quit
function yzi() {
  local tmp="$(mktemp -t "yazi-cwd.XXXXXX")" cwd
  yazi "$@" --cwd-file="$tmp"
  IFS= read -r -d '' cwd <"$tmp"
  [ -n "$cwd" ] && [ "$cwd" != "$PWD" ] && builtin cd -- "$cwd"
  rm -f -- "$tmp"
}
