# 2024-12-17

# Define the base directory for Obsidian notes
markdown_dir="/Users/joe/Projects/fabric_md"

# Loop through all files in the ~/.config/fabric/patterns directory
for pattern_file in ~/.config/fabric/patterns/*; do
  # Get the base name of the file using pure Zsh modifier (takes 0ms!)
  pattern_name=${pattern_file:t}

  # Unalias any existing alias with the same name
  unalias "$pattern_name" 2>/dev/null

  # Define a function dynamically for each pattern
  eval "
    $pattern_name() {
        local title=\$1
        local date_stamp=\$(date +'%Y-%m-%d')
        local output_path=\"\$markdown_dir/\${date_stamp}-\${title}.md\"

        # Check if a title was provided
        if [ -n \"\$title\" ]; then
            # If a title is provided, use the output path
            fabric --pattern \"$pattern_name\" -o \"\$output_path\"
            code $output_path
        else
            # If no title is provided, use --stream
            fabric --pattern \"$pattern_name\" --stream
        fi
    }
    "
done
