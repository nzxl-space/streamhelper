const c = require("../constants");

function connect() {
    return new Promise((resolve, reject) => {
        c.client.bancho.on("connected", () => {
            resolve(`Bancho connected as ${process.env.OSU_USERNAME}!`);
        });

        c.client.bancho.connect().catch(() => {
            reject("Bancho connection failed!");
        });
    });
}
exports.connect = connect;

/**
 * Parse bit value to a readable string
 * @param {Number} num 72
 * @returns {String} +HDDT
 */
function parseMods(num) {
    let list = [];

    if(Number(num)) {
        if((num & 1<<0) != 0) list.push("NF");
        if((num & 1<<1) != 0) list.push("EZ");
        if((num & 1<<3) != 0) list.push("HD");
        if((num & 1<<4) != 0) list.push("HR");
        if((num & 1<<5) != 0) list.push("SD");
        else if((num & 1<<14) != 0) list.push("PF");
        if((num & 1<<9) != 0) list.push("NC");
        else if((num & 1<<6) != 0) list.push("DT");
        if((num & 1<<7) != 0) list.push("RX");
        if((num & 1<<8) != 0) list.push("HT");
        if((num & 1<<10) != 0) list.push("FL");
        if((num & 1<<12) != 0) list.push("SO");
    }

    return list.length >= 1 ? `+${list.join("")}` : "+NM";
}

/**
 * Render a replay video through o!rdr API (s/o to my homie MasterIO)
 * @param {Buffer|ReadableStream} replay File Buffer of a Replay File
 * @returns {Promise}
 */
function render(replay) {
    return new Promise(async (resolve) => {
        if(!replay) return;

        let start = Date.now();
        let video = { renderID: 0, done: 0, url: null };

        let ordrClient = await c.client.socket.connect("https://ordr-ws.issou.best");
        ordrClient.on("render_done_json", (result) => {
            if(result["renderID"] == video["renderID"]) {
                video = { renderID: video["renderID"], done: Date.now(), url: result["videoUrl"] };
                ordrClient.disconnect();
            }
        });

        let replayForm = new FormData();
        replayForm.append("replayFile", replay, { filename: "replay.osr", contentType: "application/octet-stream" });
        replayForm.append("username", "streamhelper");
        replayForm.append("resolution", "1280x720");
        replayForm.append("verificationKey", process.env.OSURENDER);

        // Danser Settigns
        replayForm.append("skin", "3049");
        replayForm.append("customSkin", "true");
        replayForm.append("globalVolume", "50");
        replayForm.append("musicVolume", "50");
        replayForm.append("hitsoundVolume", "75");
        replayForm.append("useSkinColors", "true");
        replayForm.append("useBeatmapColors", "false");
        replayForm.append("introBGDim", "90");
        replayForm.append("inGameBGDim", "90");
        replayForm.append("breakBGDim", "90");
        replayForm.append("showDanserLogo", "false");
        replayForm.append("cursorRipples", "true");
        replayForm.append("cursorSize", "0.75");
        replayForm.append("sliderSnakingIn", "false");
        replayForm.append("showHitCounter", "true");
        replayForm.append("showAimErrorMeter", "true");

        c.lib.fetch("https://apis.issou.best/ordr/renders", {
            method: "POST",
            body: replayForm,
        }).then(async (result) => {
            result = await result.json();
            video["renderID"] = result["renderID"];

            console.log(`[o!rdr] Waiting for video (${video["renderID"]}) to render..`);
            while (!video["url"]) await new Promise(p => setTimeout(p, 5000)); // Wait until it's done :)

            console.log(`[o!rdr] ${video["url"]} (${video["renderID"]}) done in ${c.lib.moment(video["done"]-start).format("mm:ss")}!`);
            resolve(video["url"]);
        });
    });
}

/**
 * Retrieve new scores that weighted >= 50% and render a video with o!rdr
 * @param {String} username osu! user id
 * @returns {Promise}
 */
