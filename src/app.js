process.noDeprecation = true;

// Utils
const Regex = {
    setId: /(?<=beatmapsets\/|\/s\/)\d+/,
    beatmapId: /(?<=beatmaps\/|b\/|#osu\/|#taiko\/|#fruits\/|#mania\/)\d+/,
    beatmapMods: /(?<=\+)(?:NF|EZ|HD|HR|(SD|PF)|(NC|DT)|RX|HT|FL|SO)+/ig
};
const moment = require("moment");
const path = require("path");
const fetch = require("node-fetch-retry");
const FormData = require("form-data");
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

// Websocket o!rdr
const socketUrl = "https://ordr-ws.issou.best";
const io = require("socket.io-client");
const ioClient = io.connect(socketUrl);

let activeUsers, users, mapData;
(() => {
    mongoClient.connect(async err => {
        if(err) return console.log("MongoDB failed!");
        const db = mongoClient.db("osu");

        users = db.collection("users");
        mapData = db.collection("map_data");
        activeUsers = await users.distinct("userId");

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

        if(discordClient.listeners("guildMemberRemove").length <= 0) {
            discordClient.on("guildMemberRemove", async (member) => {
                await deleteUser(member.id);
            });

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

                    banchoClient.osuApi.user.getBest(user.osu).then(scores => {
                        scores.forEach(score => {
                            if(score.replayAvailable) {
                                let minutes = moment(Date.now()).diff(score.date, "minutes");
                                if(minutes <= 60 && twitchClient.getChannels().includes(`#${user.twitch}`)) {
                                    users.findOne({ osu: user.osu }).then((user) => {
                                        if(!user || user["replays"] && Object.keys(user.replays).includes(`${score.beatmapId}`)) return;
                                        users.updateOne({ userId: user.userId }, { $set: { [`replays.${score.beatmapId}`]: `Rendering` }});
            
                                        fetch(`${process.env.DOWNLOADURL}?userId=${score.userId}&beatmapId=${score.beatmapId}`).then(async replay => {
                                            let url = await renderReplay(replay.body, user.osu);
                                            users.updateOne({ userId: user.userId }, { $set: { [`replays.${score.beatmapId}`]: `${url}` }});

                                            if(user["silenced"] && user["silenced"] == false) {
                                                twitchClient.say(`#${user.twitch}`, `/me ‼️ New top play recorded! You can watch it here: ${url} 🤙`);
                                            }
                                        });
                                    });
                                }
                            }
                        });
                    });

                    let mapName = activity[0].details;
                    if(!mapName) return;

                    if(!currentlyPlaying[`#${user.twitch}`] || currentlyPlaying[`#${user.twitch}`].name != mapName) {
                        mapData.findOne({ name: mapName }).then(async (map) => {
                            if(!map || map && map.length <= 0) {
                                map = {};
                                map.mapData = await lookupBeatmap(mapName);
                                if(typeof map.mapData !== "object") return;
                                
                                map.score = await pp.calculate({ beatmapId: map.mapData.id });

                                mapData.insertOne({
                                    name: mapName,
                                    setId: map.mapData.id,
                                    mapData: map.mapData,
                                    ppData: {
                                        A: Math.round(map.score.performance[0].totalPerformance),
                                        S: Math.round(map.score.performance[1].totalPerformance),
                                        X: Math.round(map.score.performance[2].totalPerformance)
                                    }
                                }).then(() => {
                                    postEvent(`${mapName}`, 
                                    `https://osu.ppy.sh/beatmaps/${map.mapData.id}`, 
                                    `mapped by ${map.mapData.creator} | ${moment(map.mapData.total_length*1000).format("mm:ss")} - ★ ${Math.round(map.mapData.difficulty_rating * 100) / 100} - AR${map.mapData.ar}`,
                                    `A new map has been added to the database!`, 
                                    `https://i.imgur.com/NJt4fjH.png`, [
                                        { name: "98% FC", value: `${Math.round(map.score.performance[0].totalPerformance)}pp`, inline: true },
                                        { name: "99% FC", value: `${Math.round(map.score.performance[1].totalPerformance)}pp`, inline: true },
                                        { name: "100% FC", value: `${Math.round(map.score.performance[2].totalPerformance)}pp`, inline: true }
                                    ], 
                                    `https://assets.ppy.sh/beatmaps/${map.mapData.beatmapset_id}/covers/cover.jpg`);
                                });
                            }

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
        }
    });

    twitchClient.connect();
    twitchClient.on("connected", () => {
        console.log(`Twitch connected as ${process.env.TWITCH_USERNAME}!`);
        if(twitchClient.listeners("message").length <= 0) {
            twitchClient.on("message", async (channel, tags, message, self) => {
                if(self) return;

                let beatmapId = message.match(Regex.beatmapId), setId = message.match(Regex.setId), mods = message.match(Regex.beatmapMods);
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

                    switch (command.toLowerCase()) {
                        case "nppp":
                        case "np":
                            if(currentlyPlaying[`${channel}`] && currentlyPlaying[`${channel}`].mapData)
                                twitchClient.reply(channel, `» ${currentlyPlaying[`${channel}`].name} | ${moment(currentlyPlaying[`${channel}`].mapData["total_length"]*1000).format("mm:ss")} - ★ ${Math.round(currentlyPlaying[`${channel}`].mapData["difficulty_rating"] * 100) / 100} - AR${currentlyPlaying[`${channel}`].mapData.ar} | ${command.toLowerCase() == "nppp" ? `98%: ${currentlyPlaying[`${channel}`].ppData.A}pp - 99%: ${currentlyPlaying[`${channel}`].ppData.S}pp - 100%: ${currentlyPlaying[`${channel}`].ppData.X}pp |` : ""} ${currentlyPlaying[`${channel}`].mapData.url}`, tags["id"]);
                            break;
                        case "lastpp":
                        case "last":
                            if(currentlyPlaying[`${channel}`] && currentlyPlaying[`${channel}`].previousMap) {
                                if(!currentlyPlaying[`${channel}`].previousMap["mapData"]) return;
                                twitchClient.reply(channel, `» ${currentlyPlaying[`${channel}`].previousMap.name} | ${moment(currentlyPlaying[`${channel}`].previousMap.mapData["total_length"]*1000).format("mm:ss")} - ★ ${Math.round(currentlyPlaying[`${channel}`].previousMap.mapData["difficulty_rating"] * 100) / 100} - AR${currentlyPlaying[`${channel}`].previousMap.mapData.ar} | ${command.toLowerCase() == "lastpp" ? `98%: ${currentlyPlaying[`${channel}`].previousMap.ppData.A}pp - 99%: ${currentlyPlaying[`${channel}`].previousMap.ppData.S}pp - 100%: ${currentlyPlaying[`${channel}`].previousMap.ppData.X}pp |` : ""} ${currentlyPlaying[`${channel}`].previousMap.mapData.url}`, tags["id"]);
                            }
                            break;
                        case "help":
                            twitchClient.reply(channel, `» osu! commands: np | nppp, last | lastpp - Other commands: silence, blacklist, prefix`, tags["id"]);
                            break;
                    }
                });
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

    ioClient.on("connect", () => console.log("[o!rdr] Connected to server!"));
    ioClient.on("render_done_json", (data) => {
        if(`${data.renderID}` in awaitingVideo) {
            awaitingVideo[`${data.renderID}`].done = Date.now();
            awaitingVideo[`${data.renderID}`].url = data.videoUrl;
        }
    });
})();

/**
 * Get live status of twitch channel
 * @param {String} channel 
 * @returns {Boolean}
 */
function liveStatus(channel) {
    return new Promise(async (resolve) => {
        if(!twitchApi.accessToken || (twitchApi.expires-Math.floor(Date.now() / 1000)) <= 1000) {
            await fetch(`https://id.twitch.tv/oauth2/token?client_id=${process.env.TWITCH_CLIENT_ID}&client_secret=${process.env.TWITCH_CLIENT_SECRET}&grant_type=client_credentials`, { 
                method: "POST",
                retry: 3,
                pause: 5000
            }).then(async (result) => {
                result = await result.json();
                twitchApi.accessToken = result.access_token;
                twitchApi.expires = (Math.floor(Date.now() / 1000)+result.expires_in);
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
        }).then(async (result) => {
            try {
                result = await result.json();
                if(result.data && result.data.length >= 1) {
                    return resolve(result.data[0].game_name == "osu!" ? true : false);
                }
                resolve(false);
            } catch (err) {
                resolve(false);
            }
        });
    });
}

/**
 * Lookup a beatmap on osu! api
 * @param {String} beatmapName 
 * @returns {Promise}
 */
function lookupBeatmap(beatmapName) {
    return new Promise(async (resolve) => {
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
            }).then(async (result) => {
                result = await result.json();
                osuApi.accessToken = result.access_token;
                osuApi.expires = (Math.floor(Date.now() / 1000)+result.expires_in);
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
        }).then(async (result) => {
            result = await result.json();
            for(let i in result.beatmapsets) {
                let map = result.beatmapsets[i],
                    artist = beatmapName.match(/^(.*?)\s-\s(.*?)$/),
                    version = beatmapName.match(/(?!.*\[)(?<=\[).+?(?=\])/);

                if(!map || !version || !artist)
                    return resolve("No map found");

                if(version && version.length <= 0 || artist && artist.length <= 0)
                    return resolve("No match found");

                if(map.artist == artist[1]) {
                    let foundMap = map.beatmaps.find(m => m.version == version[0]);
                    if(foundMap) {
                        foundMap.creator = map.creator;
                        resolve(foundMap);
                    }
                }
            }
        })
    });
}

/**
 * Join or leave twitch channel
 * @param {String} twitch channel
 * @param {Boolean} state - true = join | false = leave
 * @returns {Promise}
 */
function toggleChannel(twitch, state) {
    return new Promise(async (resolve) => {

        state = !state ? await liveStatus(twitch) : state;

        if(twitchClient.getChannels().includes(`#${twitch}`) && state == false) {
            twitchClient.part(`#${twitch}`);
            console.log(`Left channel #${twitch}`);
        } else if(!twitchClient.getChannels().includes(`#${twitch}`) && state == true) {
            twitchClient.join(`#${twitch}`);
            console.log(`Listening for requests on #${twitch}`);
        }

        resolve();
    });
}

/**
 * Render a replay
 * @param {Buffer} replay 
 * @param {String} username 
 * @returns {String} replay url
 */
function renderReplay(replay, username) {
    return new Promise((resolve) => {
        if(!replay || !username) return;

        let replayForm = new FormData();
        replayForm.append("replayFile", replay, { filename: "replay.osr", contentType: "application/octet-stream" });
        replayForm.append("username", "streamhelper");
        replayForm.append("resolution", "1280x720");
        replayForm.append("verificationKey", process.env.OSURENDER);

        // Danser Settigns
        replayForm.append("skin", "3049");
        replayForm.append("customSkin", "true");
        replayForm.append("globalVolume", "50");
        replayForm.append("musicVolume", "50");
        replayForm.append("hitsoundVolume", "75");
        replayForm.append("useSkinColors", "true");
        replayForm.append("useBeatmapColors", "false");
        replayForm.append("introBGDim", "90");
        replayForm.append("inGameBGDim", "90");
        replayForm.append("breakBGDim", "90");
        replayForm.append("showDanserLogo", "false");
        replayForm.append("cursorRipples", "true");
        replayForm.append("cursorSize", "0.75");
        replayForm.append("sliderSnakingIn", "false");
        replayForm.append("showHitCounter", "true");
        replayForm.append("showAimErrorMeter", "true");

        fetch("https://apis.issou.best/ordr/renders", {
            method: "POST",
            body: replayForm
        }).then(async (result) => {
            result = await result.json();
            awaitingVideo[`${result.renderID}`] = { url: null, done: 0, username: username };

            console.log(`[o!rdr] Waiting for video (${result.renderID}) to render..`);
            while (!awaitingVideo[`${result.renderID}`].url) {
                await new Promise(p => setTimeout(p, 5000));
            }

            console.log(`[o!rdr] ${awaitingVideo[`${result.renderID}`].url} (${result.renderID}) done!`);
            resolve(awaitingVideo[`${result.renderID}`].url);
        });
    });
}

/**
 * Delete user from db
 * @param {String|Number} user id
 * @returns {Promise}
 */
function deleteUser(id) {
    return new Promise((resolve) => {
        users.findOne({ userId: id }).then(async (user) => {
            await toggleChannel(user.twitch, false);
            await users.deleteOne({ userId: user.userId });

            if(activeUsers.indexOf(user.userId) > -1)
                activeUsers.splice(activeUsers.indexOf(user.userId), 1);

            console.log(`Deleted user ${user.discordName} from db`);
            resolve();
        });
    });
}

/**
 * send dm to user
 * @param {Number} user id
 * @param {String} message 
 * @returns {Promise}
 */
function sendDM(user, message) {
    return new Promise((resolve) => {
        discordClient.guilds.cache.get(process.env.DISCORD_GUILD).members.cache.get(user).send(message).then(() => resolve());
    });
}


/**
 * uhh discord embed??
 * @param {String} title 
 * @param {String} url 
 * @param {String} description 
 * @param {String} type 
 * @param {String} icon 
 * @param {Array} fields 
 * @param {String} image
 * @returns {Promise}
 */
function postEvent(title, url, description, type, icon, fields = [], image) {
    return new Promise((resolve) => {
        discordClient.guilds.cache.get(process.env.DISCORD_GUILD).channels.cache.find(x => x.name == "events").send({ embeds: [
            new MessageEmbed()
            .setColor("#FD7CB6")
            .setTitle(title)
            .setURL(url)
            .setDescription(description)
            .setAuthor({ name: type, iconURL: icon })
            .addFields(fields)
            .setImage(image)
            .setTimestamp()
        ]}).then(() => resolve());
    });
}

/**
 * set discord roles
 * @param {String|Number} user 
 * @param {Array} role 
 * @returns {Promise}
 */
function setRole(user, role) {
    return new Promise((resolve) => {
        discordClient.guilds.cache.get(process.env.DISCORD_GUILD).members.cache.get(user).roles.set([]).then(() => {
            discordClient.guilds.cache.get(process.env.DISCORD_GUILD).members.cache.get(user)
            .roles.add(discordClient.guilds.cache.get(process.env.DISCORD_GUILD).roles.cache.find(r => r.name == role).id)
            .then(() => resolve());
        });
    });
}