const deps = require("../constants.js");

module.exports = class WebSocket {
    createServer() {
        deps.database.run("CREATE TABLE IF NOT EXISTS users (username varchar(20) NOT NULL PRIMARY KEY, twitch varchar(20) NULL, discord bigint(20) NULL, secret int(8) NULL, hwid varchar(50) NULL, verified tinyint(1) DEFAULT 0)");

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
                                error: "User successfully registered in database"
                            });
                            console.log(`Registering >${socket.id}< to database success!`);
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

            socket.on("CLIENT", data => {
                if(deps.sockets[data.secretId]) {
                    console.log(data);
                }
            });

            socket.on("disconnect", () => {
                console.log(`>${socket.id}< disconnected from server`);
                for(i in deps.sockets) if(deps.sockets[i].id == socket.id) delete deps.sockets[i];
            });
        });
        
        deps.httpServer.listen(2048, () => {
            console.log(`Listening on port ${deps.httpServer.address().port}!`);
            deps.app.use(deps.express.static(deps.path.join(__dirname, "..", "static")));
        });
    }
}