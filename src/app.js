// Utils
const Regex = {
    setId: /(?<=#osu\/|\/s\/)\d+/g,
    beatmapId: /(?<=beatmapsets\/|b\/)\d+/g,
    beatmapMods: /(NF|EZ|HD|HR|(SD|PF)|(NC|DT)|RX|HT|FL|SO)/ig
};
const moment = require("moment");
const path = require("path");
const fetch = require("node-fetch");

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
let twitch_accessToken;

// osu! Bancho
const Banchojs = require("bancho.js");
const banchoClient = new Banchojs.BanchoClient({
    username: process.env.OSU_USERNAME,
    password: process.env.OSU_PASSWORD,
    apiKey: process.env.OSU_API_KEY
});
// const pp = require("rosu-pp");
let osu_accessToken;

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
        if(banchoClient.listeners("PM").length <= 0) {
            banchoClient.on("PM", (data) => {
                // listen to /np and calculate
                // console.log(data.message);
            });
        }
    });

    discordClient.login(process.env.DISCORD_TOKEN);
    discordClient.on("ready", () => {
        console.log(`Discord connected as ${discordClient.user.tag}!`);
        discordClient.user.setPresence({ activities: [{ name: "osu!", type: "PLAYING" }], status: "dnd" });

        setInterval(() => {
            for(let i = 0; i < discordUsers.length; i++) {
                discordClient.guilds.cache.get(process.env.DISCORD_GUILD).members.cache
                .filter(x => x.id == discordUsers[i])
                .map(discordUser => {
                    if(!discordUser.presence || discordUser.presence && discordUser.presence.activities.length <= 0) return;
                    db.collection("users").find({ userId: discordUsers[i] }).toArray(async (err, result) => {
                        if(err || result && result.length <= 0) return;
                        let user = result[0],
                            activity = discordUser.presence.activities.filter(x => x.name == "osu!");

                        if(activity.length >= 1 && activity[0].details != null) {
                            if(user.osu == null) {
                                let osuUsername = activity[0].assets.largeText.match(/^\w+/);
                                db.collection("users").updateOne({ userId: discordUsers[i] }, { $set: { osu: osuUsername[0] } }, (err, result) => {
                                    if(err || !result) return;
                                });
                            }

                            if(!twitchClient.getChannels().includes(`#${user.twitch}`) && await liveStatus(user.twitch) == true) {
                                twitchClient.join(`#${user.twitch}`);
                                console.log(`Listening for requests on #${user.twitch}`);
                            }

                            if(activity[0].details) {
                                currentlyPlaying[`#${user.twitch}`] = {};
                                currentlyPlaying[`#${user.twitch}`].name = activity[0].details;
                                currentlyPlaying[`#${user.twitch}`].mapData = await lookupBeatmap(activity[0].details);
                            }
                        } else {
                            if(twitchClient.getChannels().includes(`#${user.twitch}`)) {
                                twitchClient.part(`#${user.twitch}`);
                                console.log(`Left channel #${user.twitch}`);
                            }
                        }
                    });
                });
            }
        }, 15*1000);
    });

    twitchClient.connect();
    twitchClient.on("connected", () => {
        console.log(`Twitch connected as ${process.env.TWITCH_USERNAME}!`);
        if(twitchClient.listeners("message").length <= 0) {
            twitchClient.on("message", async (channel, tags, message, self) => {
                if(message.startsWith("!np")) {
                    twitchClient.say(channel, `${currentlyPlaying[`${channel}`].name} | ${moment(currentlyPlaying[`${channel}`].mapData.total_length*1000).format("mm:ss")} - ★ ${Math.round(currentlyPlaying[`${channel}`].mapData.difficulty_rating * 100) / 100} - AR${currentlyPlaying[`${channel}`].mapData.ar} | ${currentlyPlaying[`${channel}`].mapData.url}`);
                    return;
                }

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
                        banchoClient.getUser(result[0].osu).sendMessage(`${tags["username"]} » [https://osu.ppy.sh/b/${map[0].beatmapId} ${map[0].artist} ${map[0].title} [${map[0].version}]] ${mods ? `+${mods.join("").toUpperCase()}` : "+NM"} | ${moment(map[0].totalLength*1000).format("mm:ss")} - ★ ${Math.round(map[0].difficultyRating * 100) / 100} - AR${map[0].approachRate}`);
                    });
                }
            });
        }
    });

    httpServer.listen(process.env.PORT || 2048, () => {
        console.log(`Listening on port ${httpServer.address().port}!`);
        app.get("/", (req, res) => {
            res.render("index");
        });

        app.get("/discord", (req, res) => {
            if(!req.query.code) return;

            oauth.tokenRequest({
                clientId: process.env.DISCORD_PUBLIC,
                clientSecret: process.env.DISCORD_SECRET,
                code: req.query.code,
                scope: "identify guilds",
                grantType: "authorization_code",
                redirectUri: process.env.DISCORD_REDIRECT_URI
            }).then((data) => {
                if(!data || data && !data["access_token"]) return;

                oauth.getUser(data.access_token).then(async (user) => {
                    await oauth.addMember({
                        accessToken: data.access_token,
                        botToken: process.env.DISCORD_TOKEN,
                        guildId: process.env.DISCORD_GUILD,
                        userId: user.id
                    });

                    oauth.getUserConnections(data.access_token).then((c) => {
                        db.collection("users").find({ userId: user.id }).toArray((err, result) => {
                            if(err || result.length <= 0) {
                                db.collection("users").insertOne({
                                    userId: user.id,
                                    discordName: `${user.username}#${user.discriminator}`,
                                    twitch: `${c.filter(x => x.type == "twitch")[0].name}`,
                                    osu: null
                                });
                                discordUsers.push(user.id);
                            }
                        });
                    });
                });
            });

            res.send("<script>window.close()</script>");
        });
    });
})();

function liveStatus(channel) {
    return new Promise(async (resolve) => {
        if(!twitch_accessToken) {
            await fetch(`https://id.twitch.tv/oauth2/token?client_id=${process.env.TWITCH_CLIENT_ID}&client_secret=${process.env.TWITCH_CLIENT_SECRET}&grant_type=client_credentials`, { 
                method: "POST"
            }).then(async result => {
                result = await result.json();
                twitch_accessToken = result.access_token;
            });
        }

        await fetch(`https://api.twitch.tv/helix/streams?user_login=${channel}`, {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": `Bearer ${twitch_accessToken}`,
                "Client-Id": process.env.TWITCH_CLIENT_ID
            }
        }).then(async result => {
            result = await result.json();
            resolve(result.data.length >= 1 ? true : false);
        });
    });
}

function lookupBeatmap(beatmapName) {
    return new Promise(async (resolve) => {
        if(!osu_accessToken) {
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
                }
            }).then(async result => {
                result = await result.json();
                osu_accessToken = result.access_token;
            });
        }

        await fetch(`https://osu.ppy.sh/api/v2/beatmapsets/search?m=0&q=${beatmapName}&s=any`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${osu_accessToken}`,
                "Content-Type": "application/json",
                "Accept": "application/json"
            }
        }).then(async result => {
            result = await result.json();
            for(let i in result.beatmapsets) {
                let map = result.beatmapsets[i];
                if(map.artist.match(/\w+.\w+/) && map.artist.match(/\w+.\w+/)[0] == beatmapName.match(/\w+.\w+/)[0]) {
                    let foundMap = map.beatmaps.find(o => o.version == beatmapName.match(/(?!.*\[)(?<=\[).+?(?=\])/)[0]);
                    if(foundMap) {
                        resolve(foundMap);
                    }
                }
            }
        })
    });
}