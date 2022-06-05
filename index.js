const [ config, tmi, Banchojs, moment, NodeCache, { Client, Intents }, cron, url, sqlite3, httpServer, serveStatic, finalhandler, path, { exec }, pp, fs, https ] = requireMany("./config.json", "tmi.js", "bancho.js", "moment", "node-cache", "discord.js", "cron", "url", "sqlite3", "http", "serve-static", "finalhandler", "path", "child_process", "rosu-pp", "fs", "https");
process.env["OSU_API_KEY"] = config.credentials.osu.apiKey;

// storing basic data like set id, name
const beatmapCache = new NodeCache();
// create tmi.js instance
const twitch = new tmi.Client({ identity: { username: config.credentials.twitch.username, password: config.credentials.twitch.password } });
// create bancho instance
const bancho = new Banchojs.BanchoClient({ username: config.credentials.osu.username, password: config.credentials.osu.password, apiKey: config.credentials.osu.apiKey });
// create discord instance
const discord = new Client({ partials: ["CHANNEL"], intents: [ Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_PRESENCES, Intents.FLAGS.GUILD_MEMBERS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_WEBHOOKS, Intents.FLAGS.DIRECT_MESSAGES ] });
// websocket
const http = httpServer.createServer();
const io = require("socket.io")(http);
const serve = serveStatic(path.join(__dirname, "static"), { index: [ "index.html" ] });
// restart process automatically
new cron.CronJob('0 2 * * *', () => process.exit(1), null, true, 'UTC').start();
// storage
const db = new sqlite3.Database("./osu-request-bot.db");
// version string
const build = 1;

(async () => {

    let sockets = {};
    console.log("[info] Starting up..");

    db.run("CREATE TABLE IF NOT EXISTS users (username varchar(20) NOT NULL PRIMARY KEY, twitch varchar(20) NULL, discord bigint(20) NULL, secret int(8) NULL, hwid varchar(50) NULL, verified tinyint(1) DEFAULT 0)");

    http.on("request", (req, res) => {
        q = url.parse(req.url, true);

        if(q.pathname.match(/b/)) {
            res.statusCode = 200;
            res.write(`${build}`);
            res.end();
            return;
        }

        if(q.pathname.match(/pp-overlay/)) {
            return serve(req, res, finalhandler(req, res));
        }

    });

    io.on("connection", (socket) => {
        console.log(`[socket] New connection from ${socket.id}`);

        socket.on("generateAuth", (s) => {
            console.log(`[socket] ${socket.id} requested generateAuth`);
            db.all(`SELECT hwid, verified FROM users WHERE username = \"${s.osu.toLowerCase()}\"`, (err, rows) => {
                if(err || rows.length <= 0 || rows.length >= 1 && rows[0].verified == 1) return socket.emit("verify", false);
                if(s.id == rows[0].hwid || rows[0].hwid == null & rows[0].verified == 0) {
                    let generated = ((Math.random() + 1).toString(36).substring(7));
                    db.run(`UPDATE users SET secret = \"${generated}\", hwid = \"${s.id}\" WHERE username = \"${s.osu.toLowerCase()}\"`, (err) => {
                        if(!err) {
                            socket.emit("verify", true, generated);
                            sockets[generated] = socket;
                            console.log(`[generateAuth] ${socket.id} identified as ${s.osu}`);
                        }
                    });
                }
            });
        });

        socket.on("auth", (d) => {
            console.log(`[socket] ${socket.id} requested auth`);
            db.all(`SELECT username, secret, twitch FROM users WHERE username = \"${d.osu.toLowerCase()}\" AND secret = \"${d.secret}\"`, (err, rows) => {
                if(err || rows.length <= 0) return socket.emit("loggedIn", false);

                socket.emit("loggedIn", true, rows[0].username);

                sockets[rows[0].secret] = socket;
                sockets[rows[0].secret].username = rows[0].username;
                sockets[rows[0].secret].twitch = rows[0].twitch;
                beatmapCache.set(d.secret, { map: null, pp: null });
                twitch.join(`#${rows[0].twitch}`);

                console.log(`[auth] ${socket.id} identified as ${rows[0].username}`);
            });
        });

        socket.on("authWeb", (d) => {
            console.log(`[socket] ${socket.id} requested authWeb`);
            if(sockets[d]) {
                sockets[d].web = socket;
                console.log(`[authWeb] ${socket.id} identified as ${sockets[d].username}`);
            }
        });

        socket.on("clientData", async a => {
            clientSocket = sockets[a.secretId];
            if(clientSocket && clientSocket.web) {
                calculatedMap = await calculate(a.Beatmap.id, a.Player.mods.value, {
                    n50: a.Stats.n50,
                    n100: a.Stats.n100,
                    n300: a.Stats.n300,
                    nMisses: a.Stats.nMisses,
                    passedObjects: a.Stats.passedObjects,
                    combo: a.Stats.combo,
                    accuracy: a.Stats.accuracy
                });
                clientSocket.web.emit("data", {
                    playing: a.Player.playing,
                    name: a.Beatmap.name,
                    id: a.Beatmap.id,
                    mods: a.Player.mods.text,
                    hits: {
                        50: a.Stats.n50,
                        100: a.Stats.n100,
                        300: a.Stats.n300,
                        miss: a.Stats.nMisses,
                    },
                    maxCombo: a.Stats.combo,
                    accuracy: a.Stats.accuracy,
                    pp: calculatedMap.pp,
                    img: `https://assets.ppy.sh/beatmaps/${a.Beatmap.setId}/covers/cover.jpg`
                });
            }
        });

        socket.on("disconnect", () => {
            console.log(`[socket] ${socket.id} disconnected`);
            for(i in sockets) {
                if(sockets[i].id == socket.id) {
                    twitch.part(`#${sockets[i].twitch}`);
                    delete sockets[i];
                }
            }
        });
    });

    bancho.on("connected", () => {
        console.log("[info] Bancho connected");
        bancho.on("PM", (message) => {
            args = message.message.replace("!", "").split(" ");
            if(args[0] == "verify") {
                console.log(`[bancho] new message from ${message.user.ircUsername}`);
                db.all(`SELECT * FROM users WHERE secret = \"${args[1]}\"`, (err, rows) => {
                    if(err || rows.length <= 0) return;
                    if(rows[0].username == message.user.ircUsername) {
                        db.run(`UPDATE users SET verified = \"1\" WHERE username = \"${rows[0].username.toLowerCase()}\" AND secret = \"${rows[0].secret}\"`, (err) => {
                            if(!err) {
                                sockets[rows[0].secret].emit("success", rows[0].username, rows[0].secret);
                                console.log(`[bancho] ${rows[0].username} is now verified`);
                            }
                        });
                    }
                });
            }
        });
    });

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


                console.log(await calculate(Number(args[1]), args[2], args[3], args[4]));

                // message.channel.send();

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
                    // if(beatmapCache.get(rows[0].secret)) {
                    //     cache = beatmapCache.get(rows[0].secret);
                    //     twitch.say(channel, `» ${cache.map} ${cache.mods ? cache.mods : ""} - https://osu.ppy.sh/b/${cache.info.map.id} | 95%: ${cache.info.pp[95]}pp | 98%: ${cache.info.pp[98]}pp | 99%: ${cache.info.pp[99]}pp | 100%: ${cache.info.pp[100]}pp | ${cache.info.map.length} - ★ ${cache.info.map.stars} - ♫ ${cache.info.map.objects} - AR${cache.info.map.ar} - OD${cache.info.map.od}`);
                    // }
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

                        calculatedMap = await calculate(beatmapCalc.id, parseMods(mods), {
                            n50: 0,
                            n100: 0,
                            n300: 0,
                            nMisses: 0,
                            passedObjects: (beatmapCalc.countNormal+beatmapCalc.countSlider+beatmapCalc.countSpinner),
                            combo: beatmapCalc.maxCombo,
                            accuracy: 100
                        });

                        bancho.getUser(rows[0].username).sendMessage(`[${tags["mod"] || tags["subscriber"] || tags["badges"] && tags.badges["vip"] ? "★" : "♦"}] ${tags["username"]} » [https://osu.ppy.sh/b/${calculatedMap.id} ${calculatedMap.artist} - ${calculatedMap.title} [${calculatedMap.version}]] ${mods ? "+"+mods : ""} | 95%: ${calculatedMap.fcPP.n95}pp | 98%: ${calculatedMap.fcPP.n98}pp | 99%: ${calculatedMap.fcPP.n99}pp | 100%: ${calculatedMap.fcPP.n100}pp | ${calculatedMap.stats.length} - ★ ${calculatedMap.stats.stars} - ♫ ${calculatedMap.stats.objects} - AR${calculatedMap.stats.ar} - OD${calculatedMap.stats.od}`).then(() => {
                            twitch.say(channel, "/me Request sent!");
                        });
                    });
                }
            });
        });
    });

    await twitch.connect();
    await bancho.connect();
    await discord.login(config.credentials.discord.token);

    http.listen(2048, () => console.log("[info] HTTP listening on Port 2048!"));
})();

