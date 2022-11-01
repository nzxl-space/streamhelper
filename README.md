[![Website](https://img.shields.io/website-up-down-green-red/https/osu.nzxl.space.svg)](https://osu.nzxl.space)
[![CodeFactor](https://www.codefactor.io/repository/github/nzxl-space/streamhelper/badge)](https://www.codefactor.io/repository/github/nzxl-space/streamhelper)
[![Discord](https://discord.com/api/guilds/1024630490336075827/widget.png)](https://osu.nzxl.space)  

# streamhelper - osu.nzxl.space

StreamHelper is a free to use, powerful and simple *beatmap request* bot for osu! players.  
The main purpose of this service is just to make every streamers life easier. It's only 3 clicks away, what are you waiting for?


# Registration
**Heads Up!** For this service you need to have a working *Discord Presence* and a linked *Twitch account* to your *Discord*.  

Why is this needed you ask?  
The bot heavely depends on *Discord* data, mainly so that you don't need to download any other third party software.  

After checking that you have both a working *Discord Presence* and a linked *Twitch account*, all you need to is head over to [osu.nzxl.space](https://osu.nzxl.space) and follow the steps on screen.

# Demonstration
[![Demo Video](https://yt-embed.herokuapp.com/embed?v=GACcNVDrZ7U)](https://www.youtube.com/watch?v=GACcNVDrZ7U)

# Features (WIP)
1. [x] Twitch chat commands
- !np - Show current playing map
- !last - Show previous played map
- *You can add `pp` to the commands to show the performance values of a map. Example: !nppp 94% +HDHR - !nppp 100% - !nppp +DT*
2. [x] Automatic rendered replays using o!rdr (Danser)
3. [ ] Realtime embedded OBS overlays for Performance, Score, etc.
4. [ ] Beatmap recommendation algorithm (Database population already running 🏃‍♂️)

# Setup
**This is only recommended if you're a REAL nerd, because some things can break randomly.**

1. Requirements:
- NodeJS (any version after v16)
- MongoDB
- [omkelderman/osu-replay-downloader](https://github.com/omkelderman/osu-replay-downloader)
- [kionell/osu-pp-calculator](https://github.com/kionell/osu-pp-calculator)
- [o!rdr](https://ordr.issou.best)

2. Setup
```
$ git clone https://github.com/nzxl-space/streamhelper
$ cd streamhelper
$ npm install
$ touch .env
```

3. Contents of .env file
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

4. Running the bot
```
$ node .
```

GLHF! 😎

# Roadmap and Contributors
*Fix code*  
If you find any issues or have feature requests, feel free to open up a PR!!!
