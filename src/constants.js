// Utils
const moment = require("moment");
const path = require("path");
const fs = require("fs");
const https = require("https");
const axios = require("axios");
const Regex = {
    setId: /(?<=osu\.ppy\.sh\/s\/)(?:[0-9]+)|(?<!osu\.ppy\.sh\/beatmapsets\/)(?![0-9]+#osu\/)(?:[0-9]+)/,
    beatmapId: /(?<=osu\.ppy\.sh\/b\/)(?:[0-9]+)|(?<=osu\.ppy\.sh\/beatmapsets\/)(?:[0-9]+)/,
    beatmapMods: /\+(NF|EZ|HD|HR|(SD|PF)|(NC|DT)|RX|HT|FL|SO)/ig
};

// Twitch
const tmi = require("tmi.js");
const twitchClient = new tmi.Client({
    identity: {
        username: process.env.TWITCH_USERNAME,
        password: process.env.TWITCH_PASSWORD
    }
});

// osu!
const Banchojs = require("bancho.js");
const banchoClient = new Banchojs.BanchoClient({
    username: process.env.OSU_USERNAME,
    password: process.env.OSU_PASSWORD,
    apiKey: process.env.OSU_API_KEY
});
const pp = require("rosu-pp");

// Discord
const { Client, Intents } = require("discord.js");
const discordClient = new Client({
    partials: ["CHANNEL"],
    intents: [ Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_PRESENCES, Intents.FLAGS.DIRECT_MESSAGES, Intents.FLAGS.DIRECT_MESSAGE_TYPING ]
});

// Storage
const sqlite3 = require("sqlite3");
const database = new sqlite3.Database("./storage.db");
const sockets = {};
const osu = {};

// Websocket
const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const app = express();
const session = require("express-session");
const cookieParser = require("cookie-parser");
app.use(cookieParser());
app.use(session({
    secret: "727WYSIONGOD",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "static"));
app.use(express.static(path.join(__dirname, "static")));
const httpServer = createServer(app);
const io = new Server(httpServer);

// Updater
const versionString = process.env.VERSION;

module.exports = {
    moment: moment,
    path: path,
    fs: fs,
    https: https,
    pp: pp,
    sockets: sockets,
    express: express,
    twitchClient: twitchClient,
    banchoClient: banchoClient,
    discordClient: discordClient,
    database: database,
    app: app,
    httpServer: httpServer,
    io: io,
    axios: axios,
    Regex: Regex,
    build: versionString,
    osu: osu
};