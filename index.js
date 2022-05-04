const config = require("./config.json");
process.env["OSU_API_KEY"] = config.credentials.osu.apiKey;

const tmi = require("tmi.js");
const Banchojs = require("bancho.js");
const moment = require("moment");
const axios = require("axios");
const http = require("http");
const url = require("url");
const fs = require("fs");
const { Client, Intents } = require('discord.js');
const { MapInfo, ModUtil } = require("@rian8337/osu-base");
const { MapStars, OsuPerformanceCalculator } = require("@rian8337/osu-difficulty-calculator");
const NodeCache = require( "node-cache" );
const beatmapCache = new NodeCache();
const CronJob = require('cron').CronJob;

let osuLink = /^(https:\/\/osu\.ppy\.sh\/beatmapsets\/)|([0-9]+)|\#osu^\/|([0-9]+)/g, osuMods = /^\+|(EZ)|(NF)|(HT)|(SD)|(HD)|(HR)|(DT)|(FL)|(RX)|(SO)/i, accessToken, twitch, bancho, discord;

(() => {
    twitch = new tmi.Client({ identity: { username: config.credentials.twitch.username, password: config.credentials.twitch.password }, channels: Object.keys(config.users) });
    bancho = new Banchojs.BanchoClient({ username: config.credentials.osu.username, password: config.credentials.osu.password, apiKey: config.credentials.osu.apiKey });
    discord = new Client({ intents: [ Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_PRESENCES, Intents.FLAGS.GUILD_MEMBERS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_WEBHOOKS, Intents.FLAGS.DIRECT_MESSAGES ] });

    new CronJob('0 2 * * *', () => process.exit(1), null, true, 'UTC').start();

    twitch.connect().then(async () => {
        console.log("Twitch connected");
        await bancho.connect().then(() => console.log("Bancho connected"));
        await discord.login(config.credentials.discord.token).then(() => console.log("Discord connected"));
        accessToken = await generate();

        setInterval(() => {
            Object.keys(config.users).forEach(user => {
                discord.guilds.cache.get(config.credentials.discord.guild).members.fetch(config.users[`${user}`].discord).then(u => {
                    if(!u.presence) return;

                    if(u.presence.activities.filter(x => x.name == "osu!" && x.type == "PLAYING" && x.details).length >= 1) {
                        currentMap = u.presence.activities.filter(x => x.name == "osu!" && x.type == "PLAYING")[0].details;
                    
                        if(beatmapCache.get(`${config.users[`${user}`].discord}`) && beatmapCache.get(`${config.users[`${user}`].discord}`).map == currentMap)
                            return;
    
                        beatmapCache.set(`${config.users[`${user}`].discord}`, { map: currentMap, timestamp: Math.floor(Date.now() / 1000) });
                        console.log(`${config.users[`${user}`].osu} is playing ${currentMap}`);
                    }
                });
            });
        }, 3*1000);

        twitch.on("message", (channel, tags, message, self) => {
            if(!Object.keys(config.users).includes(`${channel.replace(/\#/, "")}`)) return;

            message = message.split(" ");
            user = config.users[`${channel.replace(/\#/, "")}`];

            if(message[0] == "!np") {
                console.log(`Request for currently playing map in ${channel}`);
                if(beatmapCache.get(`${user.discord}`)) {
                    axios({
                        method: "GET", 
                        url: `https://osu.ppy.sh/api/v2/beatmapsets/search?m=0&q=${beatmapCache.get(`${user.discord}`).map}&s=any`,
                        headers: {
                            "Authorization": `Bearer ${accessToken}`,
                            "Content-Type": "application/json",
                            "Accept": "application/json"
                        }
                    })
                    .then(async response => {
                        let wFound = false;
                        for (x in response.data.beatmapsets) {
                            map = response.data.beatmapsets[x];
                            currentlyPlaying = beatmapCache.get(`${user.discord}`).map;
                            mods = (message[1] && message[1].match(osuMods) ? message[1].replace(/^\+/, "").toUpperCase() : null);
                            if(map.artist.match(/\w+.\w+/)[0] == currentlyPlaying.match(/\w+.\w+/)[0]) {
                                found = map.beatmaps.find(o => o.version == currentlyPlaying.match(/(?!.*\[)(?<=\[).+?(?=\])/)[0]);
                                if(found) {
                                    wFound = true;
                                    calc = await calculate(found.id, mods);
                                    twitch.say(channel, `${moment.utc(beatmapCache.get(`${user.discord}`).timestamp*1000).format("HH:mm")} » ${currentlyPlaying}${mods ? " +"+mods : ""} - ${found.url} | 95%: ${calc.b}pp | 98%: ${calc.a}pp | 99%: ${calc.s}pp | 100%: ${calc.ss}pp | ${moment.utc(found.total_length*1000).format("mm:ss")} - ★ ${calc.stars} - ♫ ${(found.count_circles+found.count_sliders+found.count_spinners)} - AR${calc.ar} - OD${calc.od}`);
                                    break;
                                }
                            }
                        }

                        if(!wFound)
                            twitch.say(channel, "/me No data available");
                    });
                }

                return;
            }

            let beatmapLink, beatmapId, setId, modsText, beatmapCalc;
            message.forEach(msg => {
                if(msg.match(osuLink) && msg.match(osuLink)[0] == "https://osu.ppy.sh/beatmapsets/") {
                    beatmapLink = msg, beatmapId = msg.match(osuLink)[1], setId = msg.match(osuLink)[2];
                } else if(msg.match(osuMods)) {
                    modsText = msg.replace(/^\+/, "").toUpperCase();
                }
            });

            if(beatmapId) {
                console.log(`New map request in ${channel}`);
                bancho.osuApi.beatmaps.getBySetId(beatmapId).then(async (x) => {
                    if(x.length <= 0) return;

                    for(s in x) {
                        if(x[s].id == setId) {
                            beatmapCalc = x[s];
                        }
                    }

                    if(!beatmapCalc) beatmapCalc = x[0];

                    calc = await calculate(beatmapCalc.id, modsText);
                    bancho.getUser(user.osu).sendMessage(`[${tags["mod"] || tags["subscriber"] || tags["badges"] && tags.badges["vip"] ? "★" : "❥"}] ${tags["username"]} » [${beatmapLink} ${beatmapCalc.artist} - ${beatmapCalc.title} [${beatmapCalc.version}]] ${modsText ? "+"+modsText : ""} | 95%: ${calc.b}pp | 98%: ${calc.a}pp | 99%: ${calc.s}pp | 100%: ${calc.ss}pp | ${moment.utc(beatmapCalc.totalLength*1000).format("mm:ss")} - ★ ${calc.stars} - ♫ ${(beatmapCalc.countNormal+beatmapCalc.countSlider+beatmapCalc.countSpinner)} - AR${calc.ar} - OD${calc.od}`).then(() => {
                        twitch.say(channel, "/me Request sent!");
                    });
                });
            }
        });
    });
    
})();

function generate(accessToken = fs.existsSync("./access")) {
    return new Promise(resolve => {
        if(!accessToken) {
            http.createServer((req, res) => {
                let queryObject = url.parse(req.url, true).query;
                if(queryObject.code) {
                    res.writeHead(200);
                    res.end("<script>window.close();</script>");
        
                    axios({
                        method: "POST", 
                        url: `https://osu.ppy.sh/oauth/token`,
                        data: {
                            "client_id": config.credentials.osu.devApp.clientID,
                            "client_secret": config.credentials.osu.devApp.clientSecret,
                            "code": queryObject.code,
                            "grant_type": "authorization_code",
                            "redirect_uri": "http://localhost:3000"
                        },
                        headers: {
                            "Content-Type": "application/json",
                            "Accept": "application/json"
                        }
                    })
                    .then(response => {
                        fs.writeFileSync("./access", response.data.refresh_token);
                        resolve(response.data.access_token);
                    });
                }
            }).listen(3000);

            console.log(`AUTHORIZE: https://osu.ppy.sh/oauth/authorize?client_id=${config.credentials.osu.devApp.clientID}&redirect_uri=http://localhost:3000&response_type=code&scope=public`);
        } else {
            axios({
                method: "POST", 
                url: `https://osu.ppy.sh/oauth/token`,
                data: {
                    "client_id": config.credentials.osu.devApp.clientID,
                    "client_secret": config.credentials.osu.devApp.clientSecret,
                    "refresh_token": fs.readFileSync("./access", "utf8"),
                    "grant_type": "refresh_token",
                },
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                }
            })
            .then(response => {
                fs.writeFileSync("./access", response.data.refresh_token);
                resolve(response.data.access_token);
            });
        }
    });
}

function calculate(id, mods = null) {
    return new Promise(async resolve => {
        console.time(`Calculating ${id}`);

        if(mods && mods.match(osuMods)) mods = ModUtil.pcStringToMods(mods);
        beatmapInfo = await MapInfo.getInformation({ beatmapID: id });
        rating = new MapStars().calculate({ map: beatmapInfo.map, mods: mods });

        resolve({
            "b": Math.round(new OsuPerformanceCalculator().calculate({ stars: rating.pcStars, accPercent: 95 }).total),
            "a": Math.round(new OsuPerformanceCalculator().calculate({ stars: rating.pcStars, accPercent: 98 }).total),
            "s": Math.round(new OsuPerformanceCalculator().calculate({ stars: rating.pcStars, accPercent: 99 }).total),
            "ss": Math.round(new OsuPerformanceCalculator().calculate({ stars: rating.pcStars, accPercent: 100 }).total),
            "stars": Math.round(rating.pcStars.total * 100) / 100,
            "ar": Math.round(rating.pcStars.stats.ar * 100) / 100,
            "od": Math.round(rating.pcStars.stats.od * 100) / 100,
        });

        console.timeEnd(`Calculating ${id}`);
    });
}