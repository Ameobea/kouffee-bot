FROM node:22.3-bookworm-slim

ADD . /app
WORKDIR /app

RUN apt update && apt install -y python3 build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev && yarn && yarn build

CMD yarn start
