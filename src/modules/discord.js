const { users, mapData, activeUsers } = require("./mongodb.js");
const { Client, Intents, MessageEmbed } = require("discord.js");

module.exports = class Discord {
    constructor(token, guild, downloadURL) {
        this.token = token;
        this.guild = guild;
        this.downloadURL = downloadURL;
        this.discordClient = null;

        this.createInstance()
        .then(() => console.log("Discord connected!"))
        .catch(() => console.log("Discord failed!"));
    }

    createInstance() {
        return new Promise((resolve, reject) => {
            this.discordClient = exports.discordClient = new Client(
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

            this.discordClient.on("guildMemberRemove", (member) => {
                
            });

            this.discordClient.on("presenceUpdate", (_old, _new) => {

            });

            this.discordClient.login(this.token);
        });
    }

    deleteUser(user) {
        return new Promise((resolve) => {
            users.findOne({ userId: user }).then(async (result) => {
                await toggleChannel(user.twitch, false);
                await users.deleteOne({ userId: result.userId });
    
                if(activeUsers.indexOf(result.userId) > -1)
                    activeUsers.splice(activeUsers.indexOf(result.userId), 1);
    
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
     * @param {Number} type 0 = osu! | 1 = Twitch | 2 = nzxl.space
     * @param {Object} data Object containing the embed info
     * @param {String} data.title Title
     * @param {String} data.description Description
     * @param {String} data.url URL Link for Description
     * @param {String} data.action Event e.g. "A new map has been added!"
     * @param {Array}  data.fields Object Array
     * @param {String} data.image Image
     * @returns {Object}
     */
    buildEmbed(type, data) {
        let embed = { 
            embeds: [
                new MessageEmbed({
                    color: type == 0 ? "#FD7CB6" : type == 1 ? "#bb72f7" : "#908aa3",
                    author: {
                        name: data.action,
                        icon_url: type == 0 ? "https://i.imgur.com/NJt4fjH.png" : type == 1 ? "https://i.imgur.com/x0kqtjY.png" : "https://i.imgur.com/9uEfUy5.png",
                    },
                    title: data.title,
                    description: data.description,
                    url: data.url,
                    fields: data.fields,
                    image: data.image
                })
                .setTimestamp()
            ]
        }
        return embed;
    }
}