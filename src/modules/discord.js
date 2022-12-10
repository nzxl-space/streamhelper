const c = require("../constants");

function connect() {
    return new Promise((resolve, reject) => {
        c.client.discord.on("error", () => {
            reject("Discord connection failed!")
        });

        c.client.discord.on("ready", () => {
            c.client.discord.user.setPresence({ activities: [{ name: "osu!", type: "PLAYING" }], status: "dnd" });

            c.client.discord.guilds.cache.get(process.env.DISCORD_GUILD).commands.create({
                name: "stats",
                description: "Map database stats for kiyomii bot"
            });
            
            resolve(`Discord connected as ${c.client.discord.user.tag}!`);
        });

        c.client.discord.on("interactionCreate", async (interaction) => {
            if(!interaction.isCommand()) return;
            const { commandName } = interaction;
    
            if(commandName == "ping") {
                interaction.reply({ content: "Pong!" });
            }

            if(commandName == "stats") {
                interaction.reply({ content: "You can find the stats here: https://stats.nzxl.space/"});
            }
        });

        c.client.discord.on("guildMemberRemove", async (member) => {
            await deleteUser(Number(member.id));
        });

        c.client.discord.on("presenceUpdate", async (_, presence) => {
            if(!c.database.userCount.includes(Number(presence.userId)) || presence.guild.id !== process.env.DISCORD_GUILD) return;
            
            let user = await c.database.users.findOne({ id: Number(presence.userId) });
            if(!user || user.length <= 0) return;

            let activity = presence.activities.filter(p => p.applicationId == "367827983903490050");

            if(user.osu_id == null) {
                if(user["activityRetryCount"] && user["activityRetryCount"] >= 20) {
                    await deleteUser(Number(presence.userId));
                    await updateRole(presence.userId, "on hold");
                    await sendMessage(
                        buildEmbed(2, {
                            title: `Beatmap Requests Disabled`,
                            description: "We're having trouble finding your osu! username through your game activity.\nPlease make sure your game activities are working and re-authorize your account.\nMore informations at <#1024630491145588768>! 😎",
                            url: `https://osu.nzxl.space/`,
                            action: `𝗡𝗢𝗧𝗜𝗖𝗘`,
                            footer: "presence_not_found"
                        }),
                    presence.userId);
                    return;
                }

                if(activity.length <= 0 || activity.length >= 1 && activity[0].assets == null) {
                    await c.database.users.updateOne({ id: Number(user.id) }, { $inc: { activityRetryCount: 1 } });
                    return;
                }

                if(activity[0].assets.largeText) {
                    let matched = activity[0].assets.largeText.match(c.storage.patterns.presence);
                    if(!matched || matched.length <= 0) {
                        await c.database.users.updateOne({ id: Number(user.id) }, { $inc: { activityRetryCount: 1 } });
                        return;
                    }

                    let osuId = await c.client.bancho.osuApi.user.get(matched[1].trim());
                    if(!osuId || osuId.length <= 0) {
                        await c.database.users.updateOne({ id: Number(user.id) }, { $inc: { activityRetryCount: 1 } });
                        return;
                    }

                    await c.database.users.updateOne({ id: Number(user.id) }, { $set: { osu_id: Number(osuId.id) }});
                    await updateRole(presence.userId, "regular");
                }
            }

            if(!user.osu_id) return;

            if(!c.storage.user.cache[`${user.twitch_id}`] || c.lib.moment(Date.now()).diff(c.storage.user.cache[`${user.twitch_id}`].refresh, "minutes") >= 60) {
                try {
                    let twitchName = await c.funcs.twitch.getUsername(user.twitch_id);
                    if(twitchName == null) throw new Error("Twitch Username not found");

                    c.storage.user.cache[`${user.twitch_id}`] = {
                        id: user.id,
                        osu: (await c.client.bancho.getUserById(user.osu_id)).catch(err => { throw new Error("Bancho Username not found, probably restricted"); }),
                        osu_id: user.osu_id,
                        twitch: twitchName,
                        twitch_id: user.twitch_id,
                        refresh: Date.now()
                    }
                } catch (err) {
                    console.log(`Failed to build cache for ${user.identifier}!`);
                }
            }

            let cache = c.storage.user.cache[`${user.twitch_id}`];

            let isJoined = c.client.twitch.getChannels().includes(`#${cache.twitch}`);
            let diff = c.lib.moment(Date.now()).diff(c.storage.user.lastChecked[`${user.twitch_id}`], "minutes");

            if(!c.storage.user.lastChecked[`${user.twitch_id}`] || Number(diff) && diff >= 8) {
                c.storage.user.lastChecked[`${user.twitch_id}`] = Date.now();

                let live = await c.funcs.twitch.isLive(user.twitch_id);

                if(!isJoined && live) {
                    c.client.twitch.join(`#${cache.twitch}`);

                    delete c.storage.user.currentlyPlaying[`${user.twitch_id}`]; // delete if it exists lol it may contain outdated data

                    await sendMessage(
                        buildEmbed(1, {
                            title: `Listening for requests on ${cache.twitch}!`,
                            description: `${cache.osu.ircUsername}`,
                            url: `https://twitch.tv/${cache.twitch}`,
                            fields: [],
                            action: `𝗕𝗢𝗧 𝗝𝗢𝗜𝗡𝗘𝗗 𝗖𝗛𝗔𝗡𝗡𝗘𝗟 » ${cache.twitch}`,
                            footer: "beatmap_requests_enabled",
                            image: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${cache.twitch}-440x248.jpg`
                        })
                    );
                } else if(isJoined && !live) {
                    c.client.twitch.part(`#${cache.twitch}`);
                }

                await c.funcs.log(String(cache.id), "twitch+api", 
                    {
                        type: "twitch+api",
                        channel_id: cache.twitch_id,
                        live: live ? true : false,
                        timestamp: c.lib.moment(Date.now()).toISOString()
                    }
                );
            }

            await c.funcs.bancho.getScores(user.osu_id);

            if(activity.length <= 0) return; // If no game activity found, just return and disable currentlyPlaying

            let mapName = activity[0].details;
            if(!mapName) return;

            let obj = c.storage.user.currentlyPlaying[`${user.twitch_id}`];
            if(!obj || typeof obj["currentMap"] == "object" && obj["currentMap"].name != mapName || typeof obj["currentMap"] == "string" && obj["currentMap"] != mapName) {
                let map = await c.funcs.bancho.getBeatmap(mapName).catch(err => err);

                c.storage.user.currentlyPlaying[`${user.twitch_id}`] = {
                    currentMap: typeof map == "object" ? map : mapName,
                    previousMap: obj ? obj["currentMap"] : undefined
                }
            }
        });

        c.client.discord.login(process.env.DISCORD_TOKEN);
    });
}
exports.connect = connect;

/**
 * Delete a user from the database
 * @param {String|Number} u Discord User ID
 * @returns {Promise}
 */
function deleteUser(u) {
    return new Promise(async (resolve) => {

        let user = await c.database.users.findOne({ id: u });
        if(!user || user.length <= 0) return resolve();

        if(user.twitch_id && c.storage.user.cache[`${user.twitch_id}`]) {
            let cache = c.storage.user.cache[`${user.twitch_id}`];

            if(c.client.twitch.getChannels().includes(`#${cache.twitch}`)) {
                c.client.twitch.part(`${cache.twitch}`);
            }
        }

        await c.database.users.deleteOne({ id: user.id });

        let index = c.database.userCount.indexOf(user.id);
        if(index > -1) {
            c.database.userCount.splice(index, 1);
        }

        console.log(`${user.identifier} has been removed from the service!`);

        resolve();
    });
}
exports.deleteUser = deleteUser;

/**
 * Update role of a Discord user
 * @param {String|Number} user Discord User ID
 * @param {String} role Discord Role Name
 * @returns {Promise}
 */
function updateRole(user, role) {
    return new Promise((resolve) => {
        let guild = c.client.discord.guilds.cache.get(process.env.DISCORD_GUILD);
        if(!guild) return;

        if(user) {
            if(!role) return;
        
            let member = guild.members.cache.get(user);
            let rolle = guild.roles.cache.find(r => r.name == role);

            if(!member || !rolle) return;

            // Remove all roles
            member.roles.set([]).then(async () => {
                await member.roles.add(rolle.id); // Add new role
                resolve();
            });
        }
    });
}
exports.updateRole = updateRole;

/**
 * Send a message to the "events" channel or a user
 * @param {String|Object} message String or Object
 * @param {Number|String|undefined} user Discord User ID
 * @returns {Promise}
 */
function sendMessage(message, user) {
    return new Promise((resolve) => {
        if(!message) return;
        
        let guild = c.client.discord.guilds.cache.get(process.env.DISCORD_GUILD);
        if(!guild) return;

        if(user) {
            let member = guild.members.cache.get(user);
            if(!member) return;

            return member.send(message).then(() => resolve());
        }

        let channel = guild.channels.cache.find(c => c.name == "events");
        if(!channel) return;

        channel.send(message).then(() => resolve());
    });
}
exports.sendMessage = sendMessage;

/**
 * Construct a message embed to send to a channel or user
 * @param {Number} type 0 = osu! | 1 = Twitch | 2 = nzxl.space | 3 = PogChamp
 * @param {Object} data Object containing the embed info
 * @param {String} data.title Title
 * @param {String} data.description Description
 * @param {String} data.url URL Link for Description
 * @param {String} data.action Event e.g. "A new map has been added!"
 * @param {Array}  data.fields Object Array
 * @param {String} data.footer Id of the action
 * @param {String} data.image Image
 * @returns {Object}
 */
function buildEmbed(type, data) {
    let embed = { 
        embeds: [
            new c.lib.discord.MessageEmbed({
                color: type == 0 ? "#FD7CB6" : type == 1 ? "#bb72f7" : type == 2 ? "#908aa3" : type == 3 ? "#ff0062" : "#908aa3",
                author: {
                    name: data.action,
                    icon_url: type == 0 ? "https://i.imgur.com/BGUNz25.png" : type == 1 ? "https://i.imgur.com/x0kqtjY.png" : type == 2 ? "https://i.imgur.com/9uEfUy5.png" : type == 3 ? "https://i.imgur.com/laAoimL.png" : "https://i.imgur.com/9uEfUy5.png",
                },
                title: data.title,
                description: data.description,
                url: data.url,
                fields: data.fields,
                footer: data.footer
            })
            .setImage(data.image)
            .setTimestamp()
        ]
    }
    return embed;
}
exports.buildEmbed = buildEmbed;