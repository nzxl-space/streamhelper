const [config, tmi, Banchojs, moment, axios, fs, NodeCache, { Client, Intents }, { MapInfo, ModUtil, Accuracy }, { MapStars, OsuPerformanceCalculator }, cron, open, url, sqlite3, httpServer, serveStatic, finalhandler, path] = requireMany("./config.json", "tmi.js", "bancho.js", "moment", "axios", "fs", "node-cache", "discord.js", "@rian8337/osu-base", "@rian8337/osu-difficulty-calculator", "cron", "open", "url", "sqlite3", "http", "serve-static", "finalhandler", "path");
process.env["OSU_API_KEY"] = config.credentials.osu.apiKey;
const regEx = {
    "beatmapLink": /^(https:\/\/osu\.ppy\.sh\/beatmapsets\/)|([0-9]+)|\#osu^\/|([0-9]+)/g,
    "beatmapMods": /^\+|(EZ)|(NF)|(HT)|(SD)|(HD)|(HR)|(DT)|(FL)|(RX)|(SO)/i
}
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
const serve = serveStatic(path.join(__dirname, "web"), { index: [ "index.html" ] });
// restart process automatically
new cron.CronJob('0 2 * * *', () => process.exit(1), null, true, 'UTC').start();
// storage
const db = new sqlite3.Database("./osu-request-bot.db");

