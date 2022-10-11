# streamhelper - osu.nzxl.space
This is the open repository of osu.nzxl.space - A free to use, simple and powerful osu! beatmap request bot.

# Usage
Sign up at [osu.nzxl.space](https://osu.nzxl.space)
This bot actively uses your Discord activity to grab important stuff e.g. the current playing map and osu! username.
Before authorizing the access, you should make sure that you've connected a Twitch account to your Discord account in order for the bot to join your chat.

# Features
Commands:
- !np - Show current playing map
- !nppp - Show current playing map with Performance Values
- !last - Show last playing map
- !lastpp - Show last playing map with Performance Values
_
Automatically grabs your stuff from the discord game activity = You don't need to run any other programs.
Just launch discord, start osu!game and enjoy.

# Roadmap
- Automatically render your new top plays using o!rdr
- Realtime embedded OBS overlays for PP, Score Farming, etc.
- Optional downloadable client for more funny stuff? Twitch chat integration? Channel Points rewards?
- Code optimization o_o

# Self-hosting setup
I don't really encourage people doing this, but you're free to do whatever you like with this project! :)

Requirements:
- MongoDB
- NodeJS v16.15+

```
- git clone https://github.com/nzxl-space/streamhelper
- cd streamhelper && npm i
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
```

Startup the bot:
```
node .
```



