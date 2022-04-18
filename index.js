require('dotenv').config();
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
    let twitch = new tmi.Client({ identity: { username: process.env["TWITCH_USERNAME"], password: process.env["TWITCH_PASSWORD"] }, channels: [process.env["TWITCH_CHANNEL"]] }),
        bancho = new Banchojs.BanchoClient({ username: process.env["OSU_MASTER"], password: process.env["OSU_PASSWORD"], apiKey: process.env["OSU_API_KEY"] }),
        discord = new Client({ intents: [ Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_PRESENCES, Intents.FLAGS.GUILD_MEMBERS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_WEBHOOKS, Intents.FLAGS.DIRECT_MESSAGES ] });

    if(!fs.existsSync("./access")) {
        console.log(`https://osu.ppy.sh/oauth/authorize?client_id=${process.env["OSU_CLIENT_ID"]}&redirect_uri=http://localhost:3000&response_type=code&scope=public`);
        http.createServer((req, res) => {
            let queryObject = url.parse(req.url, true).query;
            if(queryObject.code) {
                res.writeHead(200);
                res.end("<script>window.close();</script>");
    
                axios({
                    method: "POST", 
                    url: `https://osu.ppy.sh/oauth/token`,
                    data: {
                        "client_id": process.env["OSU_CLIENT_ID"],
                        "client_secret": process.env["OSU_CLIENT_SECRET"],
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
                "client_id": process.env["OSU_CLIENT_ID"],
                "client_secret": process.env["OSU_CLIENT_SECRET"],
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
        await discord.login(process.env["DISCORD_TOKEN"]);

        discord.on("ready", () => console.log("Discord connected"));

        twitch.on("message", (channel, tags, message, self) => {
            message = message.split(" ");

            if(message[0] == "!np" || message[0] == "!nppp" || message[0] == "!pp") {
                let currentlyPlaying;
                discord.guilds.cache.get(process.env["DISCORD_GUILD"]).members.fetch(process.env["DISCORD_USER"]).then(user => {
                    user.presence.activities.forEach(x => {
                        if(x.name == "osu!" && x.type == "PLAYING") {
                            currentlyPlaying = x.details;
                        }
                    });

                    if(currentlyPlaying) {
                        axios({ 
                            method: "GET", 
                            url: `https://osu.ppy.sh/api/v2/beatmapsets/search?m=0&q=${currentlyPlaying}&s=any&cursor=1`,
                            headers: {
                                "Authorization": `Bearer ${accessToken}`,
                                "Content-Type": "application/json",
                                "Accept": "application/json"
                            }
                        })
                        .then(response => {
                            let success = false;
                            response.data.beatmapsets.forEach(async x => {
                                if(success) return;
                                if(x.artist.match(/\w+.\w+/)[0] == currentlyPlaying.match(/\w+.\w+/)[0] && x.beatmaps.find(o => o.version == currentlyPlaying.match(/(?<=\[).+?(?=\])/)[0])) {
                                    success = true;
                                    let found = x.beatmaps.find(o => o.version == currentlyPlaying.match(/(?<=\[).+?(?=\])/)[0]), beatmapInfo, rating;

                                    beatmapInfo = await MapInfo.getInformation({ beatmapID: found.id });
                                    rating = await new MapStars().calculate({ map: beatmapInfo.map });

                                    twitch.say(channel, `/me » ${currentlyPlaying} - ${found.url} | 95%: ${Math.round(await new OsuPerformanceCalculator().calculate({ stars: rating.pcStars, accPercent: 95 }).total)}pp | 98%: ${Math.round(await new OsuPerformanceCalculator().calculate({ stars: rating.pcStars, accPercent: 98 }).total)}pp | 99%: ${Math.round(await new OsuPerformanceCalculator().calculate({ stars: rating.pcStars, accPercent: 99 }).total)}pp | 100%: ${Math.round(await new OsuPerformanceCalculator().calculate({ stars: rating.pcStars, accPercent: 100 }).total)}pp | ${moment.utc(found.total_length*1000).format("mm:ss")} - ★ ${Math.round(found.difficulty_rating)} - ♫ ${(found.count_circles+found.count_sliders+found.count_spinners)} - AR${found.ar} - OD${found.accuracy}`);
                                }
                            });

                            if(!success) {
                                twitch.say(channel, `/me No data available`);
                            }
                        });
                    } else {
                        twitch.say(channel, `/me Not playing anything at the moment`);
                    }
                });
                return;
            }

            if(message[0].match(osuLink) && message[0].match(osuLink)[0] == "https://osu.ppy.sh/beatmapsets/") {
                let beatmap = message[0].match(osuLink)[1], diff = message[0].match(osuLink)[2], beatmapCalc = undefined, beatmapInfo, rating, mods;
                bancho.osuApi.beatmaps.getBySetId(beatmap).then(async (x) => {
                    if(x.length <= 0) return;

                    for(setId in x) {
                        if(x[setId].id == diff) {
                            beatmapCalc = x[setId];
                        }
                    }

                    if(!beatmapCalc) beatmapCalc = x[0];

                    if(message[1] && message[1].match(osuMods))
                        mods = await ModUtil.pcStringToMods(message[1].replace(/^\+/, "").toUpperCase());

                    beatmapInfo = await MapInfo.getInformation({ beatmapID: beatmapCalc.id });
                    rating = await new MapStars().calculate({ map: beatmapInfo.map, mods: mods });

                    bancho.getUser(process.env["OSU_USERNAME"]).sendMessage(`[${tags["mod"] == true ? "MOD" : tags["subscriber"] == true ? "SUB" : tags["badges"] && tags.badges["vip"] ? "VIP" : "VIEWER"}] ${tags["username"]} » [${message[0]} ${beatmapCalc.artist} - ${beatmapCalc.title} [${beatmapCalc.version}]]${message[1] && message[1].match(osuMods) ? " +"+message[1].replace(/^\+/, "").toUpperCase() : ""} | 95%: ${Math.round(await new OsuPerformanceCalculator().calculate({ stars: rating.pcStars, accPercent: 95 }).total)}pp | 98%: ${Math.round(await new OsuPerformanceCalculator().calculate({ stars: rating.pcStars, accPercent: 98 }).total)}pp | 99%: ${Math.round(await new OsuPerformanceCalculator().calculate({ stars: rating.pcStars, accPercent: 99 }).total)}pp | 100%: ${Math.round(await new OsuPerformanceCalculator().calculate({ stars: rating.pcStars, accPercent: 100 }).total)}pp | ${moment.utc(beatmapCalc.totalLength*1000).format("mm:ss")} - ★ ${Math.round(beatmapCalc.difficultyRating)} - ♫ ${(beatmapCalc.countNormal+beatmapCalc.countSlider+beatmapCalc.countSpinner)} - AR${beatmapCalc.diffApproach} - OD${beatmapCalc.diffOverall}`);
                    twitch.say(channel, "/me Request sent!");
                });
            }
        });
    });
    
})();