const Banchojs = require("bancho.js");
const fetch = require("node-fetch-retry");
const moment = require("moment");
const io = require("socket.io-client");
const FormData = require("form-data");
const { BeatmapCalculator } = require("@kionell/osu-pp-calculator");
const pp = new BeatmapCalculator();

module.exports = class Bancho {
    constructor(ircUsername, ircPassword, apiKey, clientId, clientSecret, ordrKey, downloadURL) {
        this.ircUsername = ircUsername;
        this.ircPassword = ircPassword;
        this.apiKey = apiKey;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.ordrKey = ordrKey;
        this.downloadURL = downloadURL;

        this.accessToken = {};

        // export vars
        this.banchoClient = null;
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.banchoClient = new Banchojs.BanchoClient(
                {
                    username: this.ircUsername,
                    password: this.ircPassword,
                    apiKey: this.apiKey
                }
            );

            this.banchoClient.on("connected", () => resolve());
            this.banchoClient.connect().catch(() => reject());
        });
    }

    /**
     * Lookup a beatmap by name on the osu! API
     * @param {String} beatmapName Usada Pekora - Discommunication Alien [glazee's insane peko.]
     * @param {Number} mode 0 = osu!std | 1 = osu!taiko | 2 = osu!catch | 3 = osu!mania
     * @returns {Promise}
     */
    lookupBeatmap(beatmapName, mode = 0) {
        return new Promise(async (resolve) => {
            if(!beatmapName) return;

            let expires = (Number(this.accessToken["expires"])-Math.floor(Date.now() / 1000));
            if(!this.accessToken["token"] || this.accessToken["token"] && expires <= 1000) {
                await fetch(`https://osu.ppy.sh/oauth/token`, {
                    method: "POST",
                    body: JSON.stringify({
                        client_id: this.clientId,
                        client_secret: this.clientSecret,
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

                    this.accessToken["token"] = result.access_token;
                    this.accessToken["expires"] = (Math.floor(Date.now() / 1000)+result.expires_in);
                });
            }

            fetch(`https://osu.ppy.sh/api/v2/beatmapsets/search?m=${mode}&q=${beatmapName}&s=any`, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${this.accessToken["token"]}`,
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                retry: 3,
                pause: 5000
            }).then(async (result) => {
                result = await result.json();

                let artist = beatmapName.match(/^(.*?)\s-\s(.*?)$/);
                let version = beatmapName.match(/(?!.*\[)(?<=\[).+?(?=\])/);
                if(!artist || !version) return;

                let searchResults = result.beatmapsets.filter(b => b.artist == artist[1]);
                if(!searchResults || searchResults.length <= 0) return;

                let beatmapSet = searchResults.filter(b => b.beatmaps.filter(x => x.version == version[0]).length >= 1);
                if(!beatmapSet || beatmapSet.length <= 0) return;

                let beatmap = beatmapSet[0].beatmaps.filter(b => b.version == version[0]);
                if(!beatmap || beatmap.length <= 0) return;

                let apiv1 = await this.banchoClient.osuApi.beatmaps.getByBeatmapId(beatmap[0].id);
                if(apiv1) beatmap[0].genre = apiv1[0].genre;

                beatmap[0].creator = beatmapSet[0].creator;
                resolve(beatmap[0]);
            });
        });
    }

    /**
     * Insert a beatmap into the mapData database
     * @param {String} beatmapName Usada Pekora - Discommunication Alien [glazee's insane peko.]
     * @param {Number} mode 0 = osu!std | 1 = osu!taiko | 2 = osu!catch | 3 = osu!mania
     * @returns {Promise}
     */
    addBeatmap(beatmapName, mode = 0) {
        return new Promise(async (resolve) => {
            const { mongoDB, discord } = require("../app");

            if(!beatmapName) return;

            let map = {};
            map.name = beatmapName;

            map.mapData = await this.lookupBeatmap(beatmapName, mode);
            if(typeof map.mapData !== "object") return;

            let lookupDatabase = await mongoDB.mapData.findOne({ "mapData.id": map.mapData.id });
            if(lookupDatabase) return resolve(lookupDatabase);

            map.score = await pp.calculate({ beatmapId: map.mapData.id }).catch(err => console.log(`Failed to calculate performance for map ${map.mapData.id} ${err}`));

            let insertMap = {
                name: map.name,
                setId: map.mapData.beatmapset_id,
                mapData: map.mapData,
                ppData: {
                    A: Math.round(map.score.performance[0].totalPerformance),
                    S: Math.round(map.score.performance[1].totalPerformance),
                    X: Math.round(map.score.performance[2].totalPerformance)
                }
            };

            await mongoDB.mapData.insertOne(insertMap);

            await discord.sendMessage(
                discord.buildEmbed(0, {
                    title: `${map.name}`,
                    description: `mapped by ${map.mapData.creator} | ${moment(map.mapData.total_length*1000).format("mm:ss")} - ★ ${Math.round(map.mapData.difficulty_rating * 100) / 100} - AR${map.mapData.ar}`,
                    url: `https://osu.ppy.sh/beatmaps/${map.mapData.id}`,
                    fields: [
                        {
                            name: "95% FC",
                            value: `${Math.round(map.score.performance[0].totalPerformance)}pp`,
                            inline: true
                        },
                        {
                            name: "99% FC",
                            value: `${Math.round(map.score.performance[1].totalPerformance)}pp`,
                            inline: true
                        },
                        {
                            name: "100% FC",
                            value: `${Math.round(map.score.performance[2].totalPerformance)}pp`,
                            inline: true
                        }
                    ],
                    action: `𝗡𝗘𝗪 𝗠𝗔𝗣 𝗔𝗗𝗗𝗘𝗗`,
                    footer: "new_map_added",
                    image: `https://assets.ppy.sh/beatmaps/${map.mapData.beatmapset_id}/covers/cover.jpg`
                })
            );

            resolve(insertMap);
        });
    }

    /**
     * Get beatmap from database and insert if it doesn't exist
     * @param {String|Number} id Beatmap ID or Name
     * @returns {Promise}
     */
    getBeatmap(id) {
        return new Promise(async (resolve) => {
            const { mongoDB } = require("../app");

            let map = await mongoDB.mapData.findOne({ 
                $or: [{ mapData: { $elemMatch: { id: id } }}, { mapData: { $elemMatch: { beatmapset_id: id } }}, { name: id }]
            });
            
            if(!map) {
                let beatmap = await this.banchoClient.osuApi.beatmaps.getByBeatmapId(id);
                if(beatmap.length <= 0) beatmap = await this.banchoClient.osuApi.beatmaps.getBySetId(id);

                map = await this.addBeatmap(beatmap.length >= 1 ? `${beatmap[0].artist} - ${beatmap[0].title} [${beatmap[0].version}]` : id, 0);
            }

            resolve(map);
        });
    }

    /**
     * Render a replay video through o!rdr API (s/o to my homie MasterIO)
     * @param {Buffer|ReadableStream} replay File Buffer of a Replay File
     * @returns {Promise}
     */
    render(replay) {
        return new Promise(async (resolve) => {
            if(!replay) return;

            let start = Date.now();

            let video = { renderID: 0, done: 0, url: null };
            let ordrClient = await io.connect("https://ordr-ws.issou.best");
            ordrClient.on("connect", () => console.log("[o!rdr] Ready!"));
            ordrClient.on("disconnect", () => console.log("[o!rdr] See you next time!"));
            ordrClient.on("render_done_json", (result) => {
                if(result["renderID"] == video["renderID"]) {

                    video["done"] = Date.now();
                    video["url"] = result["videoUrl"];

                    ordrClient.disconnect();
                }
            });

            let replayForm = new FormData();
            replayForm.append("replayFile", replay, { filename: "replay.osr", contentType: "application/octet-stream" });
            replayForm.append("username", "streamhelper");
            replayForm.append("resolution", "1280x720");
            replayForm.append("verificationKey", this.ordrKey);
    
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

            fetch("https://apis.issou.best/ordr/renders", {
                method: "POST",
                body: replayForm,
            }).then(async (result) => {
                result = await result.json();
                video["renderID"] = result["renderID"];
    
                console.log(`[o!rdr] Waiting for video (${video["renderID"]}) to render..`);
                while (!video["url"]) await new Promise(p => setTimeout(p, 5000)); // Wait until it's done :)
    
                console.log(`[o!rdr] ${video["url"]} (${video["renderID"]}) done in ${moment(video["done"]-start).format("mm:ss")}!`);
                resolve(video["url"]);
            });
        });
    }

    /**
     * Retrieve new scores that weighted >= 50% and render a video with o!rdr
     * @param {String} username osu! username
     * @returns {Promise}
     */
    getScores(username) {
        return new Promise(async (resolve) => {
            const { mongoDB, discord, twitch } = require("../app");

            let scores = await this.banchoClient.osuApi.user.getBest(username, undefined, 15);
            scores = scores.filter(s => s.replayAvailable == true && moment(Date.now()).diff(s.date, "minutes") <= 10);

            if(scores.length >= 1) {
                let user = await mongoDB.users.findOne({ osu: username });
                if(!user || user.length <= 0) return;

                scores.forEach(async (score) => {
                    if(user["replays"] && Object.keys(user.replays).includes(`${score.beatmapId}`)) return;

                    await mongoDB.users.updateOne({ userId: user.userId }, { $set: { [`replays.${score.beatmapId}`]: `Rendering` }});

                    let replay = await fetch(`${this.downloadURL}?userId=${score.userId}&beatmapId=${score.beatmapId}`);
                    let url = await this.render(replay.body);

                    await mongoDB.users.updateOne({ userId: user.userId }, { $set: { [`replays.${score.beatmapId}`]: `${url}` }});

                    if(!user["silenced"]) {
                        if(twitch.twitchClient.getChannels().includes(`#${user.twitch}`))
                            twitch.twitchClient.say(`#${user.twitch}`, `/me ‼️ New top play recorded! You can watch it here: ${url} 🤙`);
                    }

                    let accuracy = Math.round(100 * (score.count50*50 + score.count100*100 + score.count300*300) / (score.count50*300 + score.count100*300 + score.count300*300) * 100) / 100;
                    let map = await this.getBeatmap(score.beatmapId);

                    await discord.sendMessage(
                        discord.buildEmbed(3, {
                            title: `${map.name}`,
                            description: `mapped by ${map.mapData.creator} | ${moment(map.mapData.total_length*1000).format("mm:ss")} - ★ ${Math.round(map.mapData.difficulty_rating * 100) / 100} - AR${map.mapData.ar}`,
                            url: `https://osu.ppy.sh/scores/osu/${score.scoreId}`,
                            fields: [
                                {
                                    name: "Rank",
                                    value: `${score.rank == "SH" ? "S" : score.rank == "SSH" ? "S" : score.rank}`,
                                    inline: true
                                },
                                {
                                    name: "Performance",
                                    value: `${accuracy}% - x${score.maxCombo}/${map.mapData.max_combo} - ${Math.round(score.pp)}pp | ${this.parseMods(Number(score.enabledMods))}`,
                                    inline: true
                                },
                                {
                                    name: "Replay",
                                    value: `${url}`,
                                    inline: true
                                }
                            ],
                            action: `𝗡𝗘𝗪 𝗦𝗖𝗢𝗥𝗘 𝗥𝗘𝗖𝗢𝗥𝗗𝗘𝗗 » ${user.osu}`,
                            footer: "new_top_score",
                            image: `https://assets.ppy.sh/beatmaps/${map.mapData.beatmapset_id}/covers/cover.jpg`
                        })
                    );
                });

                return resolve();
            }

            resolve();
        });
    }

    /**
     * Parse bit value to a readable string
     * @param {Number} num 72
     * @returns {String} +HDDT
     */
    parseMods(num) {
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
}