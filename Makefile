# Common Stow packages shared across platforms
COMMON_PACKAGES = act atuin bash bat btop bun gh ghostty git glow lazygit neofetch nvim omp powerline ranger starship tabtab thefuck vim worktrunk yazi zsh
LINUX_PACKAGES = gtk-2.0
MACOS_PACKAGES = iterm2 karabiner

UNAME_S := $(shell uname -s)

ifeq ($(UNAME_S),Darwin)
PACKAGES = $(COMMON_PACKAGES) $(MACOS_PACKAGES)
else
PACKAGES = $(COMMON_PACKAGES) $(LINUX_PACKAGES)
endif

# lazygit/.config/lazygit/themes is an absolute macOS symlink in this repo.
STOW_FLAGS = --ignore='themes$$'

.PHONY: all stow unstow restow

all: stow

stow:
	stow -v -S -t ~ $(STOW_FLAGS) $(PACKAGES)

unstow:
	stow -v -D -t ~ $(STOW_FLAGS) $(PACKAGES)

restow:
	stow -v -R -t ~ $(STOW_FLAGS) $(PACKAGES)
