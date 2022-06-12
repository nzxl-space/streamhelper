const deps = require("../constants.js");

module.exports = class WebSocket {
    createServer() {
        deps.database.run("CREATE TABLE IF NOT EXISTS users (username varchar(20) NOT NULL PRIMARY KEY, twitch varchar(20) NULL, discord bigint(20) NULL, secret int(8) NULL, hwid varchar(50) NULL, verified tinyint(1) DEFAULT 0)");
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
                    if(data.id == rows[0].hwid || !rows[0].hwid & rows[0].verified == 0) {
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

            socket.on("WEB", data => {
                console.log(`New web request from >${socket.id}< ..`);
                if(deps.sockets[data]) {
                    socket.join(`${data}`);
                    console.log(`Web request from >${socket.id}< identified as ${deps.sockets[data].username}!`);
                }
            });

            socket.on("CLIENT", async data => {
                if(deps.sockets[data.secretId]) {
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

                    console.log(await deps.Bancho.getData(data.secretId));
                }
            });

            socket.on("disconnect", () => {
                console.log(`>${socket.id}< disconnected from server`);
                for(let i in deps.sockets) if(deps.sockets[i].id == socket.id) delete deps.sockets[i];
            });
        });
        
        deps.httpServer.listen(2048, () => {
            console.log(`Listening on port ${deps.httpServer.address().port}!`);
            deps.app.use(deps.express.static(deps.path.join(__dirname, "..", "static")));
        });

        deps.app.get("/b", (req, res) => {
            res.status(200).send(`${deps.build}`);
        });
    }
}