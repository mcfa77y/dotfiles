# 2024-01-07 the fuck
# Lazy load thefuck to keep shell startup fast (0ms)
fuck() {
  unset -f fuck
  eval $(thefuck --alias)
  fuck "$@"
}
