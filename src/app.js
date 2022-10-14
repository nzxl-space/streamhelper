process.noDeprecation = true;

// Utils
const Regex = {
    setId: /(?<=#osu\/|\/s\/)\d+/g,
    setIdBancho: /(?<=#\/|\/s\/)\d+/g,
    beatmapId: /(?<=beatmapsets\/|b\/)\d+/g,
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

// Websocket o!rdr
const socketUrl = "https://ordr-ws.issou.best";
const io = require("socket.io-client");
const ioClient = io.connect(socketUrl);

let activeUsers, users, mapData;
(() => {
    mongoClient.connect(async err => {
        if(err) return console.log("MongoDB failed!");
        db = mongoClient.db("osu");

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

                let activity = _new.activities.filter(a => a.applicationId == "367827983903490050"); // osu!
                if(!activity || activity && activity.length <= 0) return;

                users.findOne({ userId: _new.userId }).then(async (user) => {
                    if(activity[0].assets == null || activity[0].assets && !activity[0].assets.largeText) return;
                    matchedUsername = activity[0].assets.largeText.match(/^\w+/);

                    if(user.osu == null && matchedUsername.length >= 1) {
                        await users.updateOne({ userId: user.userId }, { $set: { osu: matchedUsername[0] }});
                    } else if(user.osu == null && matchedUsername.length <= 0) {
                        if(user.activityRetryCount >= 10) {
                            await deleteUser(user.userId);
                            return discordClient.guilds.cache.get(process.env.DISCORD_GUILD).members.cache.get(user.userId).send("Hey, I've noticed that your osu! activity presence is not working correctly, therefore the beatmap requests will be disabled.\nhttps://osu.ppy.sh/wiki/en/Guides/Discord_Rich_Presence\nNotice: you shouldn't run osu! nor Discord as *Administrator*.\n\nAny data containing your info will be wiped from our systems. Make sure to re-authorize the access if you want to have the requests back enabled.");    
                        }

                        return await users.updateOne({ userId: user.userId }, { $inc: { activityRetryCount: 1 } });
                    }

                    let mapName = activity[0].details;
                    if(!mapName) return;

                    if(!currentlyPlaying[`#${user.twitch}`] || currentlyPlaying[`#${user.twitch}`].name != mapName) {
                        mapData.findOne({ name: mapName }).then(async (map) => {
                            if(!map || map && map.length <= 0) {
                                map = await lookupBeatmap(mapName);
                                map.score = await pp.calculate({ beatmapId: map.id });

                                mapData.insertOne({
                                    name: mapName,
                                    setId: map.id,
                                    mapData: map,
                                    ppData: {
                                        A: Math.round(map.score.performance[0].totalPerformance),
                                        S: Math.round(map.score.performance[1].totalPerformance),
                                        X: Math.round(map.score.performance[2].totalPerformance)
                                    }
                                }).then(() => {
                                    discordClient.guilds.cache.get(process.env.DISCORD_GUILD).channels.cache.find(x => x.name == "events").send({ embeds: [
                                        new MessageEmbed()
                                        .setColor("#FD7CB6")
                                        .setTitle(`${mapName}`)
                                        .setURL(`https://osu.ppy.sh/beatmaps/${map.id}`)
                                        .setDescription(`mapped by ${map.creator} | ${moment(map.total_length*1000).format("mm:ss")} - ★ ${Math.round(map.difficulty_rating * 100) / 100} - AR${map.ar}`)
                                        .setAuthor({ name: `A new map has been added to the database!`, iconURL: `https://i.imgur.com/NJt4fjH.png` })
                                        .addFields(
                                            { name: "98% FC", value: `${Math.round(map.score.performance[0].totalPerformance)}pp`, inline: true },
                                            { name: "99% FC", value: `${Math.round(map.score.performance[1].totalPerformance)}pp`, inline: true },
                                            { name: "100% FC", value: `${Math.round(map.score.performance[2].totalPerformance)}pp`, inline: true }
                                        )
                                        .setImage(`https://assets.ppy.sh/beatmaps/${map.beatmapset_id}/covers/cover.jpg`)
                                        .setTimestamp()
                                    ]});
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

                            banchoClient.osuApi.user.getBest(user.osu).then(scores => {
                                scores.forEach(score => {
                                    if(score.replayAvailable) {
                                        let date = moment(Date.now()).diff(score.date, "days");
                                        if(date <= 3) {
                                            users.findOne({ osu: user.osu }).then((user) => {
                                                if(!user || user["replays"] && Object.keys(user.replays).includes(`${score.beatmapId}`)) return;
                    
                                                fetch(`${process.env.DOWNLOADURL}?userId=${score.userId}&beatmapId=${score.beatmapId}`).then(async replay => {
                                                    let url = await renderReplay(replay.body, user.osu);
                                                    users.updateOne({ userId: user.userId }, { $set: { [`replays.${score.beatmapId}`]: `${url}` }});
                                                    
                                                    if(twitchClient.getChannels().includes(`#${user.twitch}`)) {
                                                        twitchClient.say(`#${user.twitch}`, `/me A replay of your new top play is available here: ${url}`);
                                                    }
                                                });
                                            });
                                        }
                                    }
                                });
                            });
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
            setInterval(() => {
                for (let i = 0; i < activeUsers.length; i++) {
                    users.findOne({ userId: activeUsers[i] }).then(async (user) => {
                        if(await liveStatus(user.twitch) == true) await toggleChannel(user.twitch, true);
                        else await toggleChannel(user.twitch, false);
                    });
                }
            }, 5*60*1000);

            twitchClient.on("message", async (channel, tags, message, self) => {
                let beatmapId = message.match(Regex.beatmapId), setId = message.match(Regex.setId), mods = message.match(Regex.beatmapMods);
                if(beatmapId) {
                    let map = await banchoClient.osuApi.beatmaps.getBySetId(beatmapId[0]);
                    if(!map || map.length <= 0) {
                        beatmap = await banchoClient.osuApi.beatmaps.getByBeatmapId(beatmapId[0]);
                        if(!beatmap || beatmap.length <= 0) return;
                        map = beatmap;
                    }


                    if(setId && map.length >= 1)
                        map = map.filter(x => x.id == setId);

                    users.findOne({ twitch: channel.replace("#", "") }).then(user => {
                        if(!user || user && user.length <= 0 || user.osu == null) return;
                        banchoClient.getUser(user.osu).sendMessage(`${tags["username"]} » [https://osu.ppy.sh/b/${map[0].beatmapId} ${map[0].artist} - ${map[0].title} [${map[0].version}]] ${mods ? `+${mods.toString().toUpperCase()}` : ""} | ${moment(map[0].totalLength*1000).format("mm:ss")} - ★ ${Math.round(map[0].difficultyRating * 100) / 100} - AR${map[0].approachRate}`);
                    });

                    return;
                }

                message = message.split(" ");
                let command = message[0].startsWith("!") ? message.splice(0, 1).join("") : null;
                switch (command) {
                    case "!np":
                        if(currentlyPlaying[`${channel}`])
                            twitchClient.say(channel, `/me ${currentlyPlaying[`${channel}`].name} | ${moment(currentlyPlaying[`${channel}`].mapData.total_length*1000).format("mm:ss")} - ★ ${Math.round(currentlyPlaying[`${channel}`].mapData.difficulty_rating * 100) / 100} - AR${currentlyPlaying[`${channel}`].mapData.ar} | ${currentlyPlaying[`${channel}`].mapData.url}`);
                        break;
                    case "!nppp":
                        if(currentlyPlaying[`${channel}`])
                            twitchClient.say(channel, `/me ${currentlyPlaying[`${channel}`].name} | ${moment(currentlyPlaying[`${channel}`].mapData.total_length*1000).format("mm:ss")} - ★ ${Math.round(currentlyPlaying[`${channel}`].mapData.difficulty_rating * 100) / 100} - AR${currentlyPlaying[`${channel}`].mapData.ar} | 98%: ${currentlyPlaying[`${channel}`].ppData.A}pp - 99%: ${currentlyPlaying[`${channel}`].ppData.S}pp - 100%: ${currentlyPlaying[`${channel}`].ppData.X}pp | ${currentlyPlaying[`${channel}`].mapData.url}`);
                        break;
                    case "!last":
                        if(currentlyPlaying[`${channel}`] && currentlyPlaying[`${channel}`].previousMap)
                            twitchClient.say(channel, `/me ${currentlyPlaying[`${channel}`].previousMap.name} | ${moment(currentlyPlaying[`${channel}`].previousMap.mapData.total_length*1000).format("mm:ss")} - ★ ${Math.round(currentlyPlaying[`${channel}`].previousMap.mapData.difficulty_rating * 100) / 100} - AR${currentlyPlaying[`${channel}`].previousMap.mapData.ar} | ${currentlyPlaying[`${channel}`].previousMap.mapData.url}`);
                        break;
                    case "!lastpp":
                        if(currentlyPlaying[`${channel}`] && currentlyPlaying[`${channel}`].previousMap)
                            twitchClient.say(channel, `/me ${currentlyPlaying[`${channel}`].previousMap.name} | ${moment(currentlyPlaying[`${channel}`].previousMap.mapData.total_length*1000).format("mm:ss")} - ★ ${Math.round(currentlyPlaying[`${channel}`].previousMap.mapData.difficulty_rating * 100) / 100} - AR${currentlyPlaying[`${channel}`].previousMap.mapData.ar} | 98%: ${currentlyPlaying[`${channel}`].previousMap.ppData.A}pp - 99%: ${currentlyPlaying[`${channel}`].previousMap.ppData.S}pp - 100%: ${currentlyPlaying[`${channel}`].previousMap.ppData.X}pp | ${currentlyPlaying[`${channel}`].previousMap.mapData.url}`);
                        break;
                    case "!help":
                        twitchClient.say(channel, "/me | !np - Show currently playing map | !nppp - Show currently playing map and pp values | !last - Show previously played map | !lastpp - Show previously played map and pp values |");
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
                                users.findOne({ userId: user.id }).then((result) => {
                                    if(!result || result && result.length <= 0) {
                                        let twitch = c.filter(x => x.type == "twitch");
                                        if(twitch.length <= 0) return discordClient.guilds.cache.get(process.env.DISCORD_GUILD).members.cache.get(user.id).send("Twitch channel not found. Did you link it correctly with Discord? Try again when you linked it by re-authorizing! :)");
                                        
                                        users.insertOne({
                                            userId: user.id,
                                            discordName: `${user.username}#${user.discriminator}`,
                                            twitch: `${twitch[0].name}`,
                                            osu: null
                                        }).then(() => activeUsers.push(user.id));
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
    ioClient.on("render_done_json", data => {
        if(`${data.renderID}` in awaitingVideo) {
            awaitingVideo[`${data.renderID}`].done = Date.now();
            awaitingVideo[`${data.renderID}`].url = data.videoUrl;
        }
    });
})();

/**
 * Get live status of twitch channel
 * @param {string} channel 
 * @returns {Boolean}
 */
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
            resolve(result.data.length >= 1 ? true : false);
        });
    });
}

/**
 * Lookup a beatmap on osu! api
 * @param {string} beatmapName 
 * @returns {Promise}
 */
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
                    artist = beatmapName.match(/^(.*?)\s-\s(.*?)$/),
                    version = beatmapName.match(/(?!.*\[)(?<=\[).+?(?=\])/);

                if(!map || !version || !artist)
                    return reject(); //"No map found"

                if(version && version.length <= 0 || artist && artist.length <= 0)
                    return reject(); //"No match found"

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
 * @param {string} twitch channel
 * @param {boolean} state - true = join | false = leave
 * @returns {Promise}
 */
function toggleChannel(twitch, state) {
    return new Promise(resolve => {
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
 * @param {string} username 
 * @returns {string} replay url
 */
function renderReplay(replay, username) {
    return new Promise(resolve => {
        if(!replay || !username) return;

        let replayForm = new FormData();
        replayForm.append("replayFile", replay, { filename: "replay.osr", contentType: "application/octet-stream" });
        replayForm.append("username", "streamhelper");
        replayForm.append("resolution", "1280x720");
        replayForm.append("verificationKey", process.env.OSURENDER);

        // Danser Settigns
        replayForm.append("skin", "1695");
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
        }).then(async result => {
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
 * @param {string|Number} user id
 * @returns 
 */
function deleteUser(id) {
    return new Promise(resolve => {
        users.findOne({ userId: id }).then(async (user) => {
            await toggleChannel(user.twitch, false);
            await users.deleteOne({ userId: user.userId });

            if(activeUsers.indexOf(user.userId) > -1)
                activeUsers.splice(activeUsers.indexOf(user.userId), 1);

            resolve();
        });
    });
}