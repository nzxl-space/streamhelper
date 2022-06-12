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

                    deps.database.all(`SELECT username FROM users WHERE twitch = \"${channel.replace(/#/, "")}\"`, async (err, rows) => {
                        if(err || rows.length <= 0) return;

                        let parsedMods = await deps.Bancho.parseMods(mods);
                        let pp = await deps.Bancho.calculate(map[0].beatmapId, [{ mods: parsedMods, acc: 95 }, { mods: parsedMods, acc: 98 }, { mods: parsedMods, acc: 99 }, { mods: parsedMods, acc: 100 }]);
                        deps.banchoClient.getUser(rows[0].username).sendMessage(`[★] ${tags["username"]} » [https://osu.ppy.sh/b/${map[0].beatmapId} ${map[0].artist} ${map[0].title} [${map[0].version}]] ${mods ? "+"+mods : "+NM"} | 95%: ${pp[0].pp}pp | 98%: ${pp[1].pp}pp | 99%: ${pp[2].pp}pp | 100%: ${pp[3].pp}pp | ${deps.moment( mods && mods.match(/DT|NC/) ? ((Math.round(map[0].totalLength*0.67) * 100) / 100)*1000  : map[0].totalLength*1000).format("mm:ss")} - ★ ${pp[0].stars} - ♫ ${map[0].countNormal+map[0].countSpinner+map[0].countSlider} - AR ${pp[0].ar} - OD ${pp[0].od}`);
                    });
                });
            }
        });

        deps.twitchClient.connect();
    }
}