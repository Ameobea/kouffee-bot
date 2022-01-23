set dotenv-load := true

run:
  yarn build && yarn start

code:
  code .

docker-build:
  docker build -t kouffee-bot .
