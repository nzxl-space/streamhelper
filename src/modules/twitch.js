const c = require("../constants");

function connect() {
    return new Promise((resolve, reject) => {
        c.client.twitch.on("connected", () => {
            resolve(`Twitch connected as ${process.env.TWITCH_USERNAME}!`);
        });

        c.client.twitch.on("join", (channel, username, self) => {
            if(!self) return;
            console.log(`Enabled Beatmap Requests for ${channel}!`);
        });

        c.client.twitch.on("part", (channel, username, self) => {
            if(!self) return;
            console.log(`Disabled Beatmap Requests for ${channel}!`);
        });

        c.client.twitch.on("message", async (channel, tags, message, self) => {
            if(self) return;

            // eslint-disable-next-line no-unused-vars
            let lookupCache = Object.entries(c.storage.user.cache).filter(([k, v]) => v.twitch == channel.slice(1))[0];
            let cache = lookupCache[1];

            let beatmapId = message.match(c.storage.patterns.beatmap_id);
            let setId = message.match(c.storage.patterns.set_id);
            let beatmapMods = message.match(c.storage.patterns.beatmap_mods);
            let accuracy = message.match(c.storage.patterns.accuracy);

            if(beatmapId || setId) {
                if(c.storage.block.includes(tags["username"])) return;

                let map = await c.funcs.bancho.getBeatmap(beatmapId && beatmapId.length >= 1 ? Number(beatmapId[0]) : Number(setId[0]));

                let user = await c.database.users.findOne({ twitch_id: Number(cache.twitch_id)});
                if(!user || user.length <= 0) return;

                if(user["silencedReq"] || !user["osu_id"]) return;
                if(user["blacklist"] && user["blacklist"].includes(tags["username"])) return;

                let data = {
                    mapName: `[https://osu.ppy.sh/b/${map.beatmap_id} ${map.name}]`,
                    mods: `${beatmapMods ? `+${beatmapMods.toString().toUpperCase()}` : ""}`,
                    stats: `★ ${map.stars}, AR ${map.stats.ar}, BPM ${map.stats.bpm} - ${c.lib.moment(map.stats.length*1000).format("mm:ss")}`,
                    status: `${map.status[0].toUpperCase()}${map.status.slice(1)}`
                }

                let request = `${tags["username"]} × [${data["status"]}] ${data["mapName"]} ${data["mods"]} | (${data["stats"]})`;

                await c.client.bancho.getUser(cache.osu.ircUsername).sendMessage(request.trim()).then(() => {
                    if(user["silenced"]) return;
                    c.client.twitch.reply(channel, `» ${map.name} - Request sent!`, tags["id"]);
                });
                
                c.storage.block.push(tags["username"]);
                setTimeout(() => c.storage.block = c.storage.block.filter(u => u !== tags["username"]), 3*1000);
            }

            let user = await c.database.users.findOne({ twitch_id: Number(cache.twitch_id)});
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
                    await c.database.users.updateOne({ id: Number(user.id) }, [ { $set: { silenced: { $eq: [false, "$silenced"] } } } ]);
                    c.client.twitch.reply(channel, `» ${!user["silenced"] ? "Silenced" : "Enabled"} all bot messages for this channel`, tags["id"]);

                    break;
                }

                case "request": {
                    await c.database.users.updateOne({ id: Number(user.id) }, [ { $set: { silencedReq: { $eq: [false, "$silencedReq"] } } } ]);
                    c.client.twitch.reply(channel, `» ${!user["silencedReq"] ? "Silenced" : "Enabled"} beatmap requests`, tags["id"]);

                    break;
                }

                case "blacklist": {
                    if(args.length <= 0)
                        return c.client.twitch.reply(channel, `» Blacklisted users: ${user["blacklist"] && user["blacklist"].length >= 1 ? user["blacklist"].join(", ") : "None"}`, tags["id"]);

                    let fixed = args[0].match(/[a-zA-Z0-9_]+/g);
                    if(!fixed || fixed.length <= 0) return;

                    fixed = fixed.join("").trim().toLowerCase();
                    
                    if(user["blacklist"] && user["blacklist"].includes(fixed)) {
                        await c.database.users.updateOne({ id: Number(user.id) }, { $pull: { blacklist: fixed } });
                        return c.client.twitch.reply(channel, `» Specified user was removed from the blacklist`, tags["id"]);
                    }

                    await c.database.users.updateOne({ id: Number(user.id) }, [ { $set: { blacklist: { $ifNull: [ { $concatArrays: ["$blacklist", [fixed]] }, [fixed] ] } } } ]);
                    c.client.twitch.reply(channel, `» Specified user is now blacklisted from the bot`, tags["id"]);

                    break;
                }

                case "prefix": {
                    let allowedPrefixes = ["!", "+", ":", "-", "#", ".", ";", "@", "$", "=", "~", "_", "*", "&", "%"];

                    if(args.length <= 0) 
                        return c.client.twitch.reply(channel, `» Allowed prefixes: ${allowedPrefixes.join("")}`, tags["id"]);

                    if(!allowedPrefixes.includes(args[0].trim()))
                        return c.client.twitch.reply(channel, `» This prefix is not allowed, please try one of these: ${allowedPrefixes.join("")}`, tags["id"]);

                    await c.database.users.updateOne({ id: Number(user.id) }, { $set: { prefix: args[0].trim() }});
                    c.client.twitch.reply(channel, `» Prefix successfully changed`, tags["id"]);

                    break;
                }

                case "last":
                case "np":  {
                    let map = command.toLowerCase() == "np" ? c.lib.clone(c.storage.user.currentlyPlaying[`${cache.twitch_id}`].currentMap) : c.lib.clone(c.storage.user.currentlyPlaying[`${cache.twitch_id}`].previousMap);
                    if(!map) 
                        return c.client.twitch.reply(channel, `» No data available, try again later!`, tags["id"]);

                    c.client.twitch.reply(channel, `» ${map.name} | ${c.lib.moment(map.stats.length*1000).format("mm:ss")} - ★ ${map.stars} - AR${map.stats.ar} | https://osu.ppy.sh/b/${map.beatmap_id}`, tags["id"]);

                    break;
                }

                case "lastpp":
                case "nppp":  {
                    let map = command.toLowerCase() == "nppp" ? c.lib.clone(c.storage.user.currentlyPlaying[`${cache.twitch_id}`].currentMap) : c.lib.clone(c.storage.user.currentlyPlaying[`${cache.twitch_id}`].previousMap);
                    if(!map) 
                        return c.client.twitch.reply(channel, `» No data available, try again later!`, tags["id"]);

                    if(args.length >= 1 && beatmapMods != null || args.length >= 1 && accuracy != null) {
                        let recalculate = await c.client.calculator.calculate({
                            beatmapId: map.beatmap_id,
                            mods: beatmapMods != null ? beatmapMods.join("").toUpperCase() : "",
                            accuracy: accuracy != null ? [95, 99, 100, Number(accuracy.join("").replace(/%/, ""))] : undefined
                        });
                        
                        // stats
                        map.stats.length = recalculate.beatmapInfo.length;
                        map.stars = Math.round(recalculate.difficulty.starRating * 100) / 100;
                        map.stats.ar = Math.round(recalculate.difficulty.approachRate * 100) / 100;
    
                        // pp
                        map.pp.A = Math.round(recalculate.performance[0].totalPerformance);
                        map.pp.S = Math.round(recalculate.performance[1].totalPerformance);
                        map.pp.X = Math.round(recalculate.performance[2].totalPerformance);
    
                        // custom pp for accuracy
                        if(accuracy != null) {
                            map.pp.C = Math.round(recalculate.performance[3].totalPerformance);
                        }
                    }

                    c.client.twitch.reply(channel, `» ${map.name} ${beatmapMods ? "+"+beatmapMods.join("").toUpperCase() : ""} | ${c.lib.moment(map.stats.length*1000).format("mm:ss")} - ★ ${map.stars} - AR${map.stats.ar} | ${accuracy != null ? `${accuracy.join("")}: ${map.pp.C}pp` : `95%: ${map.pp.A}pp - 99%: ${map.pp.S}pp - 100%: ${map.pp.X}pp`} | https://osu.ppy.sh/b/${map.beatmap_id}`, tags["id"]);

                    break;
                }
            }
        });
        
        c.client.twitch.connect().catch(() => {
            reject("Twitch connection failed!");
        });
    });
}
exports.connect = connect;

