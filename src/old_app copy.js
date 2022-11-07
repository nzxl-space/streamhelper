process.noDeprecation = true;
const c = require("../constants.js");

// Utils
const Regex = {
    setId: /(?<=beatmapsets\/|\/s\/)\d+/,
    beatmapId: /(?<=beatmaps\/|b\/|#osu\/|#taiko\/|#fruits\/|#mania\/)\d+/,
    beatmapMods: /(?<=\+)(?:NF|EZ|HD|HR|(SD|PF)|(NC|DT)|RX|HT|FL|SO)+/ig,
    Accuracy: /100[%]|[123456789][0-9][%]|[0-9][%]/g
};
const moment = require("moment");
const path = require("path");
const fetch = require("node-fetch-retry");
const FormData = require("form-data");
const clone = require("clone");
const currentlyPlaying = {};
const awaitingVideo = {};

require("dotenv").config();
require("log-prefix")(() => { return `[nzxl.space | ${moment(Date.now()).format("HH:mm:ss")}]`; });
process.on("unhandledRejection", error => console.error(error));

// MongoDB
const { MongoClient, ServerApiVersion } = require("mongodb");
const mongoClient = new MongoClient(process.env.MONGODB, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1, monitorCommands: true });

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
const { Client, Intents, MessageEmbed } = require("discord.js");
const discordClient = new Client({
    partials: ["CHANNEL"],
    intents: [ Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MEMBERS, Intents.FLAGS.GUILD_PRESENCES, Intents.FLAGS.DIRECT_MESSAGES, Intents.FLAGS.DIRECT_MESSAGE_TYPING ]
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

let activeUsers, users, mapData;
(() => {

    discordClient.on("presenceUpdate", (_old, _new) => { 
        if(!activeUsers.includes(_new.userId) || _new.guild.id !== process.env.DISCORD_GUILD) return;

        users.findOne({ userId: _new.userId }).then(async (user) => {
            let activity = _new.activities.filter(a => a.applicationId == "367827983903490050"); // osu!
            if(!activity || activity && activity.length <= 0) return await toggleChannel(user.twitch, false);

            if(user.osu == null) {
                if(user["activityRetryCount"] && user.activityRetryCount >= 20) {
                    await deleteUser(user.userId);
                    await setRole(user.userId, ["on hold"]);
                    return await sendDM(user.userId, "Hey, I've noticed that your osu! activity presence is not working correctly, therefore the beatmap requests will be disabled.\nhttps://osu.ppy.sh/wiki/en/Guides/Discord_Rich_Presence\nNotice: you shouldn't run osu! nor Discord as *Administrator*.\n\nAny data containing your info will be wiped from our systems. Make sure to re-authorize the access if you want to have the requests back enabled.");    
                }

                if(activity[0].assets == null || activity[0].assets && !activity[0].assets.largeText) {
                    return await users.updateOne({ userId: user.userId }, { $inc: { activityRetryCount: 1 } });
                }
                
                let matchedUsername = activity[0].assets.largeText.match(/^(.*?)\(rank\s#(?:\d+)(?:,\d{1,3}|,\d{1,3},\d{1,3})?\)/);
                if(matchedUsername && matchedUsername.length >= 1) {
                    await users.updateOne({ userId: user.userId }, { $set: { osu: matchedUsername[1].trim() }});
                    await setRole(user.userId, ["regular"]);
                } else {
                    return await users.updateOne({ userId: user.userId }, { $inc: { activityRetryCount: 1 } });
                }
            }

            if(!twitchClient.getChannels().includes(`#${user.twitch}`))
                await toggleChannel(user.twitch);

            let mapName = activity[0].details;
            if(!mapName) return;

            if(!currentlyPlaying[`#${user.twitch}`] || currentlyPlaying[`#${user.twitch}`].name != mapName) {
                mapData.findOne({ name: mapName }).then(async (map) => {

                    currentlyPlaying[`#${user.twitch}`] = {
                        name: mapName,
                        mapData: map.mapData,
                        ppData: {
                            A: map.score ? Math.round(map.score.performance[0].totalPerformance) : Math.round(map.ppData.A),
                            S: map.score ? Math.round(map.score.performance[1].totalPerformance) : Math.round(map.ppData.S),
                            X: map.score ? Math.round(map.score.performance[2].totalPerformance) : Math.round(map.ppData.X)
                        },
                        previousMap: currentlyPlaying[`#${user.twitch}`]
                    }
                });
            }
        });
    });

    twitchClient.on("message", async (channel, tags, message, self) => {
        if(self) return;

        let beatmapId = message.match(Regex.beatmapId), setId = message.match(Regex.setId), mods = message.match(Regex.beatmapMods), accuracy = message.match(Regex.Accuracy);
        if(beatmapId || setId) {
            let map = setId && setId.length >= 1 ? await banchoClient.osuApi.beatmaps.getBySetId(setId[0]) : await banchoClient.osuApi.beatmaps.getByBeatmapId(beatmapId[0]);
            if(!map || map && map.length <= 0) return;

            if(beatmapId && beatmapId.length >= 1)
                map = map.filter(x => x.id == beatmapId[0]);

            users.findOne({ twitch: channel.replace("#", "") }).then(user => {
                if(!user["osu"] || user["blacklist"] && user["blacklist"].includes(tags["username"])) return;
                banchoClient.getUser(user.osu).sendMessage(`${tags["username"]} » [https://osu.ppy.sh/b/${map[0].beatmapId} ${map[0].artist} - ${map[0].title} [${map[0].version}]] ${mods ? `+${mods.toString().toUpperCase()}` : ""} | ${moment(map[0].totalLength*1000).format("mm:ss")} - ★ ${Math.round(map[0].difficultyRating * 100) / 100} - AR${map[0].approachRate}`);
            });

            return;
        }

        users.findOne({ twitch: channel.replace("#", "") }).then(async user => {
            if(!message.startsWith(user["prefix"] ? user["prefix"] : "!")) return;
            let [command, ...args] = message.slice(user["prefix"] ? user["prefix"].length : 1).trim().split(" ");

            if(command.toLowerCase() == "silence") {
                if(tags["mod"] || tags["username"] == channel.replace("#", "")) {
                    await users.updateOne({ userId: user.userId }, [ { $set: { silenced: { $eq: [false, "$silenced"] } } } ]);
                    return twitchClient.reply(channel, `» ${ !user["silenced"] ? "Silenced" : "Enabled"} all bot messages for this channel`, tags["id"]);
                }
            }

            if(command.toLowerCase() == "blacklist") {
                if(tags["mod"] || tags["username"] == channel.replace("#", "")) {
                    if(args.length <= 0)
                        return twitchClient.reply(channel, `» Blacklisted users: ${user["blacklist"] && user["blacklist"].length >= 1 ? user["blacklist"].join(", ") : "None"}`, tags["id"]);

                    let fixed = args[0].match(/[a-zA-Z0-9_]+/g, "").join("").trim().toLowerCase();
                    if(user["blacklist"] && user["blacklist"].includes(fixed)) {
                        await users.updateOne({ userId: user.userId }, { $pull: { blacklist: fixed } });
                        return twitchClient.reply(channel, `» Specified user was removed from the blacklist`, tags["id"]);
                    }

                    await users.updateOne({ userId: user.userId }, [ { $set: { blacklist: { $ifNull: [ { $concatArrays: ["$blacklist", [fixed]] }, [fixed] ] } } } ]);
                    return twitchClient.reply(channel, `» Specified user is now blacklisted from the bot`, tags["id"]);
                }
            }

            if(command.toLowerCase() == "prefix") {
                if(tags["mod"] || tags["username"] == channel.replace("#", "")) {
                    if(args.length <= 0) return;

                    let allowedPrefixes = ["!", "+", ":", "-", "#", ".", ";", "@", "$", "=", "~", "_", "*", "&", "%"];
                    if(!allowedPrefixes.includes(args[0].trim()))
                        return twitchClient.reply(channel, `» This prefix is not allowed, please try one of these: ${allowedPrefixes.join("")}`, tags["id"]);

                    await users.updateOne({ userId: user.userId }, { $set: { prefix: args[0].trim() }});
                    return twitchClient.reply(channel, `» Prefix successfully changed`, tags["id"]);
                }
            }

            if(user["silenced"] && user["silenced"] == true) return;

            if(command.toLowerCase() == "np" || command.toLowerCase() == "last") {
                let map = command.toLowerCase() == "np" ? currentlyPlaying[`${channel}`] : currentlyPlaying[`${channel}`].previousMap;
                if(!map) return twitchClient.reply(channel, `» No data available, try again later 😭`, tags["id"]);

                return twitchClient.reply(channel, `» ${map.name} | ${moment(map.mapData["total_length"]*1000).format("mm:ss")} - ★ ${Math.round(map.mapData["difficulty_rating"] * 100) / 100} - AR${map.mapData.ar} | ${map.mapData.url}`, tags["id"]);
            }

            if(command.toLowerCase() == "nppp" || command.toLowerCase() == "lastpp") {
                let map = command.toLowerCase() == "nppp" ? clone(currentlyPlaying[`${channel}`]) : clone(currentlyPlaying[`${channel}`].previousMap);
                if(!map) return twitchClient.reply(channel, `» No data available, try again later 😭`, tags["id"]);

                if(args.length >= 1 && mods != null || args.length >= 1 && accuracy != null) {
                    let recalculate = await pp.calculate({
                        beatmapId: map.mapData.id,
                        mods: mods != null ? mods.join("").toUpperCase() : "",
                        accuracy: accuracy != null ? [95, 99, 100, Number(accuracy.join("").replace(/%/, ""))] : undefined
                    });
                    
                    // stats
                    map.mapData["total_length"] = recalculate.beatmapInfo.length;
                    map.mapData["difficulty_rating"] = recalculate.difficulty.starRating;
                    map.mapData["ar"] = Math.round(recalculate.difficulty.approachRate * 100) / 100;

                    // pp
                    map.ppData["A"] = Math.round(recalculate.performance[0].totalPerformance);
                    map.ppData["S"] = Math.round(recalculate.performance[1].totalPerformance);
                    map.ppData["X"] = Math.round(recalculate.performance[2].totalPerformance);

                    // custom pp for accuracy
                    if(accuracy != null) {
                        map.ppData["C"] = Math.round(recalculate.performance[3].totalPerformance);
                    }
                }

                return twitchClient.reply(channel, `» ${map.name} ${mods ? "+"+mods.join("").toUpperCase() : ""} | ${moment(map.mapData["total_length"]*1000).format("mm:ss")} - ★ ${Math.round(map.mapData["difficulty_rating"] * 100) / 100} - AR${map.mapData.ar} | ${accuracy != null ? `${accuracy.join("")}: ${map.ppData.C}pp` : `95%: ${map.ppData.A}pp - 99%: ${map.ppData.S}pp - 100%: ${map.ppData.X}pp`} | ${map.mapData.url}`, tags["id"]);
            }

            if(command.toLowerCase() == "help") {
                return twitchClient.reply(channel, `» osu! commands: np | nppp, last | lastpp - Other commands: silence, blacklist, prefix`, tags["id"]);
            }
        });
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
                                users.findOne({ userId: user.id }).then(async (result) => {
                                    if(!result || result && result.length <= 0) {
                                        let twitch = c.filter(x => x.type == "twitch");
                                        if(twitch.length <= 0) {
                                            await setRole(user.id, ["on hold"]);
                                            return await sendDM(user.id, "Twitch channel not found. Please connect one to your Discord first, and then try re-authorizing :)");
                                        }
                                        
                                        users.insertOne({
                                            userId: user.id,
                                            discordName: `${user.username}#${user.discriminator}`,
                                            twitch: `${twitch[0].name}`,
                                            osu: null
                                        }).then(async () => {
                                            activeUsers.push(user.id);
                                            await setRole(user.id, ["on hold"]);

                                            console.log(`Added user ${user.username}#${user.discriminator} to db`);
                                        });
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



