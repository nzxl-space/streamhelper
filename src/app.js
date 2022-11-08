process.noDeprecation = true;
process.on("unhandledRejection", error => console.error(error));
require("dotenv").config();
require("log-prefix")(() => { return `[nzxl.space | ${require("moment")(Date.now()).format("HH:mm:ss")}]` });

(async () => {
    const MongoDB = require("./modules/mongodb");
    let mongoDB = new MongoDB(process.env.MONGODB, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: "1", monitorCommands: true });

    await mongoDB.connect().then(console.log(`MongoDB connected!`));
    module.exports.mongoDB = mongoDB;

    // -------------------------------

    const Discord = require("./modules/discord");
    let discord = new Discord(process.env.DISCORD_TOKEN, process.env.DISCORD_GUILD, process.env.DOWNLOADURL);

    await discord.connect();
    module.exports.discord = discord;

    console.log(`Discord connected as ${discord.discordClient.user.tag}!`);

    // -------------------------------

    const Bancho = require("./modules/bancho");
    let bancho = new Bancho(process.env.OSU_USERNAME, process.env.OSU_PASSWORD, process.env.OSU_API_KEY, process.env.OSU_CLIENT_ID, process.env.OSU_CLIENT_SECRET, process.env.OSURENDER, process.env.DOWNLOADURL);

    await bancho.connect().then(console.log(`Bancho connected as ${process.env.OSU_USERNAME}!`));
    module.exports.bancho = bancho;

    // -------------------------------

    const Twitch = require("./modules/twitch");
    let twitch = new Twitch(process.env.TWITCH_USERNAME, process.env.TWITCH_PASSWORD, process.env.TWITCH_CLIENT_ID, process.env.TWITCH_CLIENT_SECRET);

    await twitch.connect().then(console.log(`Twitch connected as ${process.env.TWITCH_USERNAME}!`));
    module.exports.twitch = twitch;

    // -------------------------------

    const Express = require("./modules/express.js");
    let express = new Express(process.env.PORT || 2048, process.env.DISCORD_PUBLIC, process.env.DISCORD_SECRET, process.env.DISCORD_REDIRECT_URI, process.env.DISCORD_TOKEN, process.env.DISCORD_GUILD);

    await express.createServer().then(console.log(`Listening on port ${process.env.PORT || 2048}!`));
    module.exports.express = express;
})();





