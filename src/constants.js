const tmi = require("tmi.js");
const twitchClient = new tmi.Client({
    identity: {
        username: process.env.TWITCH_USERNAME,
        password: process.env.TWITCH_PASSWORD
    }
});
const Banchojs = require("bancho.js");
const banchoClient = new Banchojs.BanchoClient({
    username: process.env.OSU_USERNAME,
    password: process.env.OSU_PASSWORD,
    apiKey: process.env.OSU_API_KEY
});
const { Client, Intents } = require("discord.js");
const discordClient = new Client({
    partials: ["CHANNEL"],
    intents: [ 
        Intents.FLAGS.GUILDS, 
        Intents.FLAGS.GUILD_MESSAGES, 
        Intents.FLAGS.GUILD_MEMBERS, 
        Intents.FLAGS.GUILD_PRESENCES, 
        Intents.FLAGS.DIRECT_MESSAGES, 
        Intents.FLAGS.DIRECT_MESSAGE_TYPING 
    ]
});
const DiscordOauth2 = require("discord-oauth2");
const oauth = new DiscordOauth2();
const { MongoClient } = require("mongodb");
const mongoClient = new MongoClient(process.env.MONGODB, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: "1", monitorCommands: true });

const { BeatmapCalculator } = require("@kionell/osu-pp-calculator");
const pp = new BeatmapCalculator();

const express = require("express");
const { createServer } = require("http");

const app = express();
app.set("view engine", "ejs");
app.set("views", require("path").join(__dirname, "..", "static"));
app.use(express.static(require("path").join(__dirname, "..", "static")));

const httpServer = createServer(app);

exports.client = {
    twitch: twitchClient,
    bancho: banchoClient,
    discord: discordClient,
    discordApi: oauth,
    mongo: mongoClient,
    socket: require("socket.io-client"),
    calculator: pp
}

exports.webserver = {
    httpServer: httpServer,
    app: app
}

exports.lib = {
    fetch: require("node-fetch-retry"),
    moment: require("moment"),
    FormData: require("form-data"),
    nodesu: {
        LookupType: require("nodesu").LookupType
    },
    discord: {
        MessageEmbed: require("discord.js").MessageEmbed
    },
    path: require("path"),
    clone: require("clone")
}

exports.database = {
    users: null,
    maps: null,
    userCount: null
}

exports.storage = {
    patterns: {
        presence: /^(.*?)\(rank\s#(?:\d+)(?:,\d{1,3}|,\d{1,3},\d{1,3})?\)/,
        set_id: /(?<=beatmapsets\/|\/s\/)\d+/,
        beatmap_id: /(?<=beatmaps\/|b\/|#osu\/|#taiko\/|#fruits\/|#mania\/)\d+/,
        beatmap_mods: /(?<=\+)(?:NF|EZ|HD|HR|(SD|PF)|(NC|DT)|RX|HT|FL|SO)+/ig,
        accuracy: /100[%]|[123456789][0-9][%]|[0-9][%]/g
    },
    statusEnum: {
        "-2": "graveyard",
        "-1": "wip",
        "0": "pending",
        "1": "ranked",
        "4": "loved",
        "3": "qualified"
    },
    discordURL: `https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_PUBLIC}&redirect_uri=${process.env.DISCORD_REDIRECT_URI}&response_type=code&scope=identify%20connections%20guilds.join`,
    user: {
        currentlyPlaying: {},
        lastChecked: {},
        cache: {}
    },
    tokens: {
        twitch: {
            token: null,
            expires: 0
        },
        osu: {
            token: null,
            expires: 0
        }
    },
    block: []
}

exports.funcs = {
    twitch: {
        connect: require("./modules/twitch").connect,
        isLive: require("./modules/twitch").isLive,
        getUsername: require("./modules/twitch").getUsername,
        getId: require("./modules/twitch").getId
    },
    discord: {
        connect: require("./modules/discord").connect,
        deleteUser: require("./modules/discord").deleteUser,
        updateRole: require("./modules/discord").updateRole,
        sendMessage: require("./modules/discord").sendMessage,
        buildEmbed: require("./modules/discord").buildEmbed
    },
    bancho: {
        connect: require("./modules/bancho").connect,
        getScores: require("./modules/bancho").getScores,
        getBeatmap: require("./modules/bancho").getBeatmap
    },
    mongo: {
        connect: require("./modules/mongodb").connect
    },
    webserver: {
        createServer: require("./modules/express").createServer
    }
}