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
                            let activity = x.presence.activities;
                            if(activity.length <= 0) return;

                            let currentlyPlaying = activity.filter(x => x.name == "osu!" && x.type == "PLAYING" && x.details);
                            if(currentlyPlaying.length >= 1) {
                                let currentData = await deps.Bancho.getData(user.secret);
                                if(currentData.Beatmap.name != currentlyPlaying[0].details) {
                                    let mapData = await deps.Bancho.lookupBeatmap(currentlyPlaying[0].details);
                                    deps.Bancho.editData("setId", mapData.beatmapset_id, user.secret);
                                    deps.Bancho.editData("id", mapData.id, user.secret);
                                    deps.Bancho.editData("name", currentlyPlaying[0].details, user.secret);

                                    console.log(await deps.Bancho.getData(user.secret));
                                }
                            }
                        });
                    });
                });
            }, 5*1000);
        });

        deps.discordClient.login(process.env.DISCORD_TOKEN);
    }
}