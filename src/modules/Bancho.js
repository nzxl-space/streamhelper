const deps = require("../constants.js");
let downloadStatus = false;

module.exports = class Bancho {
    createBancho() {
        deps.axios({
            method: "POST",
            url: "https://osu.ppy.sh/oauth/token",
            data: {
                client_id: process.env.OSU_CLIENt_ID,
                client_secret: process.env.OSU_CLIENT_SECRET,
                grant_type: "client_credentials",
                scope: "public"
            },
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json"
            }
        }).then(result => {
            deps.accessToken = result.data.access_token;
            console.log("Access Token set!");
        });

        deps.banchoClient.on("connected", () => {
            console.log("Bancho connected!");
        });

        deps.banchoClient.on("PM", data => {
            if(!data.message.startsWith("!")) return;
            let args = data.message.replace("!", "").split(" ");
            let command = args.splice(0, 1);

            if(command == "verify") {
                if(args.length <= 0) return;
                console.log(`New verify request from >${data.user.ircUsername}<`);

                deps.database.all(`SELECT FROM users WHERE username = \"${data.user.ircUsername}\" AND secret = \"${args[0]}\"`, (err, rows) => {
                    if(err || rows.length == 0 || rows.length >= 1 & rows[0].verified == 1) {
                        return console.log(`Verification for user >${data.user.ircUsername}< failed!`);
                    }

                    deps.database.run(`UPDATE users SET verified = \"1\" WHERE username = \"${data.user.ircUsername}\" and secret = \"${args[0]}\"`, err => {
                        if(err) return console.log(`Verification for user >${data.user.ircUsername}< failed!`);

                        console.log(`Verification for user >${data.user.ircUsername}< success!`);

                        if(deps.sockets[args[0]]) {
                            deps.sockets[args[0]].emit("VERIFIED", {
                                success: true,
                                error: "Successfully verified identity"
                            });
                        }
                    });

                });

                return;
            }
        });

        deps.banchoClient.connect();
    }

    spectate() {
        return new Promise(resolve => {

        });
    }

    download(beatmapId) {
        return new Promise(async resolve => {
            while(downloadStatus) await new Promise(p => setTimeout(p, 50));
            let mapPath = deps.path.join("maps", `${beatmapId}.osu`);
            if(!deps.fs.existsSync(mapPath) && !downloadStatus) {
                downloadStatus = true;
                deps.https.get(`https://osu.ppy.sh/osu/${beatmapId}`, diffFile => {
                    let mapFile = deps.fs.createWriteStream(mapPath);
                    diffFile.pipe(mapFile);
                    mapFile.on("finish", () => {
                        downloadStatus = false;
                        mapFile.close();
                        resolve(true);
                    });
                });
            } else resolve(true);
        });
    }

    calculate(beatmapId, beatmapMods, scoreStats) {
        return new Promise(async resolve => {
            await this.download(beatmapId);

            let pp = deps.pp.calculate({
                path: deps.path.join("maps", `${beatmapId}.osu`),
                mods: await this.parseMods(beatmapMods),
                acc: scoreStats ? scoreStats.accuracy : 100,
                combo: scoreStats ? scoreStats.combo : null
            });

            resolve({
                stars: pp[0].stars,
                ar: Math.round(pp[0].ar * 100) / 100,
                cs: Math.round(pp[0].cs * 100) / 100,
                hp: Math.round(pp[0].hp * 100) / 100,
                od: Math.round(pp[0].od * 100) / 100,
                bpm: Math.round(pp[0].bpm),
                pp: Math.round(pp[0].pp),
                mods: beatmapMods ? "+"+beatmapMods : "+NM"
            });
        });
    }

    parseMods(string) {
        return new Promise(resolve => {
            let bit = 0;

            if(string) {
                if(string.match(/NF/)) bit += 1;
                if(string.match(/EZ/)) bit += 2;
                if(string.match(/HD/)) bit += 8;
                if(string.match(/HR/)) bit += 16;
                if(string.match(/SD/)) bit += 32;
                else if(string.match(/PF/)) bit += 16384;
                if(string.match(/NC/)) bit += 512;
                else if(string.match(/DT/)) bit += 64;
                if(string.match(/RX/)) bit += 128;
                if(string.match(/HT/)) bit += 256;
                if(string.match(/FL/)) bit += 1024;
                if(string.match(/SO/)) bit += 4096;
            }

            resolve(bit);
        });
    }
}