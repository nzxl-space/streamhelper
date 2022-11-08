require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");
const mongoClient = new MongoClient(process.env.MONGODB, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1, monitorCommands: true });
const { BeatmapCalculator } = require("@kionell/osu-pp-calculator");
const pp = new BeatmapCalculator();

const Banchojs = require("bancho.js");
const banchoClient = new Banchojs.BanchoClient(
    {
        username: "kiyomii",
        password: "123",
        apiKey: process.env.OSU_API_KEY
    }
);

(() => {
    mongoClient.connect(async err => {
        if(err) return console.log("MongoDB failed!");
        const db = mongoClient.db("osu");
        const mapData = db.collection("map_data");

        let mapIds = await mapData.distinct("setId");
        mapIds.forEach((m, i) => {
            setTimeout(() => {
                mapData.findOne({ setId: m }).then(async r => {
                    // try {
                    //     if(r.name) return;

                    //     let map = await pp.calculate({ fileURL: `https://osu.ppy.sh/osu/${r.setId}` });
                    //     if(map.beatmapInfo.version == r.mapData.version) {
                    //         let mapName = `${map.beatmapInfo.artist} - ${map.beatmapInfo.title} [${map.beatmapInfo.version}]`;
                    //         await mapData.updateOne({ setId: m }, { $set: { name: mapName }});

                    //         console.log(`${map.beatmapInfo.artist} - ${map.beatmapInfo.title} [${map.beatmapInfo.version}] ${(i+"/"+mapIds.length)}`);
                    //     }

                    // } catch (err) {
                    //     console.log(err);
                    // }

                    // if(r.setId !== r.mapData.beatmapset_id) {
                    //     await mapData.updateOne({ setId: m }, { $set: { setId: r.mapData.beatmapset_id }});
                    //     console.log(i);
                    // }


                    if(!r.mapData["genre"]) {
                        let map = await banchoClient.osuApi.beatmaps.getBySetId(r.setId);
                        if(!map || map.length <= 0) return;

                        await mapData.updateOne({ setId: m }, { $set: { "mapData.genre": map[0].genre }});
                        console.log(i);
                    }
                });
            }, (i+1)*1500);
        });

        console.log("Recalculating..");
    });
})();