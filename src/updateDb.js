require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");
const mongoClient = new MongoClient(process.env.MONGODB, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1, monitorCommands: true });
const { BeatmapCalculator } = require("@kionell/osu-pp-calculator");
const pp = new BeatmapCalculator();

(() => {
    mongoClient.connect(async err => {
        if(err) return console.log("MongoDB failed!");
        const db = mongoClient.db("osu");
        const mapData = db.collection("map_data");

        let mapIds = await mapData.distinct("setId");
        mapIds.forEach((m, i) => {
            setTimeout(() => {
                mapData.findOne({ setId: m }).then(async r => {
                    try {
                        if(r.name) return;

                        let map = await pp.calculate({ fileURL: `https://osu.ppy.sh/osu/${r.setId}` });
                        if(map.beatmapInfo.version == r.mapData.version) {
                            let mapName = `${map.beatmapInfo.artist} - ${map.beatmapInfo.title} [${map.beatmapInfo.version}]`;
                            await mapData.updateOne({ setId: m }, { $set: { name: mapName }});

                            console.log(`${map.beatmapInfo.artist} - ${map.beatmapInfo.title} [${map.beatmapInfo.version}] ${(i+"/"+mapIds.length)}`);
                        }

                    } catch (err) {
                        console.log(err);
                    }
                });
            }, (i+1)*1000);
        });

        console.log("Recalculating..");
    });
})();