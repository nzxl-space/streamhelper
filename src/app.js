process.noDeprecation = true;
process.on("unhandledRejection", error => console.error(error));
require("dotenv").config();
require("log-prefix")(() => { return `[nzxl.space | ${require("moment")(Date.now()).format("HH:mm:ss")}]` });

const c = require("./constants");

(async () => {
    setInterval(async () => {
        await c.funcs.upload(c.storage.log, process.env.S3);
    }, 1*60*60*1000)

    await c.funcs.mongo.connect().then(console.log);
    await c.funcs.bancho.connect().then(console.log);
    await c.funcs.twitch.connect().then(console.log);
    await c.funcs.discord.connect().then(console.log);
    await c.funcs.webserver.createServer().then(console.log);
})();





