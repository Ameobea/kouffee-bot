FROM node:13.7.0-alpine3.11

ADD . /app
WORKDIR /app

RUN yarn
RUN yarn build

CMD yarn start
