const deps = require("../constants.js");

module.exports = class Twitch {
    createTwitch() {
        deps.twitchClient.on("connected", () => {
            console.log("Twitch connected!");
            deps.database.all("SELECT twitch FROM users", (err, rows) => {
                if(err || rows.length <= 0) return;
                rows.forEach(user => {
                    console.log(`Joining twitch channel >${user.twitch}< ..`);
                    deps.twitchClient.join(`#${user.twitch}`);
                });
            });
        });

        deps.twitchClient.on("message", (channel, tags, message, self) => {
            message = message.split(" ");
            let command = message[0].startsWith("!") ? message.splice(0, 1) : null;

            if(command == "!np") {
                return;
            }

            let beatmapId, setId, mods;
            message.forEach(msg => {
                if(msg.match(deps.Regex.beatmapLink) && msg.match(deps.Regex.beatmapLink)[0] == "https://osu.ppy.sh/beatmapsets/") {
                    beatmapId = msg.match(deps.Regex.beatmapLink)[1], setId = msg.match(deps.Regex.beatmapLink)[2];
                } else if(msg.match(deps.Regex.beatmapMods)) {
                    mods = msg.replace(/^\+/, "").toUpperCase();
                } 
            });

            if(beatmapId) {
                deps.banchoClient.osuApi.beatmaps.getBySetId(beatmapId).then(map => {
                    if(map.length <= 0) return;

                    deps.database.all(`SELECT username FROM users WHERE twitch = \"${channel.replace(/#/, "")}\"`, (err, rows) => {
                        if(err || rows.length <= 0) return;
                        deps.banchoClient.getUser(rows[0].username).sendMessage(`https://osu.ppy.sh/b/${map[0].beatmapId} ${mods}`);
                    });
                });
            }
        });

        deps.twitchClient.connect();
    }
}