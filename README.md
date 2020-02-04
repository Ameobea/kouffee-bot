# Kouffee Bot

Bot that exists as our Discord server's pet.

## Installing + Running

Developed + tested using NodeJS 13.7.0.

Requires a MySQL server. Credentials and connection info should be specified in `conf.toml`.

- `yarn`
- `yarn build`
- `cp conf.example.toml conf.toml` # edit conf.toml to contain correct values
- `yarn start`

### Docker

You must have a completed `conf.toml` in the working directory to begin. It will be mounted into the container when the bot is started.

- `docker build -t ameo/kouffee-bot .`
- `docker run --rm -it -e "DISCORD_TOKEN=yourDiscordToken" --mount type=bind,source=$(pwd)/conf.toml,target=/app/conf.toml ameo/kouffee-bot`
