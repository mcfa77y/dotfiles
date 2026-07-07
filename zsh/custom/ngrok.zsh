ngrok_start() {
  if [[ -n "$CMUX_SURFACE_ID" && "$(cmux-current-title)" != "Ngrok 3000" ]]; then
    cmux-tab --name "Ngrok 3000" --command "ngrok http --domain=saved-heron-driving.ngrok-free.app 3000"
  else
    ngrok http --domain=saved-heron-driving.ngrok-free.app 3000
  fi
}

ngrok_start2() {
  if [[ -n "$CMUX_SURFACE_ID" && "$(cmux-current-title)" != "Ngrok 3002 (https)" ]]; then
    cmux-tab --name "Ngrok 3002 (https)" --command "ngrok http --domain=saved-heron-driving.ngrok-free.app https://localhost:3002"
  else
    ngrok http --domain=saved-heron-driving.ngrok-free.app https://localhost:3002
  fi
}

ngrok_start3() {
  if [[ -n "$CMUX_SURFACE_ID" && "$(cmux-current-title)" != "Ngrok 3002 (http)" ]]; then
    cmux-tab --name "Ngrok 3002 (http)" --command "ngrok http --domain=saved-heron-driving.ngrok-free.app http://localhost:3002"
  else
    ngrok http --domain=saved-heron-driving.ngrok-free.app http://localhost:3002
  fi
}


