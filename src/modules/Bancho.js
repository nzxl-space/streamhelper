const deps = require("../constants.js");

module.exports = class Bancho {
    createBancho() {

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
}