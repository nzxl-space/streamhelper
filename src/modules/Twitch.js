const deps = require("../constants.js");

module.exports = class Twitch {
    createTwitch() {
        deps.axios({
            method: "POST",
            url: "https://id.twitch.tv/oauth2/token",
            data: {
                client_id: process.env.TWITCH_CLIENT_ID,
                client_secret: process.env.TWITCH_CLIENT_SECRET,
                grant_type: "client_credentials"
            },
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json"
            }
        }).then(result => {
            deps.twitchClient.accessToken = result.data.access_token;
            console.log("Twitch Access Token set!");
        });

        deps.twitchClient.on("connected", () => {
            console.log("Twitch connected!");
            setInterval(() => {
                deps.database.all("SELECT twitch FROM users", (err, rows) => {
                    if(err || rows.length <= 0) return;
                    rows.forEach(user => {
                        deps.axios({
                            method: "GET",
                            url: "https://api.twitch.tv/helix/streams",
                            params: {
                                user_login: user.twitch
                            },
                            headers: {
                                Accept: "application/json",
                                "Content-Type": "application/json",
                                Authorization: `Bearer ${deps.twitchClient.accessToken}`,
                                "Client-Id": process.env.TWITCH_CLIENT_ID
                            }
                        }).then(result => {
                            if(result.data.data.length >= 1 && result.data.data[0].game_name == "osu!" && !deps.twitchClient.getChannels().includes(`#${user.twitch}`)) {
                                console.log(`Listening for requests on #${user.twitch}`);
                                deps.twitchClient.join(`#${user.twitch}`);
                            } else if(result.data.data.length >= 1 && result.data.data[0].game_name != "osu!" && deps.twitchClient.getChannels().includes(`#${user.twitch}`)) {
                                console.log(`Left channel #${user.twitch}`);
                                deps.twitchClient.part(`#${user.twitch}`);
                            }
                        });
                    });
                });
            }, 5*1000);
        });

        deps.twitchClient.on("message", async (channel, tags, message, self) => {
            if(self) return;
            message = message.split(" ");
            let command = message[0].startsWith("!") ? message.splice(0, 1) : null;

            if(command == "!np" || command == "!nppp") {
                deps.database.all(`SELECT secret FROM users WHERE twitch = \"${channel.replace(/#/, "")}\"`, async (err, rows) => {
                    if(err || rows.length <= 0) {
                        return deps.twitchClient.part(channel);
                    }
                    let object = deps.osu[rows[0].secret];
                    if(object) {
                        let modsMatch = message.join("").match(deps.Regex.beatmapMods), 
                        mods = message.length >= 1 && modsMatch ? modsMatch.replace(/\+/, "").toUpperCase() : object.Player.mods.text,
                        parsedMods = await deps.Bancho.parseMods(mods),
                        pp = await deps.Bancho.calculate(object.Beatmap.id, [{ mods: parsedMods, acc: 95 }, { mods: parsedMods, acc: 98 }, { mods: parsedMods, acc: 99 }, { mods: parsedMods, acc: 100 }]);
                        
                        deps.twitchClient.say(channel, `/me [★] Playing » ${object.Beatmap.name} https://osu.ppy.sh/b/${object.Beatmap.id} ${mods ? "+"+mods : "+NM"} | 95%: ${pp[0].pp}pp | 98%: ${pp[1].pp}pp | 99%: ${pp[2].pp}pp | 100%: ${pp[3].pp}pp | ${deps.moment( mods && mods.indexOf("DT") >= 1 || mods && mods.indexOf("NC") >= 1 ? ((Math.round(pp[0].totalLength*0.67) * 100) / 100)*1000  : pp[0].totalLength*1000).format("mm:ss")} - ★ ${pp[0].stars} - ♫ ${pp[0].countNormal+pp[0].countSpinner+pp[0].countSlider} - AR ${pp[0].ar} - OD ${pp[0].od}`);
                    } else {
                        deps.twitchClient.say(channel, "/me No data available at the moment.");
                    }
                });
                return;
            }

            message = message.join(" ");
            let beatmapId = message.match(deps.Regex.beatmapId);
            let setId = message.match(deps.Regex.setId);
            let mods = message.match(deps.Regex.beatmapMods);

            if(beatmapId) {
                let map = await deps.banchoClient.osuApi.beatmaps.getBySetId(beatmapId[0]);
                if(!map) return;

                if(setId)
                    map = map.filter(x => x.id == setId);

                deps.database.all(`SELECT username FROM users WHERE twitch = \"${channel.replace(/#/, "")}\"`, async (err, rows) => {
                    if(err || rows.length <= 0) {
                        return deps.twitchClient.part(channel);
                    }

                    let parsedMods = mods ? await deps.Bancho.parseMods(mods.join("").replace("+", "")) : 0;
                    let pp = await deps.Bancho.calculate(map[0].beatmapId, [{ mods: parsedMods, acc: 95 }, { mods: parsedMods, acc: 98 }, { mods: parsedMods, acc: 99 }, { mods: parsedMods, acc: 100 }]);
                    deps.banchoClient.getUser(rows[0].username).sendMessage(`[★] ${tags["username"]} » [https://osu.ppy.sh/b/${map[0].beatmapId} ${map[0].artist} ${map[0].title} [${map[0].version}]] ${mods ? mods.join("").toUpperCase() : "+NM"} | 95%: ${pp[0].pp}pp | 98%: ${pp[1].pp}pp | 99%: ${pp[2].pp}pp | 100%: ${pp[3].pp}pp | ${deps.moment( mods && mods.indexOf("DT") >= 1 || mods && mods.indexOf("NC") ? ((Math.round(map[0].totalLength*0.67) * 100) / 100)*1000  : map[0].totalLength*1000).format("mm:ss")} - ★ ${pp[0].stars} - ♫ ${map[0].countNormal+map[0].countSpinner+map[0].countSlider} - AR ${pp[0].ar} - OD ${pp[0].od}`);
                });
            }
        });

        deps.twitchClient.connect();
    }
}