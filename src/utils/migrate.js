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
    const newMaps = mongoClient.db("osu").collection("maps");
    console.log("MongoDB connected!");

    let maps = await mapData.find().toArray();

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

        let dbLookup = await newMaps.findOne({ beatmap_id: maps[i].mapData.id });
        if(!dbLookup || dbLookup.length <= 0) {
            await newMaps.insertOne({
                name: maps[i].name,
                beatmap_id: maps[i].mapData.id,
                beatmapset_id: maps[i].mapData.beatmapset_id,
                stars: maps[i].mapData.difficulty_rating,
                version: maps[i].mapData.version,
                status: maps[i].mapData.status,
                creator: maps[i].mapData.creator,
                genre: maps[i].mapData.genre,
                stats: {
                    length: maps[i].mapData.total_length,
                    ar: maps[i].mapData.ar,
                    od: maps[i].mapData.accuracy,
                    cs: maps[i].mapData.cs,
                    hp: maps[i].mapData.drain,
                    combo: maps[i].mapData.max_combo,
                    circles: maps[i].mapData.count_circles,
                    sliders: maps[i].mapData.count_sliders,
                    spinners: maps[i].mapData.count_spinners,
                    bpm: maps[i].mapData.bpm
                },
                pp: {
                    A: maps[i].ppData.A,
                    S: maps[i].ppData.S,
                    X: maps[i].ppData.X
                }
            });
        }

        console.log(`${maps[i].name} done!`);

        done++;
    }
});