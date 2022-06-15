const deps = require("../constants.js");

module.exports = class WebSocket {
    createServer() {
        deps.database.run("CREATE TABLE IF NOT EXISTS users (username varchar(20) NOT NULL PRIMARY KEY, twitch varchar(20) NULL, discord bigint(20) NULL, secret int(8) NULL, hwid varchar(50) NULL, verified tinyint(1) DEFAULT 0)");
        // deps.database.run("UPDATE users SET verified = \"0\" WHERE username = \"kiyomii\"");
        // deps.database.run("INSERT INTO users (username, twitch, discord) VALUES (\"kiyomii\", \"kiyowomii\", \"710490901482307626\")");

        deps.io.on("connection", (socket) => {
            console.log(`New connection from >${socket.id}<`);

            socket.on("REGISTER", data => {
                console.log(`Registering >${socket.id}< to database..`);
                deps.database.all(`SELECT hwid, verified FROM users WHERE username = \"${data.osu.toLowerCase()}\"`, (err, rows) => {
                    if(err || rows.length <= 0 || rows.length >= 1 && rows[0].verified == 1) {
                        console.log(`Registering >${socket.id}< to database failed!`);
                        return socket.emit("REGISTERED", {
                            success: false,
                            error: "Already registered or not found in database"
                        });
                    }
                    if(data.id == rows[0].hwid || !rows[0].hwid) {
                        let secretId = ((Math.random() + 1).toString(36).substring(7));
                        deps.database.run(`UPDATE users SET secret = \"${secretId}\", hwid = \"${data.id}\" WHERE username = \"${data.osu.toLowerCase()}\"`, err => {
                            if(err) {
                                console.log(`Registering >${socket.id}< to database failed!`);
                                return socket.emit("REGISTERED", {
                                    success: false,
                                    error: "An error occurred while updating user"
                                });
                            }

                            socket.emit("REGISTERED", {
                                success: true,
                                secret: secretId,
                                error: "User successfully registered in database"
                            });

                            console.log(`Registering >${socket.id}< to database success!`);
                            deps.sockets[secretId] = socket;
                        });
                    }
                });
            });

            socket.on("LOGIN", data => {
                console.log(`New login request from >${socket.id}< ..`);
                deps.database.all(`SELECT username, secret, twitch FROM users WHERE username = \"${data.osu.toLowerCase()}\" AND secret = \"${data.secret}\"`, (err, rows) => {
                    if(err || rows.length <= 0) {
                        console.log(`Login from >${socket.id}< rejected!`);
                        return socket.emit("LOGGEDIN", {
                            success: false,
                            error: "User does not exist"
                        });
                    }

                    console.log(`Login from >${socket.id}< success!`);

                    socket.emit("LOGGEDIN", {
                        success: true,
                        error: "User successfully logged in"
                    });

                    deps.sockets[rows[0].secret] = socket;
                    deps.sockets[rows[0].secret].username = rows[0].username;
                    deps.sockets[rows[0].secret].twitch = rows[0].twitch;
                });
            });

            socket.on("REQUEST", secretId => {
                deps.database.all(`SELECT username FROM users WHERE secret = \"${secretId}\"`, (err, rows) => {
                    if(err || rows.length <= 0) return;
                    socket.emit("DATA", deps.osu[secretId]);
                });
            });

            socket.on("CLIENT", async data => {
                if(deps.sockets[data.secretId]) {
                    deps.Bancho.getData(data.secretId);

                    deps.Bancho.editData("Discord", false, data.secretId);
                    
                    deps.Bancho.editData("setId", data.Beatmap.setId, data.secretId);
                    deps.Bancho.editData("id", data.Beatmap.id, data.secretId);
                    deps.Bancho.editData("name", data.Beatmap.name, data.secretId);

                    deps.Bancho.editData("playing", data.Player.playing, data.secretId);
                    deps.Bancho.editData("skin", data.Player.skin, data.secretId);
                    deps.Bancho.editData("mods", { text: data.Player.mods.text, value: data.Player.mods.value }, data.secretId);

                    deps.Bancho.editData("accuracy", data.Stats.accuracy, data.secretId);
                    deps.Bancho.editData("n300", data.Stats.n300, data.secretId);
                    deps.Bancho.editData("n100", data.Stats.n100, data.secretId);
                    deps.Bancho.editData("n50", data.Stats.n50, data.secretId);
                    deps.Bancho.editData("nMisses", data.Stats.nMisses, data.secretId);
                    deps.Bancho.editData("combo", data.Stats.combo, data.secretId);
                    deps.Bancho.editData("passedObjects", data.Stats.passedObjects, data.secretId);
                }
            });

            socket.on("disconnect", () => {
                console.log(`>${socket.id}< disconnected from server`);
                for(let i in deps.sockets) if(deps.sockets[i].id == socket.id) delete deps.sockets[i];
            });
        });
        
        deps.httpServer.listen(2048, () => {
            console.log(`Listening on port ${deps.httpServer.address().port}!`);
        });

        deps.app.get("/", (req, res) => {
            if(req.session.loggedIn) {
                if(req.session.secretId) {
                    res.render("index", { username: req.session.osuData.username, avatar: req.session.osuData.avatar_url, secretId: req.session.secretId });
                }
                else {
                    res.status(200).send(`your account is not registered in the database, you should dm nzxl#6334\nhere is a random quote: \"I really love Fubuki. Like, a lot. Like, a whole lot. You have no idea. I love her so much that it is inexplicable, and I'm ninety-nine percent sure that I have an unhealthy obsession. I will never get tired of listening that sweet, angelic voice of her.\"`);
                }
            }
            else {
                res.redirect("/skill_issue");
            }
        });

        deps.app.get("/skill_issue", (req, res) => {
            if(!req.query.code) return res.redirect(`https://osu.ppy.sh/oauth/authorize?client_id=${process.env.OSU_CLIENT_ID}&redirect_uri=${process.env.OSU_REDIRECT_URI}&response_type=code&scope=identify`);
            deps.axios({
                method: "POST",
                url: "https://osu.ppy.sh/oauth/token",
                data: {
                    client_id: process.env.OSU_CLIENT_ID,
                    client_secret: process.env.OSU_CLIENT_SECRET,
                    code: req.query.code,
                    grant_type: "authorization_code",
                    redirect_uri: process.env.OSU_REDIRECT_URI
                },
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json"
                }
            }).then(result => {
                if(result && result.data.access_token) {
                    deps.axios({
                        method: "GET",
                        url: "https://osu.ppy.sh/api/v2/me/osu",
                        headers: {
                            Authorization: `Bearer ${result.data.access_token}`,
                            Accept: "application/json",
                            "Content-Type": "application/json"
                        }
                    }).then(r => {
                        deps.database.all(`SELECT secret FROM users WHERE username = \"${r.data.username.toLowerCase()}\"`, (err, rows) => {
                            if(err || rows.length <= 0) {
                                console.log(`${r.data.username} not registered.`);
                            }

                            req.session.loggedIn = true;
                            req.session.osuData = r.data;
                            req.session.secretId = rows.length >= 1 ? rows[0].secret : null;

                            res.redirect("/");
                        });
                    });
                }
            });
        });

        deps.app.get("/b", (req, res) => {
            res.status(200).send(`${deps.build}`);
        });
    }
}