require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");
const mongoClient = new MongoClient(process.env.MONGODB, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1, monitorCommands: true });
const { BeatmapCalculator } = require("@kionell/osu-pp-calculator");
const { Downloader, DownloadEntry, DownloadType } = require("osu-downloader");
const path = require("path");
const downloader = new Downloader({
    rootPath: path.join(__dirname, "..", "cache"),
    filesPerSecond: 2, // Limit to 2 files per second.
    synchronous: true, // Download each file one by one.
});
const pp = new BeatmapCalculator();
const Banchojs = require("bancho.js");
const banchoClient = new Banchojs.BanchoClient({
    username: process.env.OSU_USERNAME,
    password: process.env.OSU_PASSWORD,
    apiKey: process.env.OSU_API_KEY
});

(() => {
    mongoClient.connect(async err => {
        if(err) return console.log("MongoDB failed!");
        const db = mongoClient.db("osu");
        const mapData = db.collection("map_data");

        let entries = [];
        let maps = await mapData.find().toArray();

        for (let i = 0; i < maps.length; i++) {
            let map = maps[i];

            console.log(i+1, "/", maps.length);
            
            entries.push(new DownloadEntry({ 
                id: map.mapData.beatmapset_id, 
                customName: `${map.mapData.beatmapset_id}`,
                type: DownloadType.Set,
                redownload: true
            }));

            if(i+1 >= maps.length) {
                console.log("maps to download:", entries.length);

                downloader.addMultipleEntries(entries);
                await downloader.downloadAll();

                console.log("done");
            }
        }
    });
})();