function requireMany () {
    return Array.prototype.slice.call(arguments).map(function (value) {
        try {
            return require(value)
        }
        catch (event) {
            return console.log(event)
        }
    })
}

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

function calculate(id, mods = 0, obj = {}) {
    return new Promise(async resolve => {
        let finish = false;

        if(!beatmapCache.get(id)) {
            bancho.osuApi.beatmaps.getByBeatmapId(id).then(async (x) => {
                x = x[0];
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
            params: [
                {
                    mods: mods,
                    acc: obj.accuracy,
                    n300: obj.n300,
                    n100: obj.n100,
                    n50: obj.n50,
                    nMisses: obj.nMisses,
                    combo: obj.combo,
                    passedObjects: obj.passedObjects,
                },
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
            ]
        });

        resolve({
            id: id,
            artist: beatmapCache.get(id).artist,
            title: beatmapCache.get(id).title,
            version: beatmapCache.get(id).version,
            stats: {
                ar: Math.round(calculatedMap[0].ar * 100) / 100,
                od: Math.round(calculatedMap[0].od * 100) / 100,
                cs: Math.round(calculatedMap[0].cs * 100) / 100,
                hp: Math.round(calculatedMap[0].hp * 100) / 100,
                stars: Math.round(calculatedMap[0].stars * 100) / 100,
                objects: calculatedMap[0].nCircles+calculatedMap[0].nSliders+calculatedMap[0].nSpinners,
                length: moment(Math.floor(beatmapCache.get(id).length) * 1000).format("mm:ss"),
                maxCombo: calculatedMap[0].maxCombo
            },
            accuracy: obj.accuracy,
            misses: obj.nMisses,
            pp: Math.round(calculatedMap[0].pp),
            fcPP: {
                n95: Math.round(calculatedMap[1].pp),
                n98: Math.round(calculatedMap[2].pp),
                n99: Math.round(calculatedMap[3].pp),
                n100: Math.round(calculatedMap[4].pp),
            },
            mods: mods
        });
    });
}