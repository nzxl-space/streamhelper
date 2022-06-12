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
                deps.database.all("SELECT discord FROM users", (err, rows) => {
                    if(err || rows.length <= 0) return;  

                    rows.forEach(user => {
                        deps.discordClient.guilds.cache.get(process.env.DISCORD_GUILD).members.cache.filter(x => x.id == user.discord).map(x => {
                            let activity = x.presence.activities;
                            if(activity.length <= 0) return;

                            let currentlyPlaying = activity.filter(x => x.name == "osu!" && x.type == "PLAYING" && x.details);
                            if(currentlyPlaying.length >= 1) {
                                // console.log(currentlyPlaying[0].details);
                            }
                        });
                    });
                });
            }, 5*1000);
        });

        deps.discordClient.login(process.env.DISCORD_TOKEN);
    }
}