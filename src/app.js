require('dotenv').config();
const deps = require("./constants.js");
require("log-prefix")(() => { return `[${deps.moment(Date.now()).format("HH:mm:ss")} | kiyomii's service]`; });

(() => {
    // Create db file if not exists
    if(!deps.fs.existsSync("./storage.db")) {
        deps.fs.writeFileSync("./storage.db", null);
    }

    // Create maps folder if not exists
    if(!deps.fs.existsSync("./maps/")) {
        deps.fs.mkdirSync("./maps/");
    }

    // Load modules
    deps.fs.readdir(deps.path.join(__dirname, "modules"), (err, files) => {
        if(err) return console.log("No modules found");

        const module = {};

        files.forEach((file, i) => {
            moduleName = files[i].replace(/.js/, "");
            files[i] = require(deps.path.join(__dirname, "modules", file));
            module[`${moduleName}`] = new files[i];
        });

        
        module["WebSocket"].createServer();
        module["Bancho"].createBancho();
    });

    return;

    discord.on("ready", () => {
        console.log("[info] Discord connected");

        discord.on("messageCreate", async message => {
            if(message.author.bot || !message.content.startsWith("#") || message.author.id != "710490901482307626") return;
            args = message.content.replace("#", "").split(" ");

            if(args[0] == "add") {
                if(args.length < 4) return;

                db.run(`INSERT INTO \"users\" (\"username\", \"twitch\", \"discord\") VALUES (\"${args[1].toLowerCase()}\", \"${args[2].toLowerCase()}\", \"${Number(args[3])}\")`);
                message.channel.send("Added!");

                return;
            }

            if(args[0] == "list") {
                db.all(`SELECT username FROM users`, (err, rows) => {
                    if(err || rows.length <= 0) return;

                    users = [];
                    rows.filter(x => users.push(x.username));

                    message.channel.send(`List: ${users.join(", ")}`);
                });
                return;
            }

            if(args[0] == "remove") {
                if(args.length < 2) return;

                db.run(`DELETE FROM \"users\" WHERE username = \"${args[1].toLowerCase()}\"`);
                message.channel.send("Removed!");

                return;
            }

            if(args[0] == "calculate") {
                if(args.length < 4) return;
                return;
            }
        });
    });

    twitch.on("connected", () => {
        console.log("[info] Twitch connected");
        twitch.on("message", (channel, tags, message, self) => {
            message = message.split(" ");

            db.all(`SELECT username, secret FROM users WHERE twitch = \"${channel.replace(/\#/, "").toLowerCase()}\"`, (err, rows) => {
                if(err || rows.length <= 0) return;
                if(message[0] == "!np" || message[0] == "!nppp" || message[0] == "!pp") {
                    if(currentlyPlaying.get(`${rows[0].secret}`)) {
                        twitch.say(channel, currentlyPlaying.get(`${rows[0].secret}`));
                    }
                    return;
                }

                let beatmapId, setId, mods, beatmapCalc;
                beatmapLink = /^(https:\/\/osu\.ppy\.sh\/beatmapsets\/)|([0-9]+)|\#osu^\/|([0-9]+)/g;
                beatmapMods = /^\+|(EZ)|(NF)|(HT)|(SD)|(HD)|(HR)|(DT)|(FL)|(RX)|(SO)/;

                message.forEach(msg => {
                    if(msg.match(beatmapLink) && msg.match(beatmapLink)[0] == "https://osu.ppy.sh/beatmapsets/") {
                        beatmapId = msg.match(beatmapLink)[1], setId = msg.match(beatmapLink)[2];
                    } else if(msg.match(beatmapMods)) {
                        mods = msg.replace(/^\+/, "").toUpperCase();
                    }
                });

                if(beatmapId) {
                    bancho.osuApi.beatmaps.getBySetId(beatmapId).then(async (x) => {
                        if(x.length <= 0) return;
    
                        for(s in x) {
                            if(x[s].id == setId) {
                                beatmapCalc = x[s];
                            }
                        }
    
                        if(!beatmapCalc) beatmapCalc = x[0];

                        if(beatmapCache.get(beatmapCalc.id) && ppCache.get(`${beatmapCalc.id}-${mods ? parseMods(mods) : 0}`)) {
                            console.log(beatmapCache.get(beatmapCalc.id));
                        } else {
                            calculatedMap = await calculate(beatmapCalc.id, mods ? parseMods(mods) : 0, {
                                n50: 0,
                                n100: 0,
                                n300: 0,
                                nMisses: 0,
                                passedObjects: (beatmapCalc.countNormal+beatmapCalc.countSlider+beatmapCalc.countSpinner),
                                combo: beatmapCalc.maxCombo,
                                accuracy: 100
                            }, false, rows[0].secret);
                        }

                        bancho.getUser(rows[0].username).sendMessage(`[${tags["mod"] || tags["subscriber"] || tags["badges"] && tags.badges["vip"] ? "★" : "♦"}] ${tags["username"]} » [https://osu.ppy.sh/b/${calculatedMap.id} ${calculatedMap.artist} - ${calculatedMap.title} [${calculatedMap.version}]] ${mods ? "+"+mods : ""} | 95%: ${calculatedMap.fcPP.n95}pp | 98%: ${calculatedMap.fcPP.n98}pp | 99%: ${calculatedMap.fcPP.n99}pp | 100%: ${calculatedMap.fcPP.n100}pp | ${calculatedMap.stats.length} - ★ ${calculatedMap.stats.stars} - ♫ ${calculatedMap.stats.objects} - AR${calculatedMap.stats.ar} - OD${calculatedMap.stats.od}`).then(() => {
                            twitch.say(channel, "/me Request sent!");
                        });
                    });
                }
            });
        });
    });

    // await twitch.connect();
    // await bancho.connect();
    // await discord.login(config.credentials.discord.token);

    // http.listen(2048, () => console.log("[info] HTTP listening on Port 2048!"));
})();

