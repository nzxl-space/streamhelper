const { MessageEmbed } = require('discord.js');
const deps = require("../constants.js");

module.exports = class Discord {
    createDiscord() {
        deps.discordClient.on("ready", () => {
            console.log(`Discord connected as ${deps.discordClient.user.tag}!`);
            deps.discordClient.user.setActivity({
                name: "osu!",
                type: "PLAYING"
            });
            deps.discordClient.user.setPresence({ status: "dnd" });

            setInterval(() => {
                deps.database.all("SELECT discord, secret FROM users", (err, rows) => {
                    if(err || rows.length <= 0) return;  

                    rows.forEach(user => {
                        if(deps.sockets[user.secret]) return;
                        deps.discordClient.guilds.cache.get(process.env.DISCORD_GUILD).members.cache.filter(x => x.id == user.discord).map(async x => {
                            if(!x.presence) return;
                            
                            let activity = x.presence.activities;
                            if(activity.length <= 0) return;

                            if(!deps.sockets[user.secret]) deps.Bancho.editData("Discord", true, user.secret);

                            let currentlyPlaying = activity.filter(x => x.name == "osu!" && x.type == "PLAYING" && x.details);
                            if(currentlyPlaying.length >= 1) {
                                let currentData = await deps.Bancho.getData(user.secret);
                                if(currentData && currentData.Beatmap.name != currentlyPlaying[0].details) {
                                    let mapData = await deps.Bancho.lookupBeatmap(currentlyPlaying[0].details);
                                    deps.Bancho.editData("Discord", true, user.secret);
                                    deps.Bancho.editData("setId", mapData.beatmapset_id, user.secret);
                                    deps.Bancho.editData("id", mapData.id, user.secret);
                                    deps.Bancho.editData("name", currentlyPlaying[0].details, user.secret);
                                    deps.Bancho.editData("playing", true, user.secret);
                                }
                            } else {
                                deps.Bancho.editData("playing", false, user.secret);
                            }
                        });
                    });
                });
            }, 5*1000);
        });

        deps.discordClient.on("messageCreate", message => {
            if(message.author.id != process.env.ADMIN || message.author.bot || !message.content.startsWith("!")) return;
            let args = message.content.replace("!", "").split(" ");
            let command = args.splice(0, 1);

            if(command == "help") {
                message.channel.send({ content: "Request command:", embeds: [new MessageEmbed()
                    .setTitle(command.toString().toUpperCase())
                    .setDescription("A list of all management commands")
                    .addField("!list", "List all current users", false)
                    .addField("!add <username> <twitch> <discord>", "Add a new user to db", true)
                    .addField("!remove <username>", "Remove a user from db", true)]});
                return;
            }

            if(command == "list") {
                deps.database.all("SELECT username, twitch FROM users", (err, rows) => {
                    if(err || rows.length <= 0) return message.reply("No users found");
                    message.reply(JSON.stringify(rows));
                });
                return;
            }

            if(command == "add") {
                if(args.length < 3) return message.reply("!add <username> <twitch> <discord>");
                if(!Number(args[2]) || !args[0].match(/^[a-zA-Z0-9_-]*/) || !args[1].match(/^[a-zA-Z0-9_-]*/)) return;

                deps.database.run(`INSERT INTO users (username, twitch, discord) VALUES (\"${args[0].toLowerCase()}\", \"${args[1].toLowerCase()}\", \"${Number(args[2])}\")`, (err) => {
                    if(err) return message.reply("Error occured while adding user to db");
                    message.reply(`Added user \`${args[0]}\` to database`);

                    deps.twitchClient.join(`#${args[1].toLowerCase()}`);
                });

                return;
            }

            if(command == "remove") {
                if(args.length < 2) return message.reply("!remove <username> <twitch>");

                deps.database.run(`DELETE FROM users WHERE username = \"${args[0].toLowerCase()}\"`, (err) => {
                    if(err) return message.reply("Error occured while removing user from db");
                    message.reply(`Removed user \`${args[0].toLowerCase()}\` from database`);

                    deps.twitchClient.part(`#${args[1]}`);
                });
                return;
            }
        });

        deps.discordClient.login(process.env.DISCORD_TOKEN);
    }
}