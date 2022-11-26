const tmi = require("tmi.js");
const moment = require("moment");
const clone = require("clone");
const fetch = require("node-fetch-retry");
const { BeatmapCalculator } = require("@kionell/osu-pp-calculator");
const pp = new BeatmapCalculator();

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
                const { mongoDB, bancho, discord } = require("../app");
                if(self) return;

                // what the F is this?? i dont know but it works lol
                // eslint-disable-next-line no-unused-vars
                let cache = Object.entries(discord.cache).filter(([key, value]) => value.twitch == channel.slice(1))[0].filter(x => x.twitch == channel.slice(1))[0];

                let beatmapId = message.match(Regex.beatmapId);
                let setId = message.match(Regex.setId);
                let beatmapMods = message.match(Regex.beatmapMods);
                let accuracy = message.match(Regex.Accuracy);

                if(beatmapId || setId) {
                    if(block.includes(tags["username"])) return;

                    let map = await bancho.getBeatmap(beatmapId && beatmapId.length >= 1 ? beatmapId[0] : setId[0]);
                    if(!map) return;

                    let user = await mongoDB.users.findOne({ twitch_id: Number(cache.twitch_id) });
                    if(!user || user.length <= 0) return;

                    if(user["silencedReq"]) return;

                    if(user["osu_id"]) {
                        if(user["blacklist"] && user["blacklist"].includes(tags["username"])) return;

                        let data = {
                            mapName: `[https://osu.ppy.sh/b/${map.mapData.id} ${map.name}]`,
                            mods: `${beatmapMods ? `+${beatmapMods.toString().toUpperCase()}` : ""}`,
                            stats: `★ ${Math.round(map.mapData.difficulty_rating * 100) / 100}, AR ${map.mapData.ar}, BPM ${map.mapData.bpm} - ${moment(map.mapData.total_length*1000).format("mm:ss")}`,
                            status: `${map.mapData.status[0].toUpperCase()}${map.mapData.status.slice(1)}`
                        }

                        let request = `${tags["username"]} × [${data["status"]}] ${data["mapName"]} ${data["mods"]} | (${data["stats"]})`;

                        await bancho.banchoClient.getUser(cache.osu.ircUsername).sendMessage(request.trim());
                        
                        if(!user["silenced"]) 
                            this.twitchClient.reply(channel, `» ${map.name} - Request sent!`, tags["id"]);

                        block.push(tags["username"]);
                        setTimeout(() => block = block.filter(u => u !== tags["username"]), 3*1000);
                    }

                    return;
                }

                let user = await mongoDB.users.findOne({ twitch_id: Number(cache.twitch_id) });
                if(!user || user.length <= 0) return;

                let prefix = user["prefix"] ? user["prefix"] : "!";
                let silencedCommands = ["np", "nppp", "last", "lastpp", "help"];
                let adminCommands = ["silence", "request", "blacklist", "prefix"];

                if(!message.startsWith(prefix)) return;
                let [command, ...args] = message.slice(prefix.length).trim().split(" ");

                if(user["silenced"] && silencedCommands.includes(command.toLowerCase())) return;

                let badges = tags.badges || {};
                let admin = badges["broadcaster"] ? true : badges["moderator"] ? true : false;

                if(adminCommands.includes(command.toLowerCase()) && !admin) return;

                switch (command.toLowerCase()) {
                    case "silence": {
                        await mongoDB.users.updateOne({ id: Number(user.id) }, [ { $set: { silenced: { $eq: [false, "$silenced"] } } } ]);
                        this.twitchClient.reply(channel, `» ${!user["silenced"] ? "Silenced" : "Enabled"} all bot messages for this channel`, tags["id"]);

                        break;
                    }

                    case "request": {
                        await mongoDB.users.updateOne({ id: Number(user.id) }, [ { $set: { silencedReq: { $eq: [false, "$silencedReq"] } } } ]);
                        this.twitchClient.reply(channel, `» ${!user["silencedReq"] ? "Silenced" : "Enabled"} beatmap requests`, tags["id"]);

                        break;
                    }

                    case "blacklist": {
                        if(args.length <= 0)
                            return this.twitchClient.reply(channel, `» Blacklisted users: ${user["blacklist"] && user["blacklist"].length >= 1 ? user["blacklist"].join(", ") : "None"}`, tags["id"]);

                        let fixed = args[0].match(/[a-zA-Z0-9_]+/g, "").join("").trim().toLowerCase();

                        if(user["blacklist"] && user["blacklist"].includes(fixed)) {
                            await mongoDB.users.updateOne({ id: Number(user.id) }, { $pull: { blacklist: fixed } });
                            return this.twitchClient.reply(channel, `» Specified user was removed from the blacklist`, tags["id"]);
                        }
    
                        await mongoDB.users.updateOne({ id: Number(user.id) }, [ { $set: { blacklist: { $ifNull: [ { $concatArrays: ["$blacklist", [fixed]] }, [fixed] ] } } } ]);
                        this.twitchClient.reply(channel, `» Specified user is now blacklisted from the bot`, tags["id"]);

                        break;
                    }

                    case "prefix": {
                        let allowedPrefixes = ["!", "+", ":", "-", "#", ".", ";", "@", "$", "=", "~", "_", "*", "&", "%"];

                        if(args.length <= 0) 
                            return this.twitchClient.reply(channel, `» Allowed prefixes: ${allowedPrefixes.join("")}`, tags["id"]);

                        if(!allowedPrefixes.includes(args[0].trim()))
                            return this.twitchClient.reply(channel, `» This prefix is not allowed, please try one of these: ${allowedPrefixes.join("")}`, tags["id"]);

                        await mongoDB.users.updateOne({ id: Number(user.id) }, { $set: { prefix: args[0].trim() }});
                        this.twitchClient.reply(channel, `» Prefix successfully changed`, tags["id"]);

                        break;
                    }

                    case "last":
                    case "np":  {
                        let map = command.toLowerCase() == "np" ? clone(discord.currentlyPlaying[`${cache.twitch_id}`]) : clone(discord.currentlyPlaying[`${cache.twitch_id}`].previousMap);
                        if(!map) 
                            return this.twitchClient.reply(channel, `» No data available, try again later 😭`, tags["id"]);

                        this.twitchClient.reply(channel, `» ${map.name} | ${moment(map.mapData["total_length"]*1000).format("mm:ss")} - ★ ${Math.round(map.mapData["difficulty_rating"] * 100) / 100} - AR${map.mapData.ar} | ${map.mapData.url}`, tags["id"]);

                        break;
                    }

                    case "lastpp":
                    case "nppp":  {
                        let map = command.toLowerCase() == "nppp" ? clone(discord.currentlyPlaying[`${cache.twitch_id}`]) : clone(discord.currentlyPlaying[`${cache.twitch_id}`].previousMap);
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
            });

            this.twitchClient.connect().catch(() => reject());
        });
    }

    /**
     * Refresh/Request API Access
     * @returns {Promise}
     */
    reqOAuth() {
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

                    resolve();
                });
            } else {
                resolve();
            }
        })
    }

    /**
     * Quick check if the given channel is live
     * @param {String} channel Twitch Username
     * @returns {Promise}
     */
    isLive(channel) {
        return new Promise(async (resolve) => {
            await this.reqOAuth();

            fetch(`https://api.twitch.tv/helix/streams?user_id=${channel}`, {
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

                if(result.data && result.data.length >= 1) {
                    if(result.data[0].game_name == "osu!") {
                        return resolve(true);
                    }
                }

                resolve(false);
            }).catch(() => resolve(false));
        });
    }

    /**
     * Convert twitch id to username
     * @param {String|Number} id Twitch User ID
     * @returns {Promise}
     */
    getUsername(id) {
        return new Promise(async (resolve) => {
            await this.reqOAuth();

            fetch(`https://api.twitch.tv/helix/users?id=${id}`, {
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
                if(result.data.length <= 0) return resolve(null);

                resolve(String(result.data[0].login).toLowerCase());

            }).catch(() => resolve(null));
        });
    }

    /**
     * Convert twitch username to id
     * @param {String|Number} username Twitch Username
     * @returns {Promise}
     */
    getId(username) {
        return new Promise(async (resolve) => {
            await this.reqOAuth();

            fetch(`https://api.twitch.tv/helix/users?login=${username}`, {
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
                if(result.data.length <= 0) return resolve(null);

                resolve(Number(result.data[0].id));

            }).catch(() => resolve(null));
        });
    }
}