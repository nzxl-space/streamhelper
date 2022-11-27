process.noDeprecation = true;
process.on("unhandledRejection", error => console.error(error));
require("dotenv").config();
require("log-prefix")(() => { return `[nzxl.space | ${require("moment")(Date.now()).format("HH:mm:ss")}]` });

const c = require("./constants");

(async () => {
    await c.funcs.mongo.connect().then(console.log);
    await c.funcs.bancho.connect().then(console.log);
    await c.funcs.twitch.connect().then(console.log);
    await c.funcs.discord.connect().then(console.log);
    await c.funcs.webserver.createServer().then(console.log);
})();





