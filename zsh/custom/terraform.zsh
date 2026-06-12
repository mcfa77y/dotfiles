tfinit() {
  terraform_mfa
  echo 'copy .envrc'
  cp ~/.aws/.envrc .
  echo 'direnv allow'
  direnv allow
  echo 'terrarform init'
  tfi
  echo 'terraform workspace list'
  tf workspace select $(tf workspace list | fzf)
}

alias da='direnv allow'
