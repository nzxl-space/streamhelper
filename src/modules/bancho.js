const Banchojs = require("bancho.js");
const fetch = require("node-fetch-retry");
const moment = require("moment");
const io = require("socket.io-client");
const FormData = require("form-data");

module.exports = class Bancho {
    constructor(ircUsername, ircPassword, apiKey, clientId, clientSecret, ordrKey) {
        this.ircUsername = ircUsername;
        this.ircPassword = ircPassword;
        this.apiKey = apiKey;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.ordrKey = ordrKey;

        this.accessToken = {};

        this.createInstance()
        .then(() => console.log("Bancho connected!"))
        .catch(() => console.log("Bancho failed!"));
    }

    createInstance() {
        return new Promise((resolve, reject) => {
            const banchoClient = exports.banchoClient = new Banchojs.BanchoClient(
                {
                    username: this.ircUsername,
                    password: this.ircPassword,
                    apiKey: this.apiKey
                }
            );

            banchoClient.on("connected", () => resolve());
            banchoClient.connect().catch(() => reject());
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
                if(!searchResults) return;

                let beatmapSet = searchResults.filter(b => b.beatmaps.filter(x => x.version == version[0]).length >= 1);
                if(!beatmapSet) return;

                let beatmap = beatmapSet[0].beatmaps.filter(b => b.version == version[0]);
                if(!beatmap) return;

                beatmap[0].creator = beatmapSet[0].creator;
                resolve(beatmap[0]);
            });
        });
    }

    /**
     * Render a replay video through o!rdr API (s/o to my homie MasterIO)
     * @param {Buffer|ReadableStream} replay File Buffer of a Replay File
     * @returns {Promise}
     */
    render(replay) {
        return new Promise(async (resolve) => {
            if(!Buffer.isBuffer(replay)) return;

            let video = { renderID: 0, done: 0, url: null };
            let ordrClient = await io.connect("https://ordr-ws.issou.best");
            ordrClient.on("connect", () => console.log("[o!rdr] Ready!"));
            ordrClient.on("disconnect", () => console.log("[o!rdr] See you next time!"));
            ordrClient.on("render_done_json", (result) => {
                if(result["renderID"] == video["renderID"]) {
                    video["done"] = Date.now();
                    video["url"] = result["videoUrl"];
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

                let time = Date.now();
                video["renderID"] = result["renderID"];
    
                console.log(`[o!rdr] Waiting for video (${video["renderID"]}) to render..`);
                while (!video["url"]) {
                    await new Promise(p => setTimeout(p, 5000));
                }
    
                console.log(`[o!rdr] ${video["url"]} (${video["renderID"]}) done in ${moment(video["done"]-time).format("mm:ss")}!`);

                ordrClient.disconnect();
                resolve(video["url"]);
            });
        });
    }
}