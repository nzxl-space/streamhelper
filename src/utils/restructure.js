require("dotenv").config();
const fetch = require("node-fetch-retry");

const { MongoClient, ServerApiVersion } = require("mongodb");
const mongoClient = new MongoClient(process.env.MONGODB, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1, monitorCommands: true });

const Banchojs = require("bancho.js");
const banchoClient = new Banchojs.BanchoClient({
    username: process.env.OSU_USERNAME,
    password: process.env.OSU_PASSWORD,
    apiKey: process.env.OSU_API_KEY
});

mongoClient.connect(async err => {
    if(err) return console.log("MongoDB failed!");
    const users = mongoClient.db("osu").collection("users");
    console.log("MongoDB connected!");

    let query = await users.find().toArray();

    return; // inb4 i execute this again smh my dumbass

    for (let i = 0; i < query.length; i++) {
        await users.insertOne({
            id: Number(query[i].userId),
            identifier: `${query[i].discordName}`,
            twitch_id: Number(query[i].twitch_id),
            osu_id: Number(query[i].osu_id),
            silenced: query[i].silenced ? query[i].silenced : false,
            silencedReq: query[i].silencedReq ? query[i].silencedReq : false,
            blacklist: query[i].blacklist ? query[i].blacklist : [],
            replays: query[i].replays ? query[i].replays : [],
            activityRetryCount: 0
        });

        await users.deleteOne({ userId: query[i].userId });
    }
});