(async () => {
    let sockets = {};
    console.log("[info] Starting up..");

    db.run("CREATE TABLE IF NOT EXISTS users (username varchar(20) NOT NULL PRIMARY KEY, twitch varchar(20) NULL, discord bigint(20) NULL, secret int(8) NULL, hwid varchar(50) NULL, verified tinyint(1) DEFAULT 0)");

    http.on("request", (req, res) => {
        q = url.parse(req.url, true);

        if(q.pathname.match(/pp-overlay/)) {
            serve(req, res, finalhandler(req, res));
        }

    });

    io.on("connection", (socket) => {
        console.log(`[socket] New connection from ${socket.id}`);

        socket.on("generateAuth", (s) => {
            console.log(`[socket] ${socket.id} requested generateAuth`);
            db.all(`SELECT hwid, verified FROM users WHERE username = \"${s.osu.toLowerCase()}\"`, (err, rows) => {
                if(err || rows.length <= 0) return socket.emit("verify", false);
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

        socket.on("osuData", async (a) => {
            if(beatmapCache.get(a.secret)) {
                if(beatmapCache.get(a.secret).map != a.name || beatmapCache.get(a.secret).mods != a.mods) {
                    beatmapCache.set(a.secret, { map: a.name, info: await calculate(a.id, a.mods, null, true), mods: a.mods });
                }
            }

            if(sockets[a.secret] && sockets[a.secret].web) {
                sockets[a.secret].web.emit("data", {
                    playing: a.playing,
                    name: a.name,
                    id: a.id,
                    mods: a.mods,
                    hits: {
                        50: a.hit50,
                        100: a.hit100,
                        300: a.hit300,
                        miss: a.hitMiss
                    },
                    maxCombo: a.maxCombo,
                    accuracy: a.accuracy,
                    pp: await calculate(a.id, a.mods, { hit50: a.hit50, hit100: a.hit100, hit300: a.hit300, hitMiss: a.hitMiss, maxCombo: a.maxCombo, accuracy: a.accuracy}, false),
                    img: `https://assets.ppy.sh/beatmaps/${a.setId}/covers/cover.jpg`
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

        discord.on("messageCreate", message => {
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
        });
    });

    twitch.on("connected", () => {
        console.log("[info] Twitch connected");
        twitch.on("message", (channel, tags, message, self) => {
            message = message.split(" ");

            db.all(`SELECT username, secret FROM users WHERE twitch = \"${channel.replace(/\#/, "").toLowerCase()}\"`, (err, rows) => {
                if(err || rows.length <= 0) return;
                if(message[0] == "!np" || message[0] == "!nppp" || message[0] == "!pp") {
                    if(beatmapCache.get(rows[0].secret)) {
                        cache = beatmapCache.get(rows[0].secret);
                        twitch.say(channel, `» ${cache.map} ${cache.mods ? cache.mods : ""} - https://osu.ppy.sh/b/${cache.info.map.id} | 95%: ${cache.info.pp[95]}pp | 98%: ${cache.info.pp[98]}pp | 99%: ${cache.info.pp[99]}pp | 100%: ${cache.info.pp[100]}pp | ${cache.info.map.length} - ★ ${cache.info.map.stars} - ♫ ${cache.info.map.objects} - AR${cache.info.map.ar} - OD${cache.info.map.od}`);
                    }
                    return;
                }

                let beatmapId, setId, modsText, beatmapCalc;
                message.forEach(msg => {
                    if(msg.match(regEx.beatmapLink) && msg.match(regEx.beatmapLink)[0] == "https://osu.ppy.sh/beatmapsets/") {
                        beatmapId = msg.match(regEx.beatmapLink)[1], setId = msg.match(regEx.beatmapLink)[2];
                    } else if(msg.match(regEx.beatmapMods)) {
                        modsText = msg.replace(/^\+/, "").toUpperCase();
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
    
                        calc = await calculate(beatmapCalc.id, modsText, null, true);
                        bancho.getUser(rows[0].username).sendMessage(`[${tags["mod"] || tags["subscriber"] || tags["badges"] && tags.badges["vip"] ? "★" : "♦"}] ${tags["username"]} » [https://osu.ppy.sh/b/${calc.map.id} ${calc.map.name}] ${modsText ? "+"+modsText : ""} | 95%: ${calc.pp[95]}pp | 98%: ${calc.pp[98]}pp | 99%: ${calc.pp[99]}pp | 100%: ${calc.pp[100]}pp | ${calc.map.length} - ★ ${calc.map.stars} - ♫ ${calc.map.objects} - AR${calc.map.ar} - OD${calc.map.od}`).then(() => {
                            twitch.say(channel, "/me Request sent!");
                        });
                    });
                }
            });
        });
    });

    await bancho.connect();
    await discord.login(config.credentials.discord.token);
    await twitch.connect();

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

function calculate(id, mods = null, stats = null, b) {
    return new Promise(async resolve => {
        count = 0;
        while(true) {
            try {
                beatmapInfo = await MapInfo.getInformation({ beatmapID: id });
                rating = new MapStars().calculate({ map: beatmapInfo.map, mods: (mods && mods.match(regEx.beatmapMods) ? ModUtil.pcStringToMods(mods) : null) });
                break;
            } catch (e) {
                if(count++ == 4) resolve();
            }
        }

        if(b) {
            resolve({
                "map": {
                    "name": `${beatmapInfo.artist} - ${beatmapInfo.title} [${beatmapInfo.version}]`,
                    "id": beatmapInfo.beatmapID,
                    "setId": beatmapInfo.beatmapsetID,
                    "stars": Math.round(rating.pcStars.total * 100) / 100,
                    "ar": Math.round(rating.pcStars.stats.ar * 100) / 100,
                    "od": Math.round(rating.pcStars.stats.od * 100) / 100,
                    "length": mods && mods.match(/DT|NC/) ? moment.utc((beatmapInfo.totalLength*0.67)*1000).format("mm:ss") : moment.utc(beatmapInfo.totalLength*1000).format("mm:ss"),
                    "objects": beatmapInfo.circles+beatmapInfo.sliders+beatmapInfo.spinners
                },
                "pp": {
                    "95": Math.round(new OsuPerformanceCalculator().calculate({ stars: rating.pcStars, accPercent: 95 }).total),
                    "98": Math.round(new OsuPerformanceCalculator().calculate({ stars: rating.pcStars, accPercent: 98 }).total),
                    "99": Math.round(new OsuPerformanceCalculator().calculate({ stars: rating.pcStars, accPercent: 99 }).total),
                    "100": Math.round(new OsuPerformanceCalculator().calculate({ stars: rating.pcStars, accPercent: 100 }).total)
                }
            });
        } else {
            resolve(Math.round(new OsuPerformanceCalculator().calculate({
                "stars": rating.pcStars,
                "combo": stats.maxCombo,
                "accPercent": new Accuracy({
                    "nmiss": stats.hitMiss,
                    "n300": stats.hit300,
                    "n100": stats.hit100,
                    "n50": stats.hit50,
                    "percent": stats.accuracy,
                    "nobjects": beatmapInfo.objects
                })
            }).total));
        }
    });
}