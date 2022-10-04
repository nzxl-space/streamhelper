var debug = false;

// Utils
const Regex = {
    setId: /(?<=#osu\/|\/s\/)\d+/g,
    setIdBancho: /(?<=#\/|\/s\/)\d+/g,
    beatmapId: /(?<=beatmapsets\/|b\/)\d+/g,
    beatmapMods: /(NF|EZ|HD|HR|(SD|PF)|(NC|DT)|RX|HT|FL|SO)/ig
};
const moment = require("moment");
const path = require("path");
const fetch = require("node-fetch-retry");

require("dotenv").config();
require("log-prefix")(() => { return `[nzxl.space | ${moment(Date.now()).format("HH:mm:ss")}]`; });
process.on("unhandledRejection", error => console.error(error));

// MongoDB
const { MongoClient, ServerApiVersion } = require("mongodb");
const mongoClient = new MongoClient(process.env.MONGODB, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

// tmi.js
const tmi = require("tmi.js");
const twitchClient = new tmi.Client({
    identity: {
        username: process.env.TWITCH_USERNAME,
        password: process.env.TWITCH_PASSWORD
    }
});
let twitchApi = {
    accessToken: null,
    expires: 0
};

// osu! Bancho
const Banchojs = require("bancho.js");
const banchoClient = new Banchojs.BanchoClient({
    username: process.env.OSU_USERNAME,
    password: process.env.OSU_PASSWORD,
    apiKey: process.env.OSU_API_KEY
});
// const pp = require("rosu-pp");
const { BeatmapCalculator } = require("@kionell/osu-pp-calculator");
const pp = new BeatmapCalculator();
let osuApi = {
    accessToken: null,
    expires: 0
};

// Discord
const { Client, Intents } = require("discord.js");
const discordClient = new Client({
    partials: ["CHANNEL"],
    intents: [ Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_PRESENCES, Intents.FLAGS.DIRECT_MESSAGES, Intents.FLAGS.DIRECT_MESSAGE_TYPING ]
});
const DiscordOauth2 = require("discord-oauth2");
const oauth = new DiscordOauth2();

// Webserver
const express = require("express");
const { createServer } = require("http");
const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "static"));
app.use(express.static(path.join(__dirname, "static")));
const httpServer = createServer(app);

(() => {
    let db, discordUsers, currentlyPlaying = {};
    mongoClient.connect(async err => {
        if(err) return console.log("MongoDB failed!");

        db = mongoClient.db("osu");
        discordUsers = await db.collection("users").distinct("userId");

        console.log("MongoDB connected!");
    });

    banchoClient.connect();
    banchoClient.on("connected", () => {
        console.log(`Bancho connected as ${process.env.OSU_USERNAME}!`);
    });

    discordClient.login(process.env.DISCORD_TOKEN);
    discordClient.on("ready", () => {
        console.log(`Discord connected as ${discordClient.user.tag}!`);
        discordClient.user.setPresence({ activities: [{ name: "osu!", type: "PLAYING" }], status: "dnd" });

        discordClient.on("guildMemberRemove", async (member) => {
            await db.collection("users").deleteOne({ userId: member.id });
            if(discordUsers.indexOf(member.id) > -1)
                discordUsers.splice(discordUsers.indexOf(member.id), 1);
        });

        setInterval(async () => {
            for(let i = 0; i < discordUsers.length; i++) {
                discordClient.guilds.cache.get(process.env.DISCORD_GUILD).members.cache
                .filter(x => x.id == discordUsers[i])
                .map(discordUser => {
                    if(!discordUser.presence || discordUser.presence && discordUser.presence.activities.length <= 0) return;
                    db.collection("users").find({ userId: discordUsers[i] }).toArray(async (err, result) => {
                        if(err || result && result.length <= 0) return debug ? console.log("discordUser not found in database") : true;
                        let user = result[0],
                            activity = discordUser.presence.activities.filter(x => x.name == "osu!");

                        if(await liveStatus(user.twitch) == false) {
                            if(twitchClient.getChannels().includes(`#${user.twitch}`)) {
                                twitchClient.part(`#${user.twitch}`);
                                console.log(`Left channel #${user.twitch}`);
                            }
                        } else {
                            if(!twitchClient.getChannels().includes(`#${user.twitch}`)) {
                                twitchClient.join(`#${user.twitch}`);
                                console.log(`Listening for requests on #${user.twitch}`);
                            }
                        }

                        if(!currentlyPlaying[`#${user.twitch}`]) {
                            let score = await pp.calculate({ beatmapId: 673086 });
                            currentlyPlaying[`#${user.twitch}`] = {
                                name: "yanaginagi - Haru Modoki [Spring]",
                                mapData: await lookupBeatmap("yanaginagi - Haru Modoki [Spring]"),
                                ppData: {
                                    A: Math.round(score.performance[0].totalPerformance),
                                    S: Math.round(score.performance[1].totalPerformance),
                                    X: Math.round(score.performance[2].totalPerformance)
                                },
                                previousMap: null
                            }
                        }


                        if(activity.length >= 1 && activity[0].details != null) {
                            if(user.osu == null) {
                                let osuUsername = activity[0].assets.largeText.match(/^\w+/);
                                db.collection("users").updateOne({ userId: discordUsers[i] }, { $set: { osu: osuUsername[0] } }, (err, result) => {
                                    if(err || !result) return debug ? console.log(`discord id with osu username ${osuUsername[0]} not found in database`) : true;
                                    if(debug) console.log(`Updated ${osuUsername[0]} database record`);
                                });
                            }
                            
                            if(activity[0].details && currentlyPlaying[`#${user.twitch}`].name != activity[0].details) {
                                let map = await lookupBeatmap(activity[0].details);
                                let score = await pp.calculate({ beatmapId: map.id });

                                currentlyPlaying[`#${user.twitch}`] = {
                                    name: activity[0].details,
                                    mapData: map,
                                    ppData: {
                                        A: Math.round(score.performance[0].totalPerformance),
                                        S: Math.round(score.performance[1].totalPerformance),
                                        X: Math.round(score.performance[2].totalPerformance)
                                    },
                                    previousMap: currentlyPlaying[`#${user.twitch}`]
                                }

                                db.collection("map_data").find({ setId: map.id }).toArray((err, result) => {
                                    if(err) return debug ? console.log("Error occured while trying to find map id") : true;
                                    if(result && result.length >= 1) {
                                        if(result[0].ppData.A != currentlyPlaying[`#${user.twitch}`].ppData.A || result[0].ppData.S != currentlyPlaying[`#${user.twitch}`].ppData.S || result[0].ppData.X != currentlyPlaying[`#${user.twitch}`].ppData.X) {
                                            db.collection("map_data").updateOne({ setId: map.id }, { $set: { ppData: currentlyPlaying[`#${user.twitch}`].ppData } }, (err, result) => {
                                                if(err || !result) return console.log(`Failed to update ${map.id}`);
                                                if(debug) console.log(`Updated ${map.id} from map_data`);
                                            });
                                        }

                                        return;
                                    }

                                    db.collection("map_data").insertOne({
                                        setId: map.id,
                                        mapData: currentlyPlaying[`#${user.twitch}`].mapData,
                                        ppData: currentlyPlaying[`#${user.twitch}`].ppData
                                    });

                                    if(debug) console.log(`Insert ${map.id} into map_data`);
                                });

                                if(debug) console.log(currentlyPlaying[`#${user.twitch}`].name + "," + JSON.stringify(currentlyPlaying[`#${user.twitch}`].ppData) + "|" + currentlyPlaying[`#${user.twitch}`].previousMap.name + "," + JSON.stringify(currentlyPlaying[`#${user.twitch}`].previousMap.ppData));
                            }
                        }
                    });
                });
            }
        }, 10*1000);
    });

    twitchClient.connect();
    twitchClient.on("connected", () => {
        console.log(`Twitch connected as ${process.env.TWITCH_USERNAME}!`);
        if(twitchClient.listeners("message").length <= 0) {
            twitchClient.on("message", async (channel, tags, message, self) => {
                if(debug) console.log(`New message from ${channel}`);
                let beatmapId = message.match(Regex.beatmapId),
                    setId = message.match(Regex.setId),
                    mods = message.replace(/http|https/g, "").match(Regex.beatmapMods);

                if(beatmapId) {
                    let map = await banchoClient.osuApi.beatmaps.getBySetId(beatmapId[0]);
                    if(!map || map.length <= 0) await banchoClient.osuApi.beatmaps.getByBeatmapId(beatmapId[0]);

                    if(setId && map.length >= 1)
                        map = map.filter(x => x.id == setId);

                    db.collection("users").find({ twitch: channel.replace("#", "") }).toArray(async (err, result) => {
                        if(err || result && result.length <= 0) return;
                        if(result[0].osu == null) return;
                        banchoClient.getUser(result[0].osu).sendMessage(`${tags["username"]} » [https://osu.ppy.sh/b/${map[0].beatmapId} ${map[0].artist} ${map[0].title} [${map[0].version}]] ${mods ? `+${mods.join("").toUpperCase()}` : "+NM"} | ${moment(map[0].totalLength*1000).format("mm:ss")} - ★ ${Math.round(map[0].difficultyRating * 100) / 100} - AR${map[0].approachRate}`);
                        if(debug) console.log(`Beatmap request sent to ${result[0].osu}`);
                    });

                    return;
                }

                message = message.split(" ");
                let command = message[0].startsWith("!") ? message.splice(0, 1) : null;
                switch (command) {
                    case "!np":
                        if(currentlyPlaying[`${channel}`]) {
                            twitchClient.say(channel, `${currentlyPlaying[`${channel}`].name} | ${moment(currentlyPlaying[`${channel}`].mapData.total_length*1000).format("mm:ss")} - ★ ${Math.round(currentlyPlaying[`${channel}`].mapData.difficulty_rating * 100) / 100} - AR${currentlyPlaying[`${channel}`].mapData.ar} | ${currentlyPlaying[`${channel}`].mapData.url}`);
                            if(debug) console.log(`Sent !np to ${channel}`);
                        }
                        break;
                    case "!nppp":
                        if(currentlyPlaying[`${channel}`]) {
                            twitchClient.say(channel, `${currentlyPlaying[`${channel}`].name} | ${moment(currentlyPlaying[`${channel}`].mapData.total_length*1000).format("mm:ss")} - ★ ${Math.round(currentlyPlaying[`${channel}`].mapData.difficulty_rating * 100) / 100} - AR${currentlyPlaying[`${channel}`].mapData.ar} | 98%: ${currentlyPlaying[`${channel}`]}.ppData.A - 99%: ${currentlyPlaying[`${channel}`]}.ppData.S - 100%: ${currentlyPlaying[`${channel}`]}.ppData.X | ${currentlyPlaying[`${channel}`].mapData.url}`);
                            if(debug) console.log(`Sent !nppp to ${channel}`);
                        }
                        break;
                    case "!last":
                        if(currentlyPlaying[`${channel}`] && currentlyPlaying[`${channel}`].previousMap) {
                            twitchClient.say(channel, `${currentlyPlaying[`${channel}`].previousMap.name} | ${moment(currentlyPlaying[`${channel}`].previousMap.mapData.total_length*1000).format("mm:ss")} - ★ ${Math.round(currentlyPlaying[`${channel}`].previousMap.mapData.difficulty_rating * 100) / 100} - AR${currentlyPlaying[`${channel}`].previousMap.mapData.ar} | ${currentlyPlaying[`${channel}`].previousMap.mapData.url}`);
                            if(debug) console.log(`Sent !last to ${channel}`);
                        }
                        break;
                    case "!lastpp":
                        if(currentlyPlaying[`${channel}`] && currentlyPlaying[`${channel}`].previousMap) {
                            twitchClient.say(channel, `${currentlyPlaying[`${channel}`].previousMap.name} | ${moment(currentlyPlaying[`${channel}`].previousMap.mapData.total_length*1000).format("mm:ss")} - ★ ${Math.round(currentlyPlaying[`${channel}`].previousMap.mapData.difficulty_rating * 100) / 100} - AR${currentlyPlaying[`${channel}`].previousMap.mapData.ar} | 98%: ${currentlyPlaying[`${channel}`]}.previousMap.ppData.A - 99%: ${currentlyPlaying[`${channel}`]}.previousMap.ppData.S - 100%: ${currentlyPlaying[`${channel}`]}.previousMap.ppData.X | ${currentlyPlaying[`${channel}`].previousMap.mapData.url}`);
                            if(debug) console.log(`Sent !lastpp to ${channel}`);
                        }
                        break;
                    case "!help":
                        twitchClient.say(channel, "!np - Show currently playing map | !nppp - Show currently playing map and pp values | !last - Show previously played map | !lastpp - Show previously played map and pp values");
                        if(debug) console.log(`Sent !help to ${channel}`);
                        break;
                }
            });
        }
    });

    httpServer.listen(process.env.PORT || 2048, () => {
        console.log(`Listening on port ${httpServer.address().port}!`);
        app.get("/", (req, res) => {
            res.render("index", { discordURL: `https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_PUBLIC}&redirect_uri=${process.env.DISCORD_REDIRECT_URI}&response_type=code&scope=identify%20connections%20guilds.join` });
        });

        app.get("/discord", (req, res) => {
            if(req.query.code) {
                oauth.tokenRequest({
                    clientId: process.env.DISCORD_PUBLIC,
                    clientSecret: process.env.DISCORD_SECRET,
                    code: req.query.code,
                    scope: "identify guilds",
                    grantType: "authorization_code",
                    redirectUri: process.env.DISCORD_REDIRECT_URI
                }).then((data) => {
                    if(!data || data && !data["access_token"]) return;
    
                    oauth.getUser(data.access_token).then((user) => {
                        oauth.addMember({
                            accessToken: data.access_token,
                            botToken: process.env.DISCORD_TOKEN,
                            guildId: process.env.DISCORD_GUILD,
                            userId: user.id
                        }).then(() => {
                            oauth.getUserConnections(data.access_token).then((c) => {
                                db.collection("users").find({ userId: user.id }).toArray((err, result) => {
                                    if(err || result.length <= 0) {
                                        let twitch = c.filter(x => x.type == "twitch");
                                        if(twitch.length <= 0) return discordClient.guilds.cache.get(process.env.DISCORD_GUILD)
                                        .members.cache.get(user.id)
                                        .send("Twitch channel not found. Did you link it correctly with Discord? Try again when you linked it by re-authorizing! :)");
    
                                        db.collection("users").insertOne({
                                            userId: user.id,
                                            discordName: `${user.username}#${user.discriminator}`,
                                            twitch: `${twitch[0].name}`,
                                            osu: null
                                        });
                                        discordUsers.push(user.id);
                                        if(debug) console.log(`${user.id} registered to service`);
                                    }
                                });
                            });
                        }).catch((err) => err);
                    });
                });
            }

            res.send("<script>window.close()</script>");
        });
    });
})();

function liveStatus(channel) {
    return new Promise(async (resolve) => {
        if(!twitchApi.accessToken || (twitchApi.expires-Math.floor(Date.now() / 1000)) <= 1000) {
            await fetch(`https://id.twitch.tv/oauth2/token?client_id=${process.env.TWITCH_CLIENT_ID}&client_secret=${process.env.TWITCH_CLIENT_SECRET}&grant_type=client_credentials`, { 
                method: "POST",
                retry: 3,
                pause: 5000
            }).then(async result => {
                result = await result.json();
                twitchApi.accessToken = result.access_token;
                twitchApi.expires = (Math.floor(Date.now() / 1000)+result.expires_in);
                if(debug) console.log("twitchApi refreshed");
            });
        }

        await fetch(`https://api.twitch.tv/helix/streams?user_login=${channel}`, {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": `Bearer ${twitchApi.accessToken}`,
                "Client-Id": process.env.TWITCH_CLIENT_ID
            },
            retry: 3,
            pause: 5000
        }).then(async result => {
            result = await result.json();
            if(debug) console.log(`${channel} liveStatus ${result.data.length >= 1 ? true : false}`);
            resolve(result.data.length >= 1 ? true : false);
        });
    });
}

