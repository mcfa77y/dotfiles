# 2024-12-17
# Golang environment variables
if [[ -d "/opt/homebrew/opt/go/libexec" ]]; then
  export GOROOT="/opt/homebrew/opt/go/libexec"
elif [[ -d "/usr/local/opt/go/libexec" ]]; then
  export GOROOT="/usr/local/opt/go/libexec"
else
  export GOROOT=$(brew --prefix go)/libexec
fi

export GOPATH=$HOME/go
export PATH=$GOPATH/bin:$GOROOT/bin:$HOME/.local/bin:$PATH
