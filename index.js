const [config, tmi, Banchojs, moment, axios, fs, NodeCache, { Client, Intents }, { MapInfo, ModUtil, Accuracy }, { MapStars, OsuPerformanceCalculator }, cron, open, url, sqlite3, httpServer, serveStatic, finalhandler, path] = requireMany("./config.json", "tmi.js", "bancho.js", "moment", "axios", "fs", "node-cache", "discord.js", "@rian8337/osu-base", "@rian8337/osu-difficulty-calculator", "cron", "open", "url", "sqlite3", "http", "serve-static", "finalhandler", "path");
process.env["OSU_API_KEY"] = config.credentials.osu.apiKey;
const regEx = {
    "beatmapLink": /^(https:\/\/osu\.ppy\.sh\/beatmapsets\/)|([0-9]+)|\#osu^\/|([0-9]+)/g,
    "beatmapMods": /^\+|(EZ)|(NF)|(HT)|(SD)|(HD)|(HR)|(DT)|(FL)|(RX)|(SO)/i
}
// storing basic data like set id, name
const beatmapCache = new NodeCache();
// create tmi.js instance
const twitch = new tmi.Client({ identity: { username: config.credentials.twitch.username, password: config.credentials.twitch.password }, channels: Object.keys(config.users) });
// create bancho instance
const bancho = new Banchojs.BanchoClient({ username: config.credentials.osu.username, password: config.credentials.osu.password, apiKey: config.credentials.osu.apiKey });
// create discord instance
const discord = new Client({ intents: [ Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_PRESENCES, Intents.FLAGS.GUILD_MEMBERS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_WEBHOOKS, Intents.FLAGS.DIRECT_MESSAGES ] });
// websocket
const http = httpServer.createServer();
const io = require("socket.io")(http);
const serve = serveStatic(path.join(__dirname, "web"), { index: [ "index.html" ] });
// restart process automatically
new cron.CronJob('0 2 * * *', () => process.exit(1), null, true, 'UTC').start();
// storage
const db = new sqlite3.Database("./osu-request-bot.db");