/**
 * Refresh/Request API Access
 * @returns {Promise}
 */
function OAuth2() {
    return new Promise(async (resolve) => {
        let expires = (Number(c.storage.tokens.twitch["expires"])-Math.floor(Date.now() / 1000));
        if(!c.storage.tokens.twitch["token"] || c.storage.tokens.twitch["token"] && expires <= 1000) {
            await c.lib.fetch(`https://id.twitch.tv/oauth2/token?client_id=${process.env.TWITCH_CLIENT_ID}&client_secret=${process.env.TWITCH_CLIENT_SECRET}&grant_type=client_credentials`, { 
                method: "POST",
                retry: 3,
                pause: 5000
            }).then(async (result) => {
                result = await result.json();

                c.storage.tokens.twitch["token"] = result.access_token;
                c.storage.tokens.twitch["expires"] = (Math.floor(Date.now() / 1000)+result.expires_in);

                resolve();
            });
        } else {
            resolve();
        }
    });
}

/**
 * Quick check if the given channel is live
 * @param {String} channel Twitch Id
 * @returns {Promise}
 */
function isLive(channel) {
    return new Promise(async (resolve) => {
        await OAuth2();

        c.lib.fetch(`https://api.twitch.tv/helix/streams?user_id=${channel}`, {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": `Bearer ${c.storage.tokens.twitch["token"]}`,
                "Client-Id": process.env.TWITCH_CLIENT_ID
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
module.exports.isLive = isLive;

/**
 * Convert twitch id to username
 * @param {String|Number} id Twitch User ID
 * @returns {Promise}
 */
function getUsername(id) {
    return new Promise(async (resolve) => {
        await OAuth2();

        c.lib.fetch(`https://api.twitch.tv/helix/users?id=${id}`, {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": `Bearer ${c.storage.tokens.twitch["token"]}`,
                "Client-Id": process.env.TWITCH_CLIENT_ID
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
module.exports.getUsername = getUsername;

/**
 * Convert twitch username to id
 * @param {String|Number} username Twitch Username
 * @returns {Promise}
 */
function getId(username) {
    return new Promise(async (resolve) => {
        await OAuth2();

        c.lib.fetch(`https://api.twitch.tv/helix/users?login=${username}`, {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": `Bearer ${c.storage.tokens.twitch["token"]}`,
                "Client-Id": process.env.TWITCH_CLIENT_ID
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
module.exports.getId = getId;