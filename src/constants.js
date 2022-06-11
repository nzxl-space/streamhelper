// Utils
const moment = require("moment");
const path = require("path");
const fs = require("fs");
const https = require("https");

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
    intents: [ 
        Intents.FLAGS.GUILDS, 
        Intents.FLAGS.GUILD_PRESENCES, 
        Intents.FLAGS.GUILD_MEMBERS, 
        Intents.FLAGS.GUILD_MESSAGES, 
        Intents.FLAGS.GUILD_WEBHOOKS, 
        Intents.FLAGS.DIRECT_MESSAGES 
    ]
});

// Storage
const sqlite3 = require("sqlite3");
const database = new sqlite3.Database("./storage.db");
const sockets = {};

// Websocket
const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

module.exports = Object.freeze({
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
    io: io
});