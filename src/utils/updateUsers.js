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

    let oauth = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${process.env.TWITCH_CLIENT_ID}&client_secret=${process.env.TWITCH_CLIENT_SECRET}&grant_type=client_credentials`, { 
        method: "POST",
        retry: 3,
        pause: 5000
    });
    let twitchCreds = await oauth.json();

    let query = await users.find().toArray();

    for (let i = 0; i < query.length; i++) {
        let user = await banchoClient.osuApi.user.get(query[i].osu);
        if(!user || user.length <= 0) {
            console.log(`-----------------\n${query[i].twitch} not found`);
            continue;
        }

        fetch(`https://api.twitch.tv/helix/users?login=${query[i].twitch}`, {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": `Bearer ${twitchCreds.access_token}`,
                "Client-Id": process.env.TWITCH_CLIENT_ID
            },
            retry: 3,
            pause: 5000
        }).then(async (result) => {
            result = await result.json();
            if(result.data.length <= 0) {
                return console.log(`-----------------\n${query[i].twitch} not found`);
            }
            let twitchId = Number(result.data[0].id);

            console.log(`-----------------\n${query[i].osu} -> ${user.id}\n${query[i].twitch} -> ${twitchId}`);

            await users.updateOne({ userId: query[i].userId }, { $set: {
                osu_id: user.id,
                twitch_id: twitchId
            }});
        });
    }
});