function getScores(username) {
    return new Promise(async (resolve) => {
        let scores = await c.client.bancho.osuApi.user.getBest(username, undefined, 15, c.lib.nodesu.LookupType.id);
        scores = scores.filter(s => s.replayAvailable == true && c.lib.moment(Date.now()).diff(s.date, "minutes") <= 10);

        if(scores.length >= 1) {
            let user = await c.database.users.findOne({ osu_id: Number(username) });
            if(!user || user.length <= 0) return;

            scores.forEach(async (score) => {
                if(user["replays"] && Object.keys(user.replays).includes(`${score.beatmapId}`)) return;

                let cache = c.storage.user.cache[`${user.twitch_id}`];
                if(!cache) return;

                await c.database.users.updateOne({ id: Number(user.id) }, { $set: { [`replays.${score.beatmapId}`]: `Rendering` }});

                let replay = await c.lib.fetch(`${process.env.DOWNLOADURL}?userId=${score.userId}&beatmapId=${score.beatmapId}`);
                let url = await render(replay.body);

                await c.database.users.updateOne({ id: Number(user.id) }, { $set: { [`replays.${score.beatmapId}`]: `${url}` }});

                let accuracy = Math.round(100 * (score.count50*50 + score.count100*100 + score.count300*300) / (score.count50*300 + score.count100*300 + score.count300*300) * 100) / 100;
                let map = await getBeatmap(score.beatmapId);

                await c.funcs.discord.sendMessage(
                    c.funcs.discord.buildEmbed(3, {
                        title: `${map.name}`,
                        description: `mapped by ${map.creator} | ${c.lib.moment(map.stats.length*1000).format("mm:ss")} - ★ ${map.stars} - AR${map.stats.ar}`,
                        url: `https://osu.ppy.sh/scores/osu/${score.scoreId}`,
                        fields: [
                            {
                                name: "Rank",
                                value: `${score.rank == "SH" ? "S" : score.rank == "SSH" ? "S" : score.rank}`,
                                inline: true
                            },
                            {
                                name: "Performance",
                                value: `${accuracy}% - x${score.maxCombo}/${map.stats.combo} - ${Math.round(score.pp)}pp | ${parseMods(Number(score.enabledMods))}`,
                                inline: true
                            },
                            {
                                name: "Replay",
                                value: `${url}`,
                                inline: true
                            }
                        ],
                        action: `𝗡𝗘𝗪 𝗦𝗖𝗢𝗥𝗘 𝗥𝗘𝗖𝗢𝗥𝗗𝗘𝗗 » ${cache.osu.ircUsername}`,
                        footer: "new_top_score",
                        image: `https://assets.ppy.sh/beatmaps/${map.beatmapset_id}/covers/cover.jpg`
                    })
                );

                if(c.client.twitch.getChannels().includes(`#${cache.twitch}`) && !user["silenced"]) {
                    c.client.twitch.say(`#${cache.twitch}`, `New top play recorded! You can watch it here: ${url} 🤙`);
                } else {
                    c.client.bancho.getUser(cache.osu.ircUsername).sendMessage(`[REPLAY] × New top play recorded! You can watch it here: ${url} =)`);
                }
            });

            return resolve();
        }

        resolve();
    });
}
exports.getScores = getScores;

/**
 * Refresh/Request API Access
 * @returns {Promise}
 */
function OAuth2() {
    return new Promise(async (resolve) => {
        let expires = (Number(c.storage.tokens.osu["expires"])-Math.floor(Date.now() / 1000));
        if(!c.storage.tokens.osu["token"] || c.storage.tokens.osu["token"] && expires <= 1000) {
            await c.lib.fetch(`https://osu.ppy.sh/oauth/token`, {
                method: "POST",
                body: JSON.stringify({
                    client_id: process.env.OSU_CLIENT_ID,
                    client_secret: process.env.OSU_CLIENT_SECRET,
                    grant_type: "client_credentials",
                    scope: "public"
                }),
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json"
                },
                retry: 3,
                pause: 5000
            }).then(async (result) => {
                result = await result.json();
    
                c.storage.tokens.osu["token"] = result.access_token;
                c.storage.tokens.osu["expires"] = (Math.floor(Date.now() / 1000)+result.expires_in);

                resolve();
            });
        } else {
            resolve();
        }
    });
}

/**
 * Get beatmap from database and insert if it doesn't exist
 * @param {String|Number} id Beatmap ID or Name
 * @returns {Promise}
 */
