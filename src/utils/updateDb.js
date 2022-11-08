/* eslint-disable no-unreachable, no-undef */
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
    return;

    mongoClient.connect(async err => {
        if(err) return console.log("MongoDB failed!");
        const db = mongoClient.db("osu");
        const mapData = db.collection("map_data");

        // ADD GENRE
        //let needUpdate = await mapData.find({ "mapData.genre": null }).toArray();
        for(let i = 0; i < needUpdate.length; i++) {
            let map = await banchoClient.osuApi.beatmaps.getBySetId(needUpdate[i].setId);
            if(!map || map.length <= 0) {
                console.log(`${needUpdate[i].setId} failed! (${(i+1)}/${needUpdate.length})`);
                continue;
            }

            mapData.updateOne({ "mapData.id": needUpdate[i].mapData.id }, { $set: { "mapData.genre": map[0].genre }})
            .then(console.log(`${needUpdate[i].setId} updated! (${(i+1)}/${needUpdate.length})`));

            if((i+1) >= needUpdate.length) {
                console.log("Done!!");
                process.exit();
            }

            await new Promise(p => setTimeout(p, 50));
        }

        // REMOVE SCORE OBJECT
        // let needUpdate = await mapData.find({ "mapData.score": { $exists: true } }).toArray();
        for(let i = 0; i < needUpdate.length; i++) {
            mapData.updateOne({ "mapData.id": needUpdate[i].mapData.id }, { $unset: { "mapData.score": 1 }})
            .then(console.log(`${needUpdate[i].setId} updated! (${(i+1)}/${needUpdate.length})`));

            if((i+1) >= needUpdate.length) {
                console.log("Done!!");
                process.exit();
            }

            await new Promise(p => setTimeout(p, 50));
        }

        // Remove invalid maps
        //let needUpdate = await mapData.find({ "mapData.score": { $exists: true } }).toArray();
        for(let i = 0; i < needUpdate.length; i++) {
            mapData.deleteOne({ "mapData.id": needUpdate[i].mapData.id })
            .then(console.log(`${needUpdate[i].setId} updated! (${(i+1)}/${needUpdate.length})`));

            if((i+1) >= needUpdate.length) {
                console.log("Done!!");
                process.exit();
            }

            await new Promise(p => setTimeout(p, 50));
        }

        // UPDATE CREATOR AND MISMATCHED SETID
        //let needUpdate = await mapData.find({ "mapData.creator": null }).toArray();
        for(let i = 0; i < needUpdate.length; i++) {

            if(needUpdate[i].setId !== needUpdate[i].mapData.beatmapset_id) {
                await mapData.updateOne({ "setId": needUpdate[i].setId }, { $set: { "setId": needUpdate[i].mapData.beatmapset_id}})
            }

            let map = await banchoClient.osuApi.beatmaps.getBySetId(needUpdate[i].mapData.beatmapset_id);
            if(!map || map.length <= 0) {
                console.log(`${needUpdate[i].setId} failed! (${(i+1)}/${needUpdate.length})`);
                continue;
            }

            mapData.updateOne({ "mapData.id": needUpdate[i].mapData.id }, { $set: { "mapData.creator": map[0].creator }})
            .then(console.log(`${needUpdate[i].setId} updated! (${(i+1)}/${needUpdate.length})`));

            if((i+1) >= needUpdate.length) {
                console.log("Done!!");
                process.exit();
            }

            await new Promise(p => setTimeout(p, 50));
        }

        // delete duplicates
        //let needUpdate = await mapData.aggregate([ {"$group" : { "_id": "$mapData.id", "count": { "$sum": 1 } } }, {"$match": {"_id" :{ "$ne" : null } , "count" : {"$gt": 1} } },  {"$project": {"mapData.id" : "$_id", "_id" : 0} } ]).toArray();
        for(let i = 0; i < needUpdate.length; i++) {
            console.log(needUpdate[i].mapData.id);

            mapData.deleteOne({ "mapData.id": needUpdate[i].mapData.id })
            .then(console.log(`${needUpdate[i].setId} updated! (${(i+1)}/${needUpdate.length})`));

            if((i+1) >= needUpdate.length) {
                console.log("Done!!");
                process.exit();
            }

            await new Promise(p => setTimeout(p, 50));
        }
    });
})();