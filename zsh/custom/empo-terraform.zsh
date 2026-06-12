alias zfetf="cd workspaces/frontend-app/infrastructure/stacks/staging"
alias zbetf="cd workspaces/backend-api/infrastructure/stacks/staging"
alias link_aws_envrc_prod="rm .envrc; ln -s ~/.aws/.envrc.prod .envrc; direnv allow"
alias link_aws_envrc_staging="rm .envrc; ln -s ~/.aws/.envrc.staging .envrc; direnv allow"

# Get the lock ID and ask for confirmation before unlocking
tf_unlock_last() {
  # 1. Capture the plan output (including stderr)
  # 2. Look for the line that has "ID:" with spaces before it
  # 3. Grab the actual hex string
  local LOCK_ID=$(tfp 2>&1 | grep -w "ID:" | awk '{print $NF}')

  if [ -z "$LOCK_ID" ]; then
    echo "❌ No State Lock ID found in the output."
    return 1
  fi

  echo "✅ Found Lock ID: $LOCK_ID"

  # Confirm before doing something destructive
  echo -n "Force unlock this ID? (y/n): "
  read -r choice
  if [[ "$choice" == "y" || "$choice" == "Y" ]]; then
    terraform force-unlock "$LOCK_ID"
  else
    echo "Unlock cancelled."
  fi
}

# This runs the subshell only when you call the function
tf_select_work_space() {
  tfws $(tfwl | fzf)
}

tf_unlock() {
  local DIRECTORY=$1
  local ENVIRONMENT=$2
  echo "$DIRECTORY"
  cd "$DIRECTORY"

  # link .envrc
  echo "Linking ~/.aws/.envrc.$ENVIRONMENT"
  if [ "$ENVIRONMENT" = "prod" ]; then
    link_aws_envrc_prod
    aws sso login --profile empo-production-admin
  else
    link_aws_envrc_staging 
    aws sso login --profile empo-staging-admin
  fi


  echo "tf_unlock_post_aws"
  echo "tf_unlock_post_aws" | pbcopy
}

tf_unlock_post_aws() {
  direnv allow
  echo "Terraform init"
  tfi

  echo "Select terraform workspace"
  tf_select_work_space

  echo "Unlock state"
  tf_unlock_last

}

tf_unlock_be() {
  zbetf
  tf_unlock . "staging"
}

tf_unlock_fe() {
  zfetf
  tf_unlock . "staging"
}