function lookupBeatmap(beatmapName) {
    return new Promise(async (resolve, reject) => {
        if(!osuApi.accessToken || (osuApi.expires-Math.floor(Date.now() / 1000)) <= 1000) {
            await fetch(`https://osu.ppy.sh/oauth/token`, {
                method: "POST",
                body: JSON.stringify({
                    client_id: process.env.OSU_CLIENT_ID,
                    client_secret: process.env.OSU_CLIENT_SECRET,
                    grant_type: "client_credentials",
                    scope: "public"
                }),
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json"
                },
                retry: 3,
                pause: 5000
            }).then(async result => {
                result = await result.json();
                osuApi.accessToken = result.access_token;
                osuApi.expires = (Math.floor(Date.now() / 1000)+result.expires_in);
                if(debug) console.log("osuApi refreshed");
            });
        }

        await fetch(`https://osu.ppy.sh/api/v2/beatmapsets/search?m=0&q=${beatmapName}&s=any`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${osuApi.accessToken}`,
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            retry: 3,
            pause: 5000
        }).then(async result => {
            result = await result.json();
            for(let i in result.beatmapsets) {
                let map = result.beatmapsets[i],
                    artist = beatmapName.match(/^(.*?)\s-\s(.*?)$/)[1],
                    version = beatmapName.match(/(?!.*\[)(?<=\[).+?(?=\])/)[0];

                if(!map)
                    return reject("No map found");

                if(map.artist == artist) {
                    let foundMap = map.beatmaps.find(m => m.version == version);
                    if(foundMap) {
                        if(debug) console.log(`Found map on lookup: ${foundMap.id}`);
                        resolve(foundMap);
                    }
                }
            }
        })
    });
}