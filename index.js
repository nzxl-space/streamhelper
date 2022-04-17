require('dotenv').config();
const tmi = require("tmi.js");
const Banchojs = require("bancho.js");
const moment = require("moment");
const { MapInfo, ModUtil } = require("@rian8337/osu-base");
const { MapStars, OsuPerformanceCalculator } = require("@rian8337/osu-difficulty-calculator");

let osuLink = /^(https:\/\/osu\.ppy\.sh\/beatmapsets)^\/|([0-9]+)|\#osu^\/|([0-9]+)/g, osuMods = /^\+|(EZ)|(NF)|(HT)|(SD)|(HD)|(HR)|(DT)|(FL)|(RX)|(SO)/i;

(() => {
    let twitch = new tmi.Client({ identity: { username: process.env["TWITCH_USERNAME"], password: process.env["TWITCH_PASSWORD"] }, channels: [process.env["TWITCH_CHANNEL"]] }),
        bancho = new Banchojs.BanchoClient({ username: process.env["OSU_MASTER"], password: process.env["OSU_PASSWORD"], apiKey: process.env["OSU_API_KEY"] });

    twitch.connect().then(async () => {
        console.log("Twitch connected");
        await bancho.connect().then(() => console.log("Bancho connected"));

        twitch.on("message", (channel, tags, message, self) => {
            message = message.split(" ");
            if(message[0].match(osuLink)) {
                let beatmap = message[0].match(osuLink)[0], diff = message[0].match(osuLink)[1], beatmapCalc = undefined, beatmapInfo, rating, mods;
                bancho.osuApi.beatmaps.getBySetId(beatmap).then(async (x) => {
                    for(setId in x) {
                        if(x[setId].id == diff) {
                            beatmapCalc = x[setId];
                        }
                    }

                    if(!beatmapCalc) beatmapCalc = x[0];

                    if(message[1] && message[1].match(osuMods))
                        mods = await ModUtil.pcStringToMods(message[1].replace(/^\+/, "").toUpperCase());

                    beatmapInfo = await MapInfo.getInformation({ beatmapID: beatmapCalc.id });
                    rating = await new MapStars().calculate({ map: beatmapInfo.map, mods: mods });

                    bancho.getUser(process.env["OSU_USERNAME"]).sendMessage(`[${tags["mod"] == true ? "MOD" : tags["subscriber"] == true ? "SUB" : tags.badges["vip"] ? "VIP" : "VIEWER"}] ${tags["username"]} » (${beatmapCalc.artist} - ${beatmapCalc.title} [${beatmapCalc.version}])[${message[0]}]${message[1] && message[1].match(osuMods) ? " +"+message[1].replace(/^\+/, "").toUpperCase() : ""} | 95%: ${Math.round(await new OsuPerformanceCalculator().calculate({ stars: rating.pcStars, accPercent: 95 }).total)}pp | 98%: ${Math.round(await new OsuPerformanceCalculator().calculate({ stars: rating.pcStars, accPercent: 98 }).total)}pp | 99%: ${Math.round(await new OsuPerformanceCalculator().calculate({ stars: rating.pcStars, accPercent: 99 }).total)}pp | 100%: ${Math.round(await new OsuPerformanceCalculator().calculate({ stars: rating.pcStars, accPercent: 100 }).total)}pp | ${moment.utc(beatmapCalc.totalLength*1000).format("mm:ss")} - ★ ${Math.ceil(beatmapCalc.difficultyRating)} - ♫ ${(beatmapCalc.countNormal+beatmapCalc.countSlider+beatmapCalc.countSpinner)} - AR${beatmapCalc.diffApproach} - OD${beatmapCalc.diffOverall}`);
                    twitch.say(channel, "Request sent!");
                });
            }
        });
    });
    
})();