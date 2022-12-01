[![Website](https://img.shields.io/website-up-down-green-red/https/osu.nzxl.space.svg)](https://osu.nzxl.space)
[![CodeFactor](https://www.codefactor.io/repository/github/nzxl-space/streamhelper/badge)](https://www.codefactor.io/repository/github/nzxl-space/streamhelper)
[![Discord](https://discord.com/api/guilds/1024630490336075827/widget.png)](https://osu.nzxl.space)  

# streamhelper - osu.nzxl.space
StreamHelper is a free to use, powerful and simple beatmap request bot for osu! players.  
The main purpose of this service is just to make every streamers life easier. It's only 3 clicks away, what are you waiting for?  

# How it works
The bot utilises Discord's Rich Presence feature to obtain beatmap data and looks at your Twitch account link to determine the correct twitch channel.

# Features
<b>osu!</b>
- !np [`<pp>`] [`<accuracy in %>` | `<mods>`]: obtain link and info to current beatmap
- !last [`<pp>`] [`<accuracy in %>` | `<mods>`]: obtain link and info to last beatmap
- Automatic rendered replay videos of your newly submitted scores using danser ([o!rdr](https://ordr.issou.best/))

<b>Management</b>
- !silence: toggle bot messages and disable all commands
- !request: toggle beatmap requests
- !blacklist: [`<username>`]: blacklist a user from sending requests
- !prefix: [`<new prefix>`]: change bot commands prefix

<b>Usage Examples</b>
```
    !nppp 94% +HDHR
    !nppp 100%
    !lastpp +DT
    !blacklist shigetora
    !prefix .
    https://osu.ppy.sh/beatmapsets/11443#osu/43868 -> streamer receives a dm in osu!
    https://link.issou.best/d8gcS -> Automatic rendered top play (thanks HowlPleb)
```

# Demo
[![Demo Video](https://yt-embed.herokuapp.com/embed?v=GACcNVDrZ7U)](https://www.youtube.com/watch?v=GACcNVDrZ7U)

# Why use this bot over another?
This bot can coexist with other bots, therefore, making it a great addition for features lacking in other bots.  
Unwanted features can be disabled, so that there are no problems with other bots in your chat.  
You can also request features to be added to the bot!  

# Getting Started
Setting up this bot is as easy as it gets. No downloads required.  
- Make sure your Discord Rich Presence (Game Activity) is properly working and your Discord account is linked with your Twitch channel
- Head over to [osu.nzxl.space](https://osu.nzxl.space/) and follow the steps shown on screen  

If you're having trouble setting up the bot, contact nzxl#6334 on Discord.

# Self-hosting this project
**By self-hosting you will lose access to the already existing huge pool of maps hosted on osu.nzxl.space**  
**You should only do this if you're concerned about your privacy or you're a nerd ✨**  
**⚠️ Things _can_ break randomly ⚠️**

<b>Requirements</b>
- NodeJS v16.15.1 or newer
- MongoDB with 3 replica sets
- [omkelderman/osu-replay-downloader](https://github.com/omkelderman/osu-replay-downloader), [kionell/osu-pp-calculator](https://github.com/kionell/osu-pp-calculator), [o!rdr](https://ordr.issou.best)

<b>Setup</b>
```
$ git clone https://github.com/nzxl-space/streamhelper
$ cd streamhelper
$ npm install
$ touch .env
```

<b>Contents of .env file</b>
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

AWS_ACCESS_KEY_ID="<filebase access key>"
AWS_SECRET_ACCESS_KEY="<file base secret key>"
S3="<bucket name>"
```

<b>Running the bot</b>
```
$ node .
```

# Roadmap
If you're interested in seeing what is coming next to you can go [here](https://github.com/nzxl-space/streamhelper/issues/40), there is still a lot to do.