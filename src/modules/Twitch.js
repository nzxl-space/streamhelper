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

        deps.twitchClient.on("message", async (channel, tags, message, self) => {
            if(self) return;
            message = message.split(" ");
            let command = message[0].startsWith("!") ? message.splice(0, 1) : null;

            if(command == "!np" || command == "!nppp") {
                deps.database.all(`SELECT secret FROM users WHERE twitch = \"${channel.replace(/#/, "")}\"`, async (err, rows) => {
                    if(err || rows.length <= 0) return;
                    let object = deps.osu[rows[0].secret];
                    if(object) {
                        let modsMatch = message.join("").replace(/^\+/, "").match(deps.Regex.beatmapMods), 
                        mods = message.length >= 1 && modsMatch ? modsMatch.join("").toUpperCase() : object.Player.mods.text,
                        pp = await deps.Bancho.calculate(object.Beatmap.id, [{ mods: parsedMods, acc: 95 }, { mods: parsedMods, acc: 98 }, { mods: parsedMods, acc: 99 }, { mods: parsedMods, acc: 100 }]);
                        
                        deps.twitchClient.say(channel, `/me [★] Playing » ${object.Beatmap.name} https://osu.ppy.sh/b/${object.Beatmap.id} ${mods ? "+"+mods : "+NM"} | 95%: ${pp[0].pp}pp | 98%: ${pp[1].pp}pp | 99%: ${pp[2].pp}pp | 100%: ${pp[3].pp}pp | ${deps.moment( mods.indexOf("DT") >= 1 || mods.indexOf("NC") >= 1 ? ((Math.round(pp[0].totalLength*0.67) * 100) / 100)*1000  : pp[0].totalLength*1000).format("mm:ss")} - ★ ${pp[0].stars} - ♫ ${pp[0].countNormal+pp[0].countSpinner+pp[0].countSlider} - AR ${pp[0].ar} - OD ${pp[0].od}`);
                    } else {
                        deps.twitchClient.say(channel, "/me No data available at the moment.");
                    }
                });
                return;
            }

            message = message.toString();
            let beatmapId = message.match(deps.Regex.beatmapLink);
            let mods = message.replace(/^https:\/\//g, "").match(deps.Regex.beatmapMods);

            if(beatmapId) {
                let map = await deps.banchoClient.osuApi.beatmaps.getBySetId(beatmapId[0]) || await deps.banchoClient.osuApi.beatmaps.getByBeatmapId(beatmapId[0]);
                if(!map) return;

                deps.database.all(`SELECT username FROM users WHERE twitch = \"${channel.replace(/#/, "")}\"`, async (err, rows) => {
                    if(err || rows.length <= 0) return;

                    let parsedMods = await deps.Bancho.parseMods(mods.toString());
                    let pp = await deps.Bancho.calculate(map[0].beatmapId, [{ mods: parsedMods, acc: 95 }, { mods: parsedMods, acc: 98 }, { mods: parsedMods, acc: 99 }, { mods: parsedMods, acc: 100 }]);
                    deps.banchoClient.getUser(rows[0].username).sendMessage(`[★] ${tags["username"]} » [https://osu.ppy.sh/b/${map[0].beatmapId} ${map[0].artist} ${map[0].title} [${map[0].version}]] ${mods ? "+"+mods.join("") : "+NM"} | 95%: ${pp[0].pp}pp | 98%: ${pp[1].pp}pp | 99%: ${pp[2].pp}pp | 100%: ${pp[3].pp}pp | ${deps.moment( mods.includes("DT") || mods.includes("NC") ? ((Math.round(map[0].totalLength*0.67) * 100) / 100)*1000  : map[0].totalLength*1000).format("mm:ss")} - ★ ${pp[0].stars} - ♫ ${map[0].countNormal+map[0].countSpinner+map[0].countSlider} - AR ${pp[0].ar} - OD ${pp[0].od}`);
                });
            }
        });

        deps.twitchClient.connect();
    }
}