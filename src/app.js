require('dotenv').config();
const deps = require("./constants.js");
require("log-prefix")(() => { return `[${deps.moment(Date.now()).format("HH:mm:ss")} | kiyomii's service]`; });
process.on("unhandledRejection", error => console.error("Promise rejection:", error));

setTimeout(() => {
    process.exit();
}, 12*60*60*1000);

(() => {
    // Create db file if not exists
    if(!deps.fs.existsSync("./storage.db")) {
        deps.fs.writeFileSync("./storage.db", null);
    }

    // Create maps folder if not exists
    if(!deps.fs.existsSync("./maps/")) {
        deps.fs.mkdirSync("./maps/");
    }

    // Load modules
    deps.fs.readdir(deps.path.join(__dirname, "modules"), (err, files) => {
        if(err) return console.log("No modules found");

        const module = {};

        files.forEach((file, i) => {
            moduleName = files[i].replace(/.js/, "");
            files[i] = require(deps.path.join(__dirname, "modules", file));
            module[`${moduleName}`] = new files[i];
        });

        
        module["WebSocket"].createServer();
        module["Bancho"].createBancho();
        module["Discord"].createDiscord();
        module["Twitch"].createTwitch();

        deps.Bancho = module["Bancho"];
    });
})();