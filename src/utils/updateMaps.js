require("dotenv").config();
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
    const mapData = mongoClient.db("osu").collection("map_data");
    console.log("MongoDB connected!");

    let maps = await mapData.find(
        { 
            $or: 
            [
                { "mapData.status": "pending" },
                { "mapData.status": "wip" },
                { "mapData.status": "qualified" }
            ]
        }
    ).toArray();

    let s = {
        "-2": "graveyard",
        "-1": "wip",
        "0": "pending",
        "1": "ranked",
        "4": "loved",
        "3": "qualified"
    }

    console.time("Process time");

    let done = 0;
    let updt = setInterval(() => {
        console.log(`Done: ${done}/${maps.length}`);

        if(done >= maps.length) {
            clearInterval(updt);
            console.timeEnd("Process time");

            console.log("Done!!");
            process.exit();
        }
    }, 30*1000);

    for (let i = 0; i < maps.length; i++) {
        let map = await banchoClient.osuApi.beatmaps.getByBeatmapId(maps[i].mapData.id);
        if(map.length <= 0) {
            done++;
            continue;
        }

        if(maps[i].mapData.status != s[String(map[0].approved)]) {
            console.log(map[0].id, "needs an update", `[${maps[i].mapData.status} -> ${s[String(map[0].approved)]}]`);

            await mapData.updateOne({ "mapData.id": map[0].id }, { 
                $set: {
                    "mapData.status": s[String(map[0].approved)],
                    "mapData.ranked": map[0].approved,
                    "mapData.last_updated": map[0].lastUpdate,
                    "mapData.checksum": map[0].fileMd5
                }
            });
        }

        done++;
    }
});