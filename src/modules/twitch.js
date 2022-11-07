const tmi = require("tmi.js");
const moment = require("moment");
const clone = require("clone");
const { BeatmapCalculator } = require("@kionell/osu-pp-calculator");
const pp = new BeatmapCalculator();

const { mongoDB, discord } = require("../app");
var bancho = require("../app").bancho;

const Regex = {
    setId: /(?<=beatmapsets\/|\/s\/)\d+/,
    beatmapId: /(?<=beatmaps\/|b\/|#osu\/|#taiko\/|#fruits\/|#mania\/)\d+/,
    beatmapMods: /(?<=\+)(?:NF|EZ|HD|HR|(SD|PF)|(NC|DT)|RX|HT|FL|SO)+/ig,
    Accuracy: /100[%]|[123456789][0-9][%]|[0-9][%]/g
};
var block = [];

module.exports = class Twitch {
    constructor(twitchUsername, twitchPassword, clientId, clientSecret) {
        this.twitchUsername = twitchUsername;
        this.twitchPassword = twitchPassword;
        this.clientId = clientId;
        this.clientSecret = clientSecret;

        this.accessToken = {};

        // export vars
        this.twitchClient = null;
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.twitchClient = new tmi.Client(
                {
                    identity: {
                        username: this.twitchUsername,
                        password: this.twitchPassword
                    }
                }
            );

            this.twitchClient.on("connected", () => resolve());

            this.twitchClient.on("join", (channel, username, self) => self ? console.log(`Enabled Beatmap Requests for ${channel}!`) : 0);
            this.twitchClient.on("part", (channel, username, self) => self ? console.log(`Disabled Beatmap Requests for ${channel}!`) : 0);

            this.twitchClient.on("message", async (channel, tags, message, self) => {
                if(self || block.includes(tags["username"])) return;

                let beatmapId = message.match(Regex.beatmapId);
                let setId = message.match(Regex.setId);
                let beatmapMods = message.match(Regex.beatmapMods);
                let accuracy = message.match(Regex.Accuracy);

                if(beatmapId || setId) {
                    let map = await bancho.getBeatmap(beatmapId && beatmapId.length >= 1 ? beatmapId[0] : setId[0]);
                    if(!map) return;

                    let user = await mongoDB.users.findOne({ twitch: channel.slice(1) });
                    if(!user || user.length <= 0) return;

                    if(user["osu"]) {
                        if(user["blacklist"] && user["blacklist"].includes(tags["username"])) return;
                        bancho.banchoClient.getUser(user.osu).sendMessage(`${tags["username"]} » [https://osu.ppy.sh/b/${map.mapData.id} ${map.name}] ${beatmapMods ? `+${beatmapMods.toString().toUpperCase()}` : ""} | ${moment(map.mapData.total_length*1000).format("mm:ss")} - ★ ${Math.round(map.mapData.difficulty_rating * 100) / 100} - AR${map.mapData.ar}`);
                    }

                    block.push(tags["username"]);
                    setTimeout(() => block = block.filter(u => u !== tags["username"]), 3*1000);

                    return;
                }

                let user = await mongoDB.users.findOne({ twitch: channel.slice(1) });
                if(!user || user.length <= 0) return;

                let prefix = user["prefix"] ? user["prefix"] : "!";
                let silencedCommands = ["np", "nppp", "last", "lastpp", "help"];
                let adminCommands = ["silence", "blacklist", "prefix"];

                if(!message.startsWith(prefix)) return;
                let [command, ...args] = message.slice(prefix.length).trim().split(" ");

                if(user["silenced"] && silencedCommands.includes(command.toLowerCase())) return;

                if(adminCommands.includes(command.toLowerCase()))
                    if(!Object.keys(tags["badges"]).includes("broadcaster")) return;

                switch (command.toLowerCase()) {
                    case "silence": {
                        await mongoDB.users.updateOne({ userId: user.userId }, [ { $set: { silenced: { $eq: [false, "$silenced"] } } } ]);
                        this.twitchClient.reply(channel, `» ${ !user["silenced"] ? "Silenced" : "Enabled"} all bot messages for this channel`, tags["id"]);

                        break;
                    }

                    case "blacklist": {
                        if(args.length <= 0)
                            return this.twitchClient.reply(channel, `» Blacklisted users: ${user["blacklist"] && user["blacklist"].length >= 1 ? user["blacklist"].join(", ") : "None"}`, tags["id"]);

                        let fixed = args[0].match(/[a-zA-Z0-9_]+/g, "").join("").trim().toLowerCase();

                        if(user["blacklist"] && user["blacklist"].includes(fixed)) {
                            await mongoDB.users.updateOne({ userId: user.userId }, { $pull: { blacklist: fixed } });
                            return this.twitchClient.reply(channel, `» Specified user was removed from the blacklist`, tags["id"]);
                        }
    
                        await mongoDB.users.updateOne({ userId: user.userId }, [ { $set: { blacklist: { $ifNull: [ { $concatArrays: ["$blacklist", [fixed]] }, [fixed] ] } } } ]);
                        this.twitchClient.reply(channel, `» Specified user is now blacklisted from the bot`, tags["id"]);

                        break;
                    }

                    case "prefix": {
                        let allowedPrefixes = ["!", "+", ":", "-", "#", ".", ";", "@", "$", "=", "~", "_", "*", "&", "%"];

                        if(args.length <= 0) 
                            return this.twitchClient.reply(channel, `» Allowed prefixes: ${allowedPrefixes.join("")}`, tags["id"]);

                        if(!allowedPrefixes.includes(args[0].trim()))
                            return this.twitchClient.reply(channel, `» This prefix is not allowed, please try one of these: ${allowedPrefixes.join("")}`, tags["id"]);

                        await mongoDB.users.updateOne({ userId: user.userId }, { $set: { prefix: args[0].trim() }});
                        this.twitchClient.reply(channel, `» Prefix successfully changed`, tags["id"]);

                        break;
                    }

                    case "last":
                    case "np":  {
                        let map = command.toLowerCase() == "np" ? discord.currentlyPlaying[`${channel.slice(1)}`] : discord.currentlyPlaying[`${channel.slice(1)}`].previousMap;
                        if(!map) 
                            return this.twitchClient.reply(channel, `» No data available, try again later 😭`, tags["id"]);

                        this.twitchClient.reply(channel, `» ${map.name} | ${moment(map.mapData["total_length"]*1000).format("mm:ss")} - ★ ${Math.round(map.mapData["difficulty_rating"] * 100) / 100} - AR${map.mapData.ar} | ${map.mapData.url}`, tags["id"]);

                        break;
                    }

                    case "lastpp":
                    case "nppp":  {
                        let map = command.toLowerCase() == "nppp" ? clone(discord.currentlyPlaying[`${channel.slice(1)}`]) : clone(discord.currentlyPlaying[`${channel.slice(1)}`].previousMap);
                        if(!map) 
                            return this.twitchClient.reply(channel, `» No data available, try again later 😭`, tags["id"]);

                        if(args.length >= 1 && beatmapMods != null || args.length >= 1 && accuracy != null) {
                            let recalculate = await pp.calculate({
                                beatmapId: map.mapData.id,
                                mods: beatmapMods != null ? beatmapMods.join("").toUpperCase() : "",
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

                        this.twitchClient.reply(channel, `» ${map.name} ${beatmapMods ? "+"+beatmapMods.join("").toUpperCase() : ""} | ${moment(map.mapData["total_length"]*1000).format("mm:ss")} - ★ ${Math.round(map.mapData["difficulty_rating"] * 100) / 100} - AR${map.mapData.ar} | ${accuracy != null ? `${accuracy.join("")}: ${map.ppData.C}pp` : `95%: ${map.ppData.A}pp - 99%: ${map.ppData.S}pp - 100%: ${map.ppData.X}pp`} | ${map.mapData.url}`, tags["id"]);

                        break;
                    }
                }

                block.push(tags["username"]);
                setTimeout(() => block = block.filter(u => u !== tags["username"]), 3*1000);
            });

            this.twitchClient.connect().catch(() => reject());
        });
    }

    /**
     * Quick check if the given channel is live
     * @param {String} channel Twitch Username
     * @returns {Promise}
     */
    isLive(channel) {
        return new Promise(async (resolve) => {
            let expires = (Number(this.accessToken["expires"])-Math.floor(Date.now() / 1000));
            if(!this.accessToken["token"] || this.accessToken["token"] && expires <= 1000) {
                await fetch(`https://id.twitch.tv/oauth2/token?client_id=${this.clientId}&client_secret=${this.clientSecret}&grant_type=client_credentials`, { 
                    method: "POST",
                    retry: 3,
                    pause: 5000
                }).then(async (result) => {
                    result = await result.json();
                    this.accessToken["token"] = result.access_token;
                    this.accessToken["expires"] = (Math.floor(Date.now() / 1000)+result.expires_in);
                });
            }

            fetch(`https://api.twitch.tv/helix/streams?user_login=${channel}`, {
                method: "GET",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.accessToken["token"]}`,
                    "Client-Id": this.clientId
                },
                retry: 3,
                pause: 5000
            }).then(async (result) => {
                result = await result.json();
                resolve((result.data && result.data.length >= 1 ? true : false));
            }).catch(() => resolve(false));
        });
    }
}