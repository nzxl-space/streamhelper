const c = require("../constants");

function connect() {
    return new Promise((resolve, reject) => {
        c.client.bancho.on("PM", async (pm) => {
            if(pm.self) return;

            let username = pm.user.ircUsername;
            let message = pm.message;
            
            let cache = (() => {
                for (var k in c.storage.user.cache) {
                    let cache = c.storage.user.cache[k];
                    if(cache.osu.ircUsername == username) return cache;
                }
            })();
            if(typeof cache == "undefined") return;

            let action = pm.getAction();
            if(typeof action != "undefined") {
                let beatmapId = action.match(c.storage.patterns.beatmap_id);
                if(beatmapId) {
                    let map = await getBeatmap(Number(beatmapId[0]));
                    await pm.user.sendMessage(`[PP] × [https://osu.ppy.sh/b/${map.beatmap_id} ${map.name}] | 95%: ${map.pp.A}pp - 99%: ${map.pp.S}pp - 100%: ${map.pp.X}pp | (★ ${map.stars}, AR ${map.stats.ar}, BPM ${map.stats.bpm} - ${c.lib.moment(map.stats.length*1000).format("mm:ss")})`);
    
                    c.storage.user.banchoNP[`${username}`] = map;
    
                    return;
                }
            }

            if(!message.startsWith("!")) return;
            let [command, ...args] = message.slice(1).trim().split(" ");

            switch (command.toLowerCase()) {
                case "with":
                case "w": {
                    let map = c.storage.user.banchoNP[`${username}`];
                    if(typeof map != "undefined") {
                        if(args.length <= 0) {
                            return await pm.user.sendMessage(`[PP] × No mods specified - Example: !w +HDDT`);
                        }

                        let mods = args[0].match(c.storage.patterns.beatmap_mods);
                        if(!mods || mods.length <= 0) {
                            return await pm.user.sendMessage(`[PP] × Invalid mods specified - Example: !w +HDDT`);
                        }

                        let pp = await c.client.calculator.calculate({
                            beatmapId: map.beatmap_id,
                            mods: mods.toString().toUpperCase()
                        });
        
                        let newValues = {
                            A: Math.round(pp.performance[0].totalPerformance),
                            S: Math.round(pp.performance[1].totalPerformance),
                            X: Math.round(pp.performance[2].totalPerformance),
                            Stars: Math.round(pp.difficulty.starRating * 100) / 100,
                            AR: Math.round(pp.difficulty.approachRate * 100) / 100,
                            BPM: Math.round(pp.beatmapInfo.bpmMode * 100) / 100,
                            Length: pp.beatmapInfo.length
                        }
        
                        await pm.user.sendMessage(`[PP] × [https://osu.ppy.sh/b/${map.beatmap_id} ${map.name}] +${mods.toString().toUpperCase()} | 95%: ${newValues.A}pp - 99%: ${newValues.S}pp - 100%: ${newValues.X}pp | (★ ${newValues.Stars}, AR ${newValues.AR}, BPM ${newValues.BPM} - ${c.lib.moment(newValues.Length*1000).format("mm:ss")})`);
                    }
                    break;
                }
                case "recommend":
                case "r": {
                    let mods = "";
                    if(args.length >= 1) {
                        let match = args[0].match(c.storage.patterns.beatmap_mods);
                        if(match) {
                            mods = match.toString().toUpperCase();
                        }
                    }

                    let re = await recommend(cache.osu.ircUsername, 1, mods);
                    await pm.user.sendMessage(re[0]);

                    break;
                }
            }


        });

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

        let replayForm = new c.lib.FormData();
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

            let cache = c.storage.user.cache[`${user.twitch_id}`];
            if(!cache) return;

            for(let i = 0; i < scores.length; i++) {
                let score = scores[i];
                if(typeof user["replays"] == "object" && Object.keys(user.replays).includes(`${score.scoreId}`)) return;

                await c.database.users.updateOne({ osu_id: user.osu_id }, { $set: { [`replays.${score.scoreId}`]: `Rendering` }});

                let replay = await c.lib.fetch(`${process.env.DOWNLOADURL}?userId=${score.userId}&beatmapId=${score.beatmapId}`);
                let url = await render(replay.body);

                await c.database.users.updateOne({ osu_id: user.osu_id }, { $set: { [`replays.${score.scoreId}`]: `${url}` }});

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
                    c.client.bancho.getUser(cache.osu.ircUsername).sendMessage(`[REPLAY] × New top play recorded! You can watch it here: ${url} ಠಠ`);
                }
            }
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
        let running = true;
        let foundMap = {};
        let lookupMap = await c.database.maps.find({
            $or: [
                { beatmap_id: map },
                { beatmapset_id: map },
                { name: String(map).trim() } // Might be good to split the string into artist, title and version to search for similar songs if not found
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

                c.lib.fetch(`https://osu.ppy.sh/api/v2/beatmapsets/search?nsfw=true&m=0&q=${encodeURIComponent(map.trim())}&s=any`, {
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
                    if(!artist || !version) {
                        running = false;
                        return reject(`Invalid map string format (${map})`);
                    }

                    let searchResults = result.beatmapsets.filter(b => b.artist.toLowerCase() == artist[1].toLowerCase());
                    if(!searchResults || searchResults.length <= 0) {
                        running = false;
                        return reject(`No map results found (${map})`);
                    }
    
                    let set = searchResults.filter(b => b.beatmaps.filter(x => x.version.toLowerCase() == version[0].toLowerCase()).length >= 1);
                    if(!set || set.length <= 0) {
                        running = false;
                        return reject(`No map results found (${map})`);
                    }
    
                    let beatmap = set[0].beatmaps.filter(b => b.version.toLowerCase() == version[0].toLowerCase());
                    if(!beatmap || beatmap.length <= 0) {
                        running = false;
                        return reject(`No map results found (${map})`);
                    }
    
                    let beatmapFromApi = await c.client.bancho.osuApi.beatmaps.getByBeatmapId(beatmap[0].id);
                    if(beatmapFromApi.length <= 0) {
                        running = false;
                        return reject(`No map results found (${map})`);
                    }

                    let pp = await c.client.calculator.calculate({
                        beatmapId: beatmapFromApi[0].id
                    }).catch(() => {
                        running = false;
                        return reject(`Failed to calculate performance for map ${beatmapFromApi[0].id}`);
                    });

                    if(!pp["performance"] || pp["performance"].length <= 0) {
                        return reject(`No valid performance values found for ${beatmapFromApi[0].id}`);
                    }

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
                }).catch(console.log);
            } else if(Number(map)) {
                c.client.bancho.osuApi.beatmaps.getBySetId(map).then(async (m) => {
                    let beatmap = m.length >= 1 ? m[0] : null;

                    if(m.length <= 0) {
                        m = await c.client.bancho.osuApi.beatmaps.getByBeatmapId(map);
                        if(m.length <= 0) {
                            running = false;
                            return reject("No map found");
                        }

                        beatmap = m[0];
                    }

                    let pp = await c.client.calculator.calculate({
                        beatmapId: beatmap.id
                    }).catch(() => {
                        running = false;
                        return reject(`Failed to calculate performance for map ${beatmap.id}`);
                    });

                    if(!pp["performance"] || pp["performance"].length <= 0) {
                        return reject(`No valid performance values found for ${beatmap.id}`);
                    }

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

            while(!foundMap["beatmap_id"] && running) {
                await new Promise(p => setTimeout(p, 25));
            }

            if(!foundMap["beatmap_id"]) return reject("No map found");

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

        await c.funcs.log("SYSTEM", "get+beatmap", 
            {
                type: "get+beatmap",
                beatmap_id: foundMap.beatmap_id,
                beatmapset_id: foundMap.beatmapset_id,
                name: foundMap.name,
                timestamp: c.lib.moment(Date.now()).toISOString()
            }
        );

        resolve(foundMap);
    });
}
module.exports.getBeatmap = getBeatmap;

/**
 * Simple function to shuffle an array - https://stackoverflow.com/a/2450976
 * @param {Array} array 
 * @returns {Array}
 */
function shuffle(array) {
    let currentIndex = array.length,  randomIndex;

    // While there remain elements to shuffle.
    while (currentIndex != 0) {

    // Pick a remaining element.
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [
        array[randomIndex], array[currentIndex]];
    }

    return array;
}
module.exports.shuffle = shuffle;

/**
 * Simple recommendations (i like the word simple)
 * @param {String} username - osu! username
 * @param {Number|null} howMany - how many recommendations to give
 * @param {String|null} mod - DT or HR
 * @returns 
 */
function recommend(username, howMany = 1, mod = null) {
    return new Promise(async (resolve, reject) => {
        if(!username)
            return reject("No username defined");

        let user = await c.database.r.findOne({ user: username });
        if(!user || user.length <= 0) {
            user = {
                user: username,
                stats: {
                    bpm: [],
                    stars: [],
                    length: [],
                    genre: [],
                    pp: [],
                    accuracy: []
                },
                r: []
            };
    
            let top_scores = await c.client.bancho.osuApi.user.getBest(username, 0, 100);
            for (let i = 0; i < top_scores.length; i++) {
                let score = top_scores[i];
    
                let map = await c.database.maps.findOne({ beatmap_id: score.beatmapId });
                if(map == null) continue;
    
                let accuracy = Math.round(100 * (score.count50*50 + score.count100*100 + score.count300*300) / (score.count50*300 + score.count100*300 + score.count300*300) * 100) / 100;
    
                user["stats"].pp.push(Math.round(score.pp));
                user["stats"].genre.push(Number(map.genre) ? map.genre : 0);
                user["stats"].bpm.push(map.stats.bpm);
                user["stats"].stars.push(map.stars);
                user["stats"].length.push(map.stats.length);
                user["stats"].accuracy.push(accuracy);
            }
    
            user["stats"].pp = c.lib.median(user["stats"].pp);
            user["stats"].accuracy = Math.floor(user["stats"].accuracy.reduce((a, b) => a + b, 0) / user["stats"].accuracy.length * 100) / 100;
    
            user["stats"].bpm = Math.round(user["stats"].bpm.reduce((a, b) => a + b, 0) / user["stats"].bpm.length);
            user["stats"].length = Math.round(user["stats"].length.reduce((a, b) => a + b, 0) / user["stats"].length.length);
    
            user["stats"].stars = Math.round(user["stats"].stars.reduce((a, b) => a + b, 0) / user["stats"].stars.length);
            if(user["stats"].pp < 250 && user["stats"].stars >= 6) {
                user["stats"].stars -= 1;
            }
            if(user["stats"].pp >= 549 && user["stats"].stars <= 6) {
                user["stats"].stars += 1;
            }
    
            user["stats"].genre = user["stats"].genre.sort((a, b) => user["stats"].genre.filter(v => v === a).length - user["stats"].genre.filter(v => v === b).length).pop();
    
            await c.database.r.insertOne(user);
        }

        let lookup = [];

        lookup.push({ 
            $or: [ 
                { status: "ranked" },
                { status: "loved" },
                { status: "qualified" }
            ]
        });
    
        lookup.push({ "stats.length": { $lt: Math.round(user["stats"].length / 10) * 10 }});
        lookup.push({ "stats.bpm": { $lt: Math.round(user["stats"].bpm / 10) * 10 }});
        
        if(user["stats"].genre == 3 || user["stats"].genre == 5 || user["stats"].genre == 2 || user["stats"].genre == 10) {  // Anime
            lookup.push({ 
                $or: [
                    { "genre": 3 },
                    { "genre": 5 },
                    { "genre": 2 },
                    { "genre": 10 }
                ]
            });
        } else if(user["stats"].genre == 11 || user["stats"].genre == 3 || user["stats"].genre == 4) {  // Metal
            lookup.push({ 
                $or: [
                    { "genre": 11 },
                    { "genre": 3 },
                    { "genre": 4 },
                    { "genre": 2 }
                ]
            });
        } else {
            lookup.push({ 
                $or: [
                    { "genre": 2 },
                    { "genre": 3 },
                    { "genre": 4 },
                    { "genre": 5 },
                    { "genre": 9 },
                    { "genre": 10 },
                    { "genre": 11 },
                    { "genre": 14 },
                ]
            });
        }

        if(mod.match(/HR/i)) {
            lookup.push({ "stars": { $gt: (user["stats"].stars - .5) } });
            lookup.push({ "stars": { $lt: (user["stats"].stars + 1) } });
    
            if(user["stats"].accuracy % 100 < 97) {
                lookup.push({ "pp.X": { $gt: Math.round(user["stats"].pp*0.9) }})
                lookup.push({ "pp.X": { $lt: Math.round(user["stats"].pp*1.1) }})
            } else if(user["stats"].accuracy % 100 > 97) {
                lookup.push({ "pp.X": { $gt: Math.round(user["stats"].pp*0.9) }})
                lookup.push({ "pp.X": { $lt: Math.round(user["stats"].pp*1.4) }})
            }
        } else if(mod.match(/DT/i)) {
            lookup.push({ "stars": { $gt: (user["stats"].stars - 2) } });
            lookup.push({ "stars": { $lt: (user["stats"].stars + .5) } });
    
            if(user["stats"].accuracy % 100 < 97) {
                lookup.push({ "pp.A": { $lt: Math.round(user["stats"].pp/2.5) }})
            } else if(user["stats"].accuracy % 100 > 97) {
                lookup.push({ "pp.X": { $lt: Math.round(user["stats"].pp/2) }})
            }
        } else {
            lookup.push({ "stars": { $gt: (user["stats"].stars) } });
    
            if(user["stats"].pp <= 549) {
                lookup.push({ "stars": { $lt: (user["stats"].stars + 1.5) } });
            } else if(user["stats"].pp >= 550) {
                lookup.push({ "stars": { $lt: (user["stats"].stars + 2) } });
            }
    
            if(user["stats"].accuracy % 100 < 97) {
                lookup.push({ "pp.A": { $lt: Math.round(user["stats"].pp*0.9) }})
                lookup.push({ "pp.A": { $lt: Math.round(user["stats"].pp*1.1) }})
            } else if(user["stats"].accuracy % 100 > 97) {
                lookup.push({ "pp.X": { $gt: Math.round(user["stats"].pp*0.9) }})
                lookup.push({ "pp.X": { $lt: Math.round(user["stats"].pp*1.4) }})
            }
        }

        let results = shuffle(await c.database.maps.find({ $and: lookup }).toArray()); // shuffle results
        results = results.filter(x => user["r"].includes(x.beatmap_id) == false);

        if(results.length <= 0) {
            await c.database.r.updateOne({ user: username }, { $set: { r: [] } }); // reset list
            results = shuffle(await c.database.maps.find({ $and: lookup }).toArray()); // shuffle results
        }

        results = results.splice(0, howMany); // how many requests uwu

        let found = [];
        for(let i = 0; i < results.length; i++) {
            let map = results[i];
    
            if(mod.match(/HR|DT/i)) {
                let a = await c.client.calculator.calculate({
                    beatmapId: map.beatmap_id,
                    mods: mod.toUpperCase()
                });
    
                map.pp.S = a.performance[1].totalPerformance;
                map.pp.X = a.performance[2].totalPerformance;
                map.stars = Math.round(a.difficulty.starRating * 100) / 100;
                map.stats.ar = Math.round(a.beatmapInfo.approachRate * 100) / 100;
                map.stats.bpm = Math.round(a.beatmapInfo.bpmMode * 100) / 100;
                map.stats.length = a.beatmapInfo.length;
            } 
    
            let recommend = {
                id: map.beatmap_id,
                name: `[https://osu.ppy.sh/b/${map.beatmap_id} ${map.name}]`,
                mapper: map.creator,
                pp: `~${Math.floor(map.pp.S*1.05)}pp`,
                status: `${map.status[0].toUpperCase()}${map.status.slice(1)}`,
                stats: `★ ${map.stars}, AR ${map.stats.ar}, BPM ${map.stats.bpm} - ${c.lib.moment(map.stats.length*1000).format("mm:ss")}`,
                mods: mod.match(/HR|DT/i) ? `+${mod.toUpperCase()} ` : ""
            }
    
            await c.database.r.updateOne({ user: username }, { $push: { r: map.beatmap_id } });
            found.push(`[${recommend.status}] × ${recommend.name} ${recommend.mods}| (${recommend.stats}) | ${recommend.pp}`);
        }

        resolve(found);
    });
}
module.exports.recommend = recommend;