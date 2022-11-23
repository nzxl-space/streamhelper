require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");
const mongoClient = new MongoClient(process.env.MONGODB, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1, monitorCommands: true });

const fs = require("fs");
const path = require("path");
const cacheDir = path.join(__dirname, "..", "cache");

const { Downloader, DownloadEntry, DownloadType } = require("osu-downloader");
const downloader = new Downloader({
    rootPath: cacheDir,
    filesPerSecond: 2, // Limit to 2 files per second.
    synchronous: true, // Download each file one by one.
});

mongoClient.connect(async err => {
    if(err) return console.log("MongoDB failed!");

    const mapData = mongoClient.db("osu").collection("map_data");

    console.log("MongoDB connected!");

    let toDownload = [];
    let existing = fs.readdirSync(cacheDir);
    let maps = await mapData.distinct("setId");

    maps = maps.filter(x => !existing.includes(`${x}.osz`));

    for (let i = 0; i < maps.length; i++) {
        let map = maps[i];

        toDownload.push(new DownloadEntry({
            id: map,
            customName: map,
            type: DownloadType.Set
        }));

        console.log(i+1, "/", maps.length);

        if(i+1 >= maps.length) {
            console.log(`Downloading ${maps.length} maps..`);

            downloader.addMultipleEntries(toDownload);

            setInterval(() => {
                console.log(downloader.progress);
            }, 100);

            await downloader.downloadAll();

            console.log("Finished downloading maps!");
        }
    }

});