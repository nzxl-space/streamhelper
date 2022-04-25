
# Twitch Bot for osu! gamers

It's basically like [Mikuia](https://github.com/Mikuia/mikuia-core), but since it's dead I've decided to create my own one.  
This is *NOT* a scalable application and it for sure can't handle more than 10 channels.  
It can handle beatmap requests though and also can get the currently playing beatmap (!np).

## Deployment

Requirements  
* Node v16.14 or newer installed 

```bash
git clone nzxl101/beatmap-request
cd beatmap-request && npm i
node index.js
```

*Rename `config.json.example` to `config.json` and fill in the stuff before starting for first time.  
You will then be greeted with a url to authorize your osu! account, this is used for apiv2 specifically beatmap search queries.*  
**Reminder: The specified twitch channel user needs to be in the same Discord guild as the bot and needs to have game activities enabled.**

* https://old.ppy.sh/p/irc
* https://twitchapps.com/tmi/
* https://discord.com/developers/applications


## Credits

Thanks to @Rian8337 for providing a simple library to calculate Performance Points locally.  
You can check out his [repo](https://github.com/Rian8337/osu-droid-module) here.