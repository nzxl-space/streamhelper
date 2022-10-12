# streamhelper - osu.nzxl.space
This is the open repository of osu.nzxl.space - A free to use, simple and powerful osu! beatmap request bot.

# Usage
Sign up at [osu.nzxl.space](https://osu.nzxl.space)<br>
** You need to have Discord Game Activities enabled and a linked Twitch Account **

# Features
Commands:
- !np - Show current playing map
- !nppp - Show current playing map with Performance Values
- !last - Show last playing map
- !lastpp - Show last playing map with Performance Values
<br>
- Automatically renders your new top plays using o!rdr.

# Roadmap
- ~~Automatically render your new top plays using o!rdr~~
- ~~Code optimization o_o~~ (It won't happen)
- Realtime embedded OBS overlays for PP, Score Farming, etc.

# Self-hosting setup
I don't really encourage people doing this, but you're free to do whatever you like with this project! :)

Requirements:
- MongoDB
- NodeJS v16.15+
- [omkelderman/osu-replay-downloader](https://github.com/omkelderman/osu-replay-downloader)
- [kionell/osu-pp-calculator](https://github.com/kionell/osu-pp-calculator)
- [o!rdr](https://ordr.issou.best)

```
$ git clone https://github.com/nzxl-space/streamhelper
$ cd streamhelper && npm i
```

Required Environment Variables:
```
OSU_USERNAME="<your osu username>"
OSU_PASSWORD="<your irc password>"
OSU_API_KEY="<your api key>"

OSU_CLIENT_ID="<client id from api page>"
OSU_CLIENT_SECRET="<client secret from api page>"

TWITCH_USERNAME="<bot username>"
TWITCH_PASSWORD="<bot password in oauth: format>"
TWITCH_CLIENT_ID="<twitch api client id>"
TWITCH_CLIENT_SECRET="<twitch api client secret>"

DISCORD_PUBLIC="<discord api client id>"
DISCORD_SECRET="<discord api secret id>"
DISCORD_TOKEN="<discord login token>"
DISCORD_GUILD="<discord guild id>"
DISCORD_REDIRECT_URI="<discord redirect url>"

MONGODB="<mongodb connection string>"

OSURENDER="<o!rdr api key>"

DOWNLOADURL="<replay download server>"
```

After setting environment variables you can start the bot with:
```
$ node .
```



