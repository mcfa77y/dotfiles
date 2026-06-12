# 2023-10-03
# Docker fix for m1 apple silicon
# https://stackoverflow.com/questions/71040681/qemu-x86-64-could-not-open-lib64-ld-linux-x86-64-so-2-no-such-file-or-direc
export DOCKER_DEFAULT_PLATFORM=linux/amd64
export DOCKER_REGISTRY_PORT=5575
