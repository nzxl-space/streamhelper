process.noDeprecation = true;
process.on("unhandledRejection", error => console.error(error));
require("dotenv").config();
require("log-prefix")(() => { return `[nzxl.space | ${require("moment")(Date.now()).format("HH:mm:ss")}]` });

const c = require("./constants");

(async () => {

    return console.log(c.lib.moment(Math.floor(Date.now()*1000)/1000).month());
    if(!c.lib.fs.existsSync(c.lib.path.join(__dirname, "logs", c.lib.moment(Date.now).month()))) {
        c.lib.fs.mkdirSync(c.lib.path.join(__dirname, "logs"));
    }

    setInterval(() => { // simple data log

    }, 30*60*1000);

    await c.funcs.mongo.connect().then(console.log);
    await c.funcs.bancho.connect().then(console.log);
    await c.funcs.twitch.connect().then(console.log);
    await c.funcs.discord.connect().then(console.log);
    await c.funcs.webserver.createServer().then(console.log);
})();