function parseMods(mods) {
    let bit = 0;

    if(mods.match(/NF/)) bit += 1;
    if(mods.match(/EZ/)) bit += 2;
    if(mods.match(/HD/)) bit += 8;
    if(mods.match(/HR/)) bit += 16;
    if(mods.match(/SD/)) bit += 32;
    else if(mods.match(/PF/)) bit += 16384;
    if(mods.match(/NC/)) bit += 512;
    else if(mods.match(/DT/)) bit += 64;
    if(mods.match(/RX/)) bit += 128;
    if(mods.match(/HT/)) bit += 256;
    if(mods.match(/FL/)) bit += 1024;
    if(mods.match(/SO/)) bit += 4096;

    return bit;
}

function calculate(id, mods = 0, obj = {}, b = false, secret) {
    return new Promise(async resolve => {
        let finish = false;

        toCalculate = [];
        if(b) {
            toCalculate.push({
                mods: mods,
                acc: obj.accuracy,
                n300: obj.n300,
                n100: obj.n100,
                n50: obj.n50,
                nMisses: obj.nMisses,
                combo: obj.combo,
                passedObjects: obj.passedObjects,
            });
        } else {
            toCalculate.push([
                {
                    mods: mods,
                    acc: 95
                },
                {
                    mods: mods,
                    acc: 98
                },
                {
                    mods: mods,
                    acc: 99
                },
                {
                    mods: mods,
                    acc: 100
                }
            ]);
        }

        if(!beatmapCache.get(id)) {
            bancho.osuApi.beatmaps.getByBeatmapId(id).then(async (x) => {
                x = x[0];

                if(!x) return resolve();

                downloading = false, mapPath = path.join(__dirname, "maps", `${x.id}.osu`);

                if(!fs.existsSync(mapPath)) {
                    downloading = true, file = fs.createWriteStream(mapPath);
                    https.get(`https://osu.ppy.sh/osu/${x.id}`, (o) => {
                        o.pipe(file);
                        file.on("finish", () => {
                            file.close();
                            downloading = false;
                        });
                    });
                }

                while (downloading) {
                    await new Promise(p => setTimeout(p, 1000));
                }

                beatmapCache.set(id, {
                    artist: x.artist,
                    title: x.title,
                    version: x.version,
                    length: x.totalLength,
                    path: mapPath,
                    downloaded: fs.existsSync(mapPath)
                });

                if(beatmapCache.get(id).downloaded) finish = true;
            });
        } else finish = true;

        while (!finish) {
            await new Promise(p => setTimeout(p, 1000));
        }

        calculatedMap = await pp.calculate({
            path: beatmapCache.get(id).path,
            params: toCalculate
        });

        if(!ppCache.get(`${id}-${mods}`) || ppCache.get(`${id}-${mods}`) && b) {
            ppCache.set(`${id}-${mods}`, calculatedMap);
        }

        currentlyPlaying.set(`${secret}`, `» https://osu.ppy.sh/b/${id}`);

        resolve({
            id: id,
            artist: beatmapCache.get(id).artist,
            title: beatmapCache.get(id).title,
            version: beatmapCache.get(id).version,
            stats: {
                ar: Math.round(ppCache.get(`${id}-${mods}`)[0].ar * 100) / 100,
                od: Math.round(ppCache.get(`${id}-${mods}`)[0].od * 100) / 100,
                cs: Math.round(ppCache.get(`${id}-${mods}`)[0].cs * 100) / 100,
                hp: Math.round(ppCache.get(`${id}-${mods}`)[0].hp * 100) / 100,
                stars: Math.round(ppCache.get(`${id}-${mods}`)[0].stars * 100) / 100,
                objects: ppCache.get(`${id}-${mods}`)[0].nCircles+ppCache.get(`${id}-${mods}`)[0].nSliders+ppCache.get(`${id}-${mods}`)[0].nSpinners,
                length: moment(Math.floor(beatmapCache.get(id).length) * 1000).format("mm:ss"),
                maxCombo: ppCache.get(`${id}-${mods}`)[0].maxCombo
            },
            accuracy: obj.accuracy,
            misses: obj.nMisses,
            pp: Math.round(ppCache.get(`${id}-${mods}`)[0].pp),
            fcPP: {
                n95: Math.round(ppCache.get(`${id}-${mods}`)[toCalculate.length >= 3 ? 0 : 0].pp),
                n98: Math.round(ppCache.get(`${id}-${mods}`)[toCalculate.length >= 3 ? 1 : 0].pp),
                n99: Math.round(ppCache.get(`${id}-${mods}`)[toCalculate.length >= 3 ? 2 : 0].pp),
                n100: Math.round(ppCache.get(`${id}-${mods}`)[toCalculate.length >= 3 ? 3 : 0].pp),
            },
            mods: mods
        });
    });
}