(async () => {
    let accessToken, sockets = {};
    console.log("[info] Starting up..");

    http.listen(2048, () => console.log("[info] HTTP listening on Port 2048!"));
    db.run("CREATE TABLE IF NOT EXISTS users (username varchar(20) NOT NULL PRIMARY KEY, twitch varchar(20) NULL, discord bigint(20) NULL, secret int(8) NULL, hwid varchar(50) NULL, verified tinyint(1) DEFAULT 0)");
    // db.run("INSERT INTO \"users\" (\"username\") VALUES (\"kiyomii\")");
    
    http.on("request", (req, res) => {
        q = url.parse(req.url, true);

        if(q.pathname == "/" && q.query.code) {
            console.log("[info] Requesting new access token..");
            axios.post(`https://osu.ppy.sh/oauth/token`, { client_id: config.credentials.osu.devApp.clientID, client_secret: config.credentials.osu.devApp.clientSecret, code: url.parse(req.url, true).query.code, redirect_uri: "http://localhost:2048", grant_type: "authorization_code" }).then(x => { 
                fs.writeFileSync("./access", x.data.refresh_token); 
                accessToken = x.data.access_token;
                console.log("[info] Access token set!");
            });

            res.write("<script>window.close();</script>");
            return res.end();
        }

        if(q.pathname.match(/pp-overlay/)) {
            serve(req, res, finalhandler(req, res));
        }
    });

    io.on("connection", (socket) => {
        console.log(`[socket] New connection from ${socket.id}`);

        socket.on("generateAuth", (s) => {
            console.log(`[socket] ${socket.id} requested generateAuth`);
            db.all(`SELECT hwid, verified FROM users WHERE username = \"${s.osu}\"`, (err, rows) => {
                if(err || rows.length <= 0) return socket.emit("verify", false);
                if(s.id == rows[0].hwid || rows[0].hwid == null & rows[0].verified == 0) {
                    let generated = ((Math.random() + 1).toString(36).substring(7));
                    db.run(`UPDATE users SET secret = \"${generated}\", hwid = \"${s.id}\" WHERE username = \"${s.osu}\"`, (err) => {
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
            db.all(`SELECT username, secret FROM users WHERE username = \"${d.osu}\" AND secret = \"${d.secret}\"`, (err, rows) => {
                if(err || rows.length <= 0) return socket.emit("loggedIn", false);

                socket.emit("loggedIn", true, rows[0].username);
                sockets[rows[0].secret] = socket;
                sockets[rows[0].secret].username = rows[0].username;
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
            if(sockets[a.secret].web) {
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
                    pp: await calculateCurrent(a.id, { hit50: a.hit50, hit100: a.hit100, hit300: a.hit300, hitMiss: a.hitMiss, maxCombo: a.maxCombo, accuracy: a.accuracy}, a.mods),
                    img: `https://assets.ppy.sh/beatmaps/${a.setId}/covers/cover.jpg`
                });
            }
        });

        socket.on("disconnect", () => {
            console.log(`[socket] ${socket.id} disconnected`);
            for(i in sockets) {
                if(sockets[i].id == socket.id) delete sockets[i];
            }
        });
    });

    if(!fs.existsSync("./access")) {
        console.log("[info] No access token found, need authorization.");
        open(`https://osu.ppy.sh/oauth/authorize?client_id=${config.credentials.osu.devApp.clientID}&redirect_uri=http://localhost:2048&response_type=code&scope=public`);
    } else {
        console.log("[info] Checking if access token is valid..");
        axios.post(`https://osu.ppy.sh/oauth/token`, { client_id: config.credentials.osu.devApp.clientID, client_secret: config.credentials.osu.devApp.clientSecret, refresh_token: fs.readFileSync("./access", "utf8"), grant_type: "refresh_token" }).then(x => { 
            fs.writeFileSync("./access", x.data.refresh_token); 
            accessToken = x.data.access_token; 
            console.log("[info] Access token set!");
        });
    }

    while(!accessToken) {
        await new Promise(p => setTimeout(p, 500));
    }

    bancho.on("connected", () => {
        console.log("[info] Bancho connected");
        bancho.on("PM", (message) => {
            args = message.message.replace("!", "").split(" ");
            if(args[0] == "verify") {
                console.log(`[bancho] new message from ${message.user.ircUsername}`);
                db.all(`SELECT * FROM users WHERE secret = \"${args[1]}\"`, (err, rows) => {
                    if(err || rows.length <= 0) return;
                    if(rows[0].username == message.user.ircUsername) {
                        db.run(`UPDATE users SET verified = \"1\" WHERE username = \"${rows[0].username}\" AND secret = \"${rows[0].secret}\"`, (err) => {
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
        setInterval(() => {
            Object.keys(config.users).forEach(user => {
                discord.guilds.cache.get(config.credentials.discord.guild).members.fetch(config.users[`${user}`].discord).then(u => {
                    if(!u.presence) return;

                    if(u.presence.activities.filter(x => x.name == "osu!" && x.type == "PLAYING" && x.details).length >= 1) {
                        currentMap = u.presence.activities.filter(x => x.name == "osu!" && x.type == "PLAYING")[0].details;
                    
                        if(beatmapCache.get(`${config.users[`${user}`].discord}`) && beatmapCache.get(`${config.users[`${user}`].discord}`).map == currentMap)
                            return;
    
                        beatmapCache.set(`${config.users[`${user}`].discord}`, { map: currentMap, timestamp: Math.floor(Date.now() / 1000) });
                        console.log(`${config.users[`${user}`].osu} is playing ${currentMap}`);
                    }
                });
            });
        }, 3*1000);
    });

    await bancho.connect();
    // await discord.login(config.credentials.discord.token);
    // await twitch.connect();

    return;

    twitch.on("connected", () => {
        console.log("Twitch connected");
        twitch.on("message", (channel, tags, message, self) => {
            if(!Object.keys(config.users).includes(`${channel.replace(/\#/, "")}`)) return;

            message = message.split(" ");
            user = config.users[`${channel.replace(/\#/, "")}`];

            if(message[0] == "!np") {
                if(beatmapCache.get(`${user.discord}`)) {
                    console.log(`Request for currently playing map in ${channel}`);
                    axios({
                        method: "GET", 
                        url: `https://osu.ppy.sh/api/v2/beatmapsets/search?m=0&q=${beatmapCache.get(`${user.discord}`).map}&s=any`,
                        headers: {
                            "Authorization": `Bearer ${accessToken}`,
                            "Content-Type": "application/json",
                            "Accept": "application/json"
                        }
                    })
                    .then(async response => {
                        let wFound = false;
                        for (x in response.data.beatmapsets) {
                            map = response.data.beatmapsets[x];
                            currentlyPlaying = beatmapCache.get(`${user.discord}`).map;
                            mods = (message[1] && message[1].match(osuMods) ? message[1].replace(/^\+/, "").toUpperCase() : null);
                            if(map.artist.match(/\w+.\w+/)[0] == currentlyPlaying.match(/\w+.\w+/)[0]) {
                                found = map.beatmaps.find(o => o.version == currentlyPlaying.match(/(?!.*\[)(?<=\[).+?(?=\])/)[0]);
                                if(found) {
                                    wFound = true;
                                    calc = await calculate(found.id, mods);
                                    twitch.say(channel, `${moment.utc(beatmapCache.get(`${user.discord}`).timestamp*1000).format("HH:mm")} » ${currentlyPlaying}${mods ? " +"+mods : ""} - ${found.url} | 95%: ${calc.b}pp | 98%: ${calc.a}pp | 99%: ${calc.s}pp | 100%: ${calc.ss}pp | ${moment.utc(found.total_length*1000).format("mm:ss")} - ★ ${calc.stars} - ♫ ${(found.count_circles+found.count_sliders+found.count_spinners)} - AR${calc.ar} - OD${calc.od}`);
                                    break;
                                }
                            }
                        }

                        if(!wFound)
                            twitch.say(channel, "/me No data available");
                    });
                }

                return;
            }

            let beatmapLink, beatmapId, setId, modsText, beatmapCalc;
            message.forEach(msg => {
                if(msg.match(osuLink) && msg.match(osuLink)[0] == "https://osu.ppy.sh/beatmapsets/") {
                    beatmapLink = msg, beatmapId = msg.match(osuLink)[1], setId = msg.match(osuLink)[2];
                } else if(msg.match(osuMods)) {
                    modsText = msg.replace(/^\+/, "").toUpperCase();
                }
            });

            if(beatmapId) {
                bancho.osuApi.beatmaps.getBySetId(beatmapId).then(async (x) => {
                    if(x.length <= 0) return;

                    console.log(`New map request in ${channel}`);

                    for(s in x) {
                        if(x[s].id == setId) {
                            beatmapCalc = x[s];
                        }
                    }

                    if(!beatmapCalc) beatmapCalc = x[0];

                    calc = await calculate(beatmapCalc.id, modsText);
                    bancho.getUser(user.osu).sendMessage(`[${tags["mod"] || tags["subscriber"] || tags["badges"] && tags.badges["vip"] ? "★" : "♦"}] ${tags["username"]} » [${beatmapLink} ${beatmapCalc.artist} - ${beatmapCalc.title} [${beatmapCalc.version}]] ${modsText ? "+"+modsText : ""} | 95%: ${calc.b}pp | 98%: ${calc.a}pp | 99%: ${calc.s}pp | 100%: ${calc.ss}pp | ${moment.utc(beatmapCalc.totalLength*1000).format("mm:ss")} - ★ ${calc.stars} - ♫ ${(beatmapCalc.countNormal+beatmapCalc.countSlider+beatmapCalc.countSpinner)} - AR${calc.ar} - OD${calc.od}`).then(() => {
                        twitch.say(channel, "/me Request sent!");
                    });
                });
            }
        });
    });


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

function calculateMap(id, mods = null) {
    return new Promise(async resolve => {
        beatmapInfo = await MapInfo.getInformation({ beatmapID: id });
        rating = new MapStars().calculate({ map: beatmapInfo.map, mods: (mods && mods.match(regEx.beatmapMods) ? ModUtil.pcStringToMods(mods) : null) });

        resolve({
            "map": {
                "stars": Math.round(rating.pcStars.total * 100) / 100,
                "ar": Math.round(rating.pcStars.stats.ar * 100) / 100,
                "od": Math.round(rating.pcStars.stats.od * 100) / 100,
            },
            "pp": {
                "95": Math.round(new OsuPerformanceCalculator().calculate({ stars: rating.pcStars, accPercent: 95 }).total),
                "98": Math.round(new OsuPerformanceCalculator().calculate({ stars: rating.pcStars, accPercent: 98 }).total),
                "99": Math.round(new OsuPerformanceCalculator().calculate({ stars: rating.pcStars, accPercent: 99 }).total),
                "100": Math.round(new OsuPerformanceCalculator().calculate({ stars: rating.pcStars, accPercent: 100 }).total)
            }
        });
    });
}

function calculateCurrent(id, stats, mods = null) {
    return new Promise(async resolve => {
        beatmapInfo = await MapInfo.getInformation({ beatmapID: id });
        rating = new MapStars().calculate({ map: beatmapInfo.map, mods: (mods && mods.match(regEx.beatmapMods) ? ModUtil.pcStringToMods(mods) : null) });

        resolve(Math.round(new OsuPerformanceCalculator().calculate({
            stars: rating.pcStars,
            combo: stats.maxCombo,
            accPercent: new Accuracy({
                nmiss: stats.hitMiss,
                n300: stats.hit300,
                n100: stats.hit100,
                n50: stats.hit50,
                percent: stats.accuracy,
                nobjects: beatmapInfo.objects
            })
        }).total));
    });
}