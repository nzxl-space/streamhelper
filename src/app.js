process.noDeprecation = true;
require("dotenv").config();

const moment = require("moment");
require("log-prefix")(() => { return `[nzxl.space | ${moment(Date.now()).format("HH:mm:ss")}]`; });
process.on("unhandledRejection", error => console.error(error));

const bancho = require("./modules/bancho.js");
new bancho(process.env.OSU_USERNAME, process.env.OSU_PASSWORD, process.env.OSU_API_KEY, process.env.OSU_CLIENT_ID, process.env.OSU_CLIENT_SECRET, process.env.OSURENDER);

const { ServerApiVersion } = require("mongodb");
const mongodb = require("./modules/mongodb.js");
// new mongodb(process.env.MONGODB, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1, monitorCommands: true });

const discord = require("./modules/discord.js");
// new discord(process.env.DISCORD_TOKEN, process.env.DISCORD_GUILD, process.env.DOWNLOADURL);

const express = require("./modules/express.js");
const logger = require("./modules/logger.js");
const twitch = require("./modules/twitch.js");