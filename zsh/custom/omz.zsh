# 2026-06-22
# Scripts for omz and zsh
OMZ_CUSTOM_DIR='/Users/joe/dotfiles/zsh/custom'
alias sz='source ~/.zshrc'
alias eomzplugins='code_ide ~/.zshrc'
alias eomzcustom='code_ide $OMZ_CUSTOM_DIR/joe.zsh'
alias nomz='nvim $OMZ_CUSTOM_DIR/joe.zsh'
alias nzsh='nvim ~/.zshrc'
alias zomz='cd $OMZ_CUSTOM_DIR'
alias fomz='zomz; nvim $(ls $OMZ_CUSTOM_DIR | fzf_multi_select); cd -; sz'
