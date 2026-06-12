# Function for fuzzy-selecting AWS profiles
aws_set_profile() {
    # 1. Parse the credentials file for any [bracketed] names
    # We ignore comments (#) and empty lines, then strip the brackets.
    local profile=$(grep '^\[.*\]' ~/.aws/config | \
                   tr -d '[]' | \
                   awk '{print $2}' | \
                   fzf --height 40% \
                       --reverse \
                       --prompt="🚀 Select AWS Profile: " \
                       --border=rounded \
                       --info=inline)

    # 2. If a selection was made, export it
    if [ -n "$profile" ]; then
        export AWS_PROFILE=$profile
        echo "✅ AWS_PROFILE set to: **$AWS_PROFILE**"

        # Update environment files
        if [[ "$profile" == *staging* || "$profile" == *base* ]]; then
            sed -i '' "s/^.*AWS_PROFILE=.*/AWS_PROFILE=$profile/" ~/.aws/.envrc.staging
            echo "📝 Updated ~/.aws/.envrc.staging"
        elif [[ "$profile" == *prod* || "$profile" == *production* ]]; then
            sed -i '' "s/^.*AWS_PROFILE=.*/AWS_PROFILE=$profile/" ~/.aws/.envrc.prod
            echo "📝 Updated ~/.aws/.envrc.prod"
        fi

        # Optional: Auto-login check (Uncomment if you want it to check SSO status)
        aws sts get-caller-identity --profile "$profile" > /dev/null 2>&1 || aws sso login --profile "$profile"
    else
        echo "No profile selected."
    fi
}
