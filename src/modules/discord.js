const moment = require("moment");
const { Client, Intents, MessageEmbed } = require("discord.js");
const presencePattern = /^(.*?)\(rank\s#(?:\d+)(?:,\d{1,3}|,\d{1,3},\d{1,3})?\)/;

module.exports = class Discord {
    constructor(token, guild, downloadURL) {
        this.token = token;
        this.guild = guild;
        this.downloadURL = downloadURL;

        // export vars
        this.discordClient = null;
        this.currentlyPlaying = {};
        this.lastChecked = {};
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.discordClient = new Client(
                {
                    partials: ["CHANNEL"],
                    intents: [ 
                        Intents.FLAGS.GUILDS, 
                        Intents.FLAGS.GUILD_MESSAGES, 
                        Intents.FLAGS.GUILD_MEMBERS, 
                        Intents.FLAGS.GUILD_PRESENCES, 
                        Intents.FLAGS.DIRECT_MESSAGES, 
                        Intents.FLAGS.DIRECT_MESSAGE_TYPING 
                    ]
                }
            );

            this.discordClient.on("error", () => reject());
            this.discordClient.on("ready", () => {
                this.discordClient.user.setPresence({ activities: [{ name: "osu!", type: "PLAYING" }], status: "dnd" });
                resolve();
            });

            this.discordClient.on("guildMemberRemove", async (member) => await this.deleteUser(member.id));

            this.discordClient.on("presenceUpdate", async (_, presence) => {
                const { mongoDB, twitch, bancho } = require("../app");
                if(!mongoDB.activeUsers.includes(presence.userId) || presence.guild.id !== this.guild) return;

                let user = await mongoDB.users.findOne({ userId: presence.userId });
                if(!user || user.length <= 0) return;

                let activity = presence.activities.filter(p => p.applicationId == "367827983903490050");

                if(user.osu == null) {
                    if(user["activityRetryCount"] && user["activityRetryCount"] >= 20) {
                        await this.deleteUser(user.userId);
                        await this.updateRole(user.userId, "on hold");
                        await this.sendMessage(
                            this.buildEmbed(2, {
                                title: `Beatmap Requests Disabled`,
                                description: "We're having trouble finding your osu! username through your game activity.\nPlease make sure your game activities are working and re-authorize your account.\nMore informations at <#1024630491145588768>! 😎",
                                url: `https://osu.nzxl.space/`,
                                action: `𝗡𝗢𝗧𝗜𝗖𝗘`,
                                footer: "presence_not_found"
                            }),
                        user.userId);
                        return;
                    }

                    if(activity.length <= 0 || activity.length >= 1 && activity[0].assets == null) {
                        await mongoDB.users.updateOne({ userId: user.userId }, { $inc: { activityRetryCount: 1 } });
                        return;
                    }

                    if(activity[0].assets.largeText) {
                        let matched = activity[0].assets.largeText.match(presencePattern);
                        if(!matched || matched.length <= 0) {
                            await mongoDB.users.updateOne({ userId: user.userId }, { $inc: { activityRetryCount: 1 } });
                            return;
                        }

                        await mongoDB.users.updateOne({ userId: user.userId }, { $set: { osu: matched[1].trim() }});
                        await this.updateRole(user.userId, "regular");
                    }
                }

                let isJoined = twitch.twitchClient.getChannels().includes(`#${user.twitch}`);
                let diff = moment(Date.now()).diff(this.lastChecked[`${user.twitch}`], "minutes");

                if(!this.lastChecked[`${user.twitch}`] || Number(diff) && diff >= 3) {
                    this.lastChecked[`${user.twitch}`] = Date.now();

                    let live = await twitch.isLive(user.twitch);

                    if(!isJoined && live) {
                        twitch.twitchClient.join(`#${user.twitch}`);

                        await this.sendMessage(
                            this.buildEmbed(1, {
                                title: `Listening for requests on ${user.twitch}!`,
                                description: `${user.osu}`,
                                url: `https://twitch.tv/${user.twitch}`,
                                fields: [],
                                action: `𝗕𝗢𝗧 𝗝𝗢𝗜𝗡𝗘𝗗 𝗖𝗛𝗔𝗡𝗡𝗘𝗟 » ${user.twitch}`,
                                footer: "beatmap_requests_enabled",
                                image: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${user.twitch}-440x248.jpg`
                            })
                        );
                    } else if(isJoined && !live) {
                        twitch.twitchClient.part(`#${user.twitch}`);
                    }
                }

                await bancho.getScores(user.osu);

                if(activity.length <= 0) return; // If no game activity found, just return and disable currentlyPlaying

                let mapName = activity[0].details;
                if(!mapName) return;

                if(!this.currentlyPlaying[`${user.twitch}`] || this.currentlyPlaying[`${user.twitch}`] && this.currentlyPlaying[`${user.twitch}`].name != mapName) {

                    let map = await bancho.getBeatmap(mapName);

                    this.currentlyPlaying[`${user.twitch}`] = {
                        name: mapName,
                        mapData: map.mapData,
                        ppData: {
                            A: map.ppData["A"],
                            S: map.ppData["S"],
                            X: map.ppData["X"]
                        },
                        previousMap: this.currentlyPlaying[`${user.twitch}`]
                    }
                }
            });

            this.discordClient.login(this.token);
        });
    }

    /**
     * Delete a user from the database
     * @param {String|Number} user Discord User ID
     * @returns {Promise}
     */
    deleteUser(user) {
        return new Promise((resolve) => {
            const { mongoDB, twitch } = require("../app");
            mongoDB.users.findOne({ userId: user }).then(async (result) => {
                if(!result || result.length <= 0) return;
                
                if(result["twitch"]) {
                    if(twitch.twitchClient.getChannels().includes(`#${result.twitch}`))
                        twitch.twitchClient.part(`#${result.twitch}`);
                }

                await mongoDB.users.deleteOne({ userId: result.userId });
    
                if(mongoDB.activeUsers.indexOf(result.userId) > -1)
                    mongoDB.activeUsers.splice(mongoDB.activeUsers.indexOf(result.userId), 1);
    
                console.log(`${result.discordName} has been removed from the service!`);

                resolve();
            });
        });
    }

    /**
     * Update role of a Discord user
     * @param {String|Number} user Discord User ID
     * @param {String} role Discord Role Name
     * @returns {Promise}
     */
    updateRole(user, role) {
        return new Promise((resolve) => {
            let guild = this.discordClient.guilds.cache.get(this.guild);
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

    /**
     * Send a message to the "events" channel or a user
     * @param {String|Object} message String or Object
     * @param {Number|String|undefined} user Discord User ID
     * @returns {Promise}
     */
    sendMessage(message, user) {
        return new Promise((resolve) => {
            if(!message) return;
            
            let guild = this.discordClient.guilds.cache.get(this.guild);
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
    buildEmbed(type, data) {
        let embed = { 
            embeds: [
                new MessageEmbed({
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
}