function getBeatmap(map) {
    return new Promise(async (resolve, reject) => {
        let foundMap = {};
        let lookupMap = await c.database.maps.find({
            $or: [
                { beatmap_id: map },
                { beatmapset_id: map },
                { name: map }
            ]
        }).toArray();

        foundMap = lookupMap.length >= 1 ? lookupMap[0] : {};

        if(lookupMap.length > 1 && typeof map == "number") {
            for (let i = 0; i < lookupMap.length; i++) {
                if(lookupMap[i].beatmapset_id == map) {
                    foundMap = lookupMap[i];
                }
            }
        }

        if(lookupMap.length <= 0) {
            if(typeof map == "string") {
                await OAuth2();

                c.lib.fetch(`https://osu.ppy.sh/api/v2/beatmapsets/search?m=0&q=${map}&s=any`, {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${c.storage.tokens.osu["token"]}`,
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    retry: 3,
                    pause: 5000
                }).then(async (result) => {
                    result = await result.json();
    
                    let artist = map.match(/^(.*?)\s-\s(.*?)$/);
                    let version = map.match(/(?!.*\[)(?<=\[).+?(?=\])/);
                    if(!artist || !version) return reject("Invalid map string format");
    
                    let searchResults = result.beatmapsets.filter(b => b.artist == artist[1]);
                    if(!searchResults || searchResults.length <= 0) return reject("No map results found");
    
                    let set = searchResults.filter(b => b.beatmaps.filter(x => x.version == version[0]).length >= 1);
                    if(!set || set.length <= 0) return reject("No map results found");
    
                    let beatmap = set[0].beatmaps.filter(b => b.version == version[0]);
                    if(!beatmap || beatmap.length <= 0) return reject("No map results found");
    
                    let beatmapFromApi = await c.client.bancho.osuApi.beatmaps.getByBeatmapId(beatmap[0].id);
                    if(beatmapFromApi.length <= 0) 
                        return reject("No map found");

                    let pp = await c.client.calculator.calculate({
                        beatmapId: beatmapFromApi[0].id
                    }).catch(() => {
                        return reject(`Failed to calculate performance for map ${beatmap.id}`);
                    });

                    foundMap = {
                        name: `${beatmapFromApi[0].artist} - ${beatmapFromApi[0].title} [${beatmapFromApi[0].version}]`,
                        beatmap_id: beatmapFromApi[0].id,
                        beatmapset_id: beatmapFromApi[0].setId,
                        stars: Math.round(beatmapFromApi[0].difficultyRating * 100) / 100,
                        version: beatmapFromApi[0].version,
                        status: c.storage.statusEnum[beatmapFromApi[0].approved],
                        creator: beatmapFromApi[0].creator,
                        genre: beatmapFromApi[0].genre,
                        stats: {
                            length: beatmapFromApi[0].totalLength,
                            ar: beatmapFromApi[0].diffApproach,
                            od: beatmapFromApi[0].diffOverall,
                            cs: beatmapFromApi[0].diffSize,
                            hp: beatmapFromApi[0].diffDrain,
                            combo: beatmapFromApi[0].maxCombo,
                            circles: beatmapFromApi[0].countNormal,
                            sliders: beatmapFromApi[0].countSlider,
                            spinners: beatmapFromApi[0].countSpinner,
                            bpm: beatmapFromApi[0].bpm
                        },
                        pp: {
                            A: Math.round(pp.performance[0].totalPerformance),
                            S: Math.round(pp.performance[1].totalPerformance),
                            X: Math.round(pp.performance[2].totalPerformance)
                        }
                    }
                });
            } else if(Number(map)) {
                c.client.bancho.osuApi.beatmaps.getBySetId(map).then(async (m) => {
                    let beatmap = m.length >= 1 ? m[0] : null;

                    if(m.length <= 0) {
                        m = await c.client.bancho.osuApi.beatmaps.getByBeatmapId(map);
                        if(m.length <= 0) return reject("No map found");

                        beatmap = m[0];
                    }

                    let pp = await c.client.calculator.calculate({
                        beatmapId: beatmap.id
                    }).catch(() => {
                        return reject(`Failed to calculate performance for map ${beatmap.id}`);
                    });

                    foundMap = {
                        name: `${beatmap.artist} - ${beatmap.title} [${beatmap.version}]`,
                        beatmap_id: beatmap.id,
                        beatmapset_id: beatmap.setId,
                        stars: Math.round(beatmap.difficultyRating * 100) / 100,
                        version: beatmap.version,
                        status: c.storage.statusEnum[beatmap.approved],
                        creator: beatmap.creator,
                        genre: beatmap.genre,
                        stats: {
                            length: beatmap.totalLength,
                            ar: beatmap.diffApproach,
                            od: beatmap.diffOverall,
                            cs: beatmap.diffSize,
                            hp: beatmap.diffDrain,
                            combo: beatmap.maxCombo,
                            circles: beatmap.countNormal,
                            sliders: beatmap.countSlider,
                            spinners: beatmap.countSpinner,
                            bpm: beatmap.bpm
                        },
                        pp: {
                            A: Math.round(pp.performance[0].totalPerformance),
                            S: Math.round(pp.performance[1].totalPerformance),
                            X: Math.round(pp.performance[2].totalPerformance)
                        }
                    }
                });
            }

            while(!foundMap["beatmap_id"]) {
                await new Promise(p => setTimeout(p, 100));
            }

            let dbLookup = await c.database.maps.findOne({ beatmap_id: foundMap.beatmap_id });
            if(!dbLookup || dbLookup.length <= 0) {
                await c.database.maps.insertOne(foundMap);

                await c.funcs.discord.sendMessage(
                    c.funcs.discord.buildEmbed(0, {
                        title: `${foundMap.name}`,
                        description: `mapped by ${foundMap.creator} | ${c.lib.moment(foundMap.stats.length*1000).format("mm:ss")} - ★ ${foundMap.stars} - AR${foundMap.stats.ar}`,
                        url: `https://osu.ppy.sh/beatmaps/${foundMap.beatmap_id}`,
                        fields: [
                            {
                                name: "95% FC",
                                value: `${foundMap.pp.A}pp`,
                                inline: true
                            },
                            {
                                name: "99% FC",
                                value: `${foundMap.pp.S}pp`,
                                inline: true
                            },
                            {
                                name: "100% FC",
                                value: `${foundMap.pp.X}pp`,
                                inline: true
                            }
                        ],
                        action: `𝗡𝗘𝗪 𝗠𝗔𝗣 𝗔𝗗𝗗𝗘𝗗`,
                        footer: "new_map_added",
                        image: `https://assets.ppy.sh/beatmaps/${foundMap.beatmapset_id}/covers/cover.jpg`
                    })
                );
            }
        }

        resolve(foundMap);
    });
}
module.exports.getBeatmap = getBeatmap;