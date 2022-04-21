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

let osuLink = /^(https:\/\/osu\.ppy\.sh\/beatmapsets\/)|([0-9]+)|\#osu^\/|([0-9]+)/g, osuMods = /^\+|(EZ)|(NF)|(HT)|(SD)|(HD)|(HR)|(DT)|(FL)|(RX)|(SO)/i, accessToken;

(() => {
    let twitch = new tmi.Client({ identity: { username: config.credentials.twitch.username, password: config.credentials.twitch.password }, channels: Object.keys(config.users) }),
        bancho = new Banchojs.BanchoClient({ username: config.credentials.osu.username, password: config.credentials.osu.password, apiKey: config.credentials.osu.apiKey }),
        discord = new Client({ intents: [ Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_PRESENCES, Intents.FLAGS.GUILD_MEMBERS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_WEBHOOKS, Intents.FLAGS.DIRECT_MESSAGES ] });

    if(!fs.existsSync("./access")) {
        console.log(`https://osu.ppy.sh/oauth/authorize?client_id=${config.credentials.osu.devApp.clientID}&redirect_uri=http://localhost:3000&response_type=code&scope=public`);
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
                    console.log(response.data);
                    fs.writeFileSync("./access", response.data.refresh_token);
                    process.exit(0);
                });
            }
        }).listen(3000);
        return;
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
            accessToken = response.data.access_token;
        });
    }

    twitch.connect().then(async () => {
        console.log("Twitch connected");
        await bancho.connect().then(() => console.log("Bancho connected"));
        await discord.login(config.credentials.discord.token).then(() => console.log("Discord connected"));

        twitch.on("message", (channel, tags, message, self) => {
            if(!Object.keys(config.users).includes(`${channel.replace(/\#/, "")}`)) return;

            message = message.split(" ");
            user = config.users[`${channel.replace(/\#/, "")}`];

            if(message[0] == "!np" || message[0] == "!nppp" || message[0] == "!pp") {
                console.log(`${channel} requested currentlyPlaying`);
                discord.guilds.cache.get(config.credentials.discord.guild).members.fetch(user.discord).then(u => {
                    if(!u.presence) return;

                    let currentlyPlaying = u.presence.activities.filter(x => x.name == "osu!" && x.type == "PLAYING")[0].details;
                    if(currentlyPlaying) {
                        axios({ 
                            method: "GET", 
                            url: `https://osu.ppy.sh/api/v2/beatmapsets/search?m=0&q=${currentlyPlaying}&s=any`,
                            headers: {
                                "Authorization": `Bearer ${accessToken}`,
                                "Content-Type": "application/json",
                                "Accept": "application/json"
                            }
                        })
                        .then(async response => {
                            for (x in response.data.beatmapsets) {
                                map = response.data.beatmapsets[x];
                                if(map.artist.match(/\w+.\w+/)[0] == currentlyPlaying.match(/\w+.\w+/)[0]) {
                                    found = map.beatmaps.find(o => o.version == currentlyPlaying.match(/(?!.*\[)(?<=\[).+?(?=\])/)[0]);
                                    if(found) {
                                        twitch.say(channel, `/me » ${currentlyPlaying} - ${found.url} | 95%: ${await calculate(found.id, 95)}pp | 98%: ${await calculate(found.id, 98)}pp | 99%: ${await calculate(found.id, 99)}pp | 100%: ${await calculate(found.id, 100)}pp | ${moment.utc(found.total_length*1000).format("mm:ss")} - ★ ${Math.round(found.difficulty_rating)} - ♫ ${(found.count_circles+found.count_sliders+found.count_spinners)} - AR${found.ar} - OD${found.accuracy}`);
                                        break;
                                    }
                                }
                            }
                        });
                    }
                });

                return;
            }

            if(message[0].match(osuLink) && message[0].match(osuLink)[0] == "https://osu.ppy.sh/beatmapsets/") {
                console.log(`${channel} requested Beatmap`);
                bancho.osuApi.beatmaps.getBySetId(message[0].match(osuLink)[1]).then(async (x) => {
                    if(x.length <= 0) return;

                    for(setId in x) {
                        if(x[setId].id == message[0].match(osuLink)[2]) {
                            beatmapCalc = x[setId];
                        }
                    }

                    if(!beatmapCalc) beatmapCalc = x[0];

                    bancho.getUser(user.osu).sendMessage(`[${tags["mod"] || tags["subscriber"] || tags["badges"] && tags.badges["vip"] ? "★" : "❥"}] ${tags["username"]} » [${message[0]} ${beatmapCalc.artist} - ${beatmapCalc.title} [${beatmapCalc.version}]]${message[1] && message[1].match(osuMods) ? " +"+message[1].replace(/^\+/, "").toUpperCase() : ""} | 95%: ${await calculate(beatmapCalc.id, 95, message[1])}pp | 98%: ${await calculate(beatmapCalc.id, 98, message[1])}pp | 99%: ${await calculate(beatmapCalc.id, 99, message[1])}pp | 100%: ${await calculate(beatmapCalc.id, 100, message[1])}pp | ${moment.utc(beatmapCalc.totalLength*1000).format("mm:ss")} - ★ ${Math.round(beatmapCalc.difficultyRating)} - ♫ ${(beatmapCalc.countNormal+beatmapCalc.countSlider+beatmapCalc.countSpinner)} - AR${beatmapCalc.diffApproach} - OD${beatmapCalc.diffOverall}`).then(() => {
                        twitch.say(channel, "/me Request sent!");
                    });
                });
            }
        });
    });
    
})();

function calculate(id, acc, mods = null) {
    return new Promise(async resolve => {
        if(mods && mods.match(osuLink)) mods = ModUtil.pcStringToMods(mods.replace(/^\+/, "").toUpperCase());

        beatmapInfo = await MapInfo.getInformation({ beatmapID: id });
        rating = new MapStars().calculate({ map: beatmapInfo.map, mods: mods });
        performance = new OsuPerformanceCalculator().calculate({ stars: rating.pcStars, accPercent: acc }).total;

        resolve(Math.round(performance));
    });
}