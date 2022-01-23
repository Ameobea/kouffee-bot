FROM node:17.4.0-stretch-slim

ADD . /app
WORKDIR /app

RUN apt update && apt install -y python3 build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev && yarn && yarn build

CMD yarn start
