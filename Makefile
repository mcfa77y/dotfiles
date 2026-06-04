# List of all standard Stow packages to link
PACKAGES = act atuin bash bat gh ghostty git gtk-2.0 iterm2 karabiner lazygit neofetch nvim powerline ranger starship tabtab thefuck vim vscode worktrunk yazi zsh

.PHONY: all stow unstow restow

all: stow

stow:
	stow -v -S -t ~ $(PACKAGES)

unstow:
	stow -v -D -t ~ $(PACKAGES)

restow:
	stow -v -R -t ~ $(PACKAGES)
