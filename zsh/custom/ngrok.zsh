NGROK_URL='dextrogyrate-unreceiving-georgiana.ngrok-free.dev'

ngrok_start() {
  pkill ngrok
  ngrok http --domain=$NGROK_URL 3000
}
