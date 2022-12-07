require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");
const mongoClient = new MongoClient(process.env.MONGODB, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1, monitorCommands: true });

const moment = require("moment");
const median = require("median");

const { BeatmapCalculator } = require("@kionell/osu-pp-calculator");
const pp = new BeatmapCalculator();

const Banchojs = require("bancho.js");
const banchoClient = new Banchojs.BanchoClient({
    username: process.env.OSU_USERNAME,
    password: process.env.OSU_PASSWORD,
    apiKey: process.env.OSU_API_KEY
});

const Genres = {
    0: "Any",
    1: "Unspecified",
    2: "Video Game",
    3: "Anime",
    4: "Rock",
    5: "Pop",
    6: "Other",
    7: "Novelty",
    9: "Hip Hop",
    10: "Electronic",
    11: "Metal",
    12: "Classical",
    13: "Folk",
    14: "Jazz"
};

(async () => {
    if(!process.argv[2]) 
        return console.log("No user defined");

    let username = process.argv[2];
    let mod = process.argv[4] ? process.argv[4] : "";
    let howMany = process.argv[3] ? process.argv[3] : 1;

    await mongoClient.connect().catch(() => {
        console.log("MongoDB connection failed!")
        process.exit();
    });
    console.log("MongoDB connected!");
    const db = mongoClient.db("osu");

    const maps = db.collection("maps");
    const r = db.collection("recommendations");

    let user = await r.findOne({ user: username });
    if(!user || user.length <= 0) { // do the magic and collect basic info from user
        user = {
            user: username,
            stats: {
                bpm: [],
                stars: [],
                length: [],
                genre: [],
                pp: [],
                accuracy: []
            },
            r: []
        };

        let top_scores = await banchoClient.osuApi.user.getBest(username, 0, 100);
        for (let i = 0; i < top_scores.length; i++) {
            let score = top_scores[i];

            let map = await maps.findOne({ beatmap_id: score.beatmapId });
            if(map == null) continue;

            let accuracy = Math.round(100 * (score.count50*50 + score.count100*100 + score.count300*300) / (score.count50*300 + score.count100*300 + score.count300*300) * 100) / 100;

            user["stats"].pp.push(Math.round(score.pp));
            user["stats"].genre.push(Number(map.genre) ? map.genre : 0);
            user["stats"].bpm.push(map.stats.bpm);
            user["stats"].stars.push(map.stars);
            user["stats"].length.push(map.stats.length);
            user["stats"].accuracy.push(accuracy);
        }

        user["stats"].pp = median(user["stats"].pp);
        user["stats"].accuracy = Math.floor(user["stats"].accuracy.reduce((a, b) => a + b, 0) / user["stats"].accuracy.length * 100) / 100;

        user["stats"].bpm = Math.round(user["stats"].bpm.reduce((a, b) => a + b, 0) / user["stats"].bpm.length);
        user["stats"].length = Math.round(user["stats"].length.reduce((a, b) => a + b, 0) / user["stats"].length.length);

        user["stats"].stars = Math.round(user["stats"].stars.reduce((a, b) => a + b, 0) / user["stats"].stars.length);
        if(user["stats"].pp < 250 && user["stats"].stars >= 6) {
            user["stats"].stars -= 1;
        }
        if(user["stats"].pp >= 549 && user["stats"].stars <= 6) {
            user["stats"].stars += 1;
        }

        user["stats"].genre = user["stats"].genre.sort((a, b) => user["stats"].genre.filter(v => v === a).length - user["stats"].genre.filter(v => v === b).length).pop();

        await r.insertOne(user);
    }

    console.log(`${username} — ♫ ${Genres[user["stats"].genre]} | ♥ ${user["stats"].bpm} | ✩ ${user["stats"].stars} | ツ ${moment(user["stats"].length*1000).format("mm:ss")} | † ${user["stats"].pp}pp | ✪ ${user["stats"].accuracy}%`);

    /**
     * proposal
     * > if user average star rating is 6 star
     *  > nomod recommend from 6-7.4 stars
     *  > hr recommend up to 7 star and below
     *  > dt recommend from 4-5.3
     * AR and OD are not affected
     * Hidden Mod is not affected
     * FL, SO, SD/PF are not affected
     * EZ and Halftime could be affected, but for now I'll not bother
     * > if user accuracy is 95-97
     *  > then recommend pp.A
     *  > else recommend pp.X
     *  > Look for maps that are around the calculated average (pp.A+pp.S+pp.X)
     * Maps need to be ranked, loved or qualified
     * > if user genre is Anime
     *  > then include Pop, Video Game, Electronic
     * > if user genre is Metal
     *  > then include Rock and Anime
     * > otherwise include all genres
     * Maps length can't be longer than calculated average
     * Maps BPM can't be higher than calculated average
     * Check if the map has been recommended before
     *  > if there are no other recommendations available, clear the list
     *  > add the recommended map to the `already recommended maps` list (god i hate this)
     */

    let lookup = [];

    lookup.push({ 
        $or: [ 
            { status: "ranked" },
            { status: "loved" },
            { status: "qualified" }
        ]
    });

    lookup.push({ "stats.length": { $lt: Math.round(user["stats"].length / 10) * 10 }});
    lookup.push({ "stats.bpm": { $lt: Math.round(user["stats"].bpm / 10) * 10 }});
    
    if(user["stats"].genre == 3 || user["stats"].genre == 5 || user["stats"].genre == 2 || user["stats"].genre == 10) {  // Anime
        lookup.push({ 
            $or: [
                { "genre": 3 },
                { "genre": 5 },
                { "genre": 2 },
                { "genre": 10 }
            ]
        });
    } else if(user["stats"].genre == 11 || user["stats"].genre == 3 || user["stats"].genre == 4) {  // Metal
        lookup.push({ 
            $or: [
                { "genre": 11 },
                { "genre": 3 },
                { "genre": 4 },
                { "genre": 2 }
            ]
        });
    } else {
        lookup.push({ 
            $or: [
                { "genre": 2 },
                { "genre": 3 },
                { "genre": 4 },
                { "genre": 5 },
                { "genre": 9 },
                { "genre": 10 },
                { "genre": 11 },
                { "genre": 14 },
            ]
        });
    }

    if(mod.toUpperCase() == "HR") {
        lookup.push({ "stars": { $gt: (user["stats"].stars - .5) } });
        lookup.push({ "stars": { $lt: (user["stats"].stars + 1) } });

        if(user["stats"].accuracy % 100 < 97) {
            lookup.push({ "pp.X": { $gt: Math.round(user["stats"].pp*0.9) }})
            lookup.push({ "pp.X": { $lt: Math.round(user["stats"].pp*1.1) }})
        } else if(user["stats"].accuracy % 100 > 97) {
            lookup.push({ "pp.X": { $gt: Math.round(user["stats"].pp*0.9) }})
            lookup.push({ "pp.X": { $lt: Math.round(user["stats"].pp*1.4) }})
        }
    } else if(mod.toUpperCase() == "DT") {
        lookup.push({ "stars": { $gt: (user["stats"].stars - 2) } });
        lookup.push({ "stars": { $lt: (user["stats"].stars + .5) } });

        if(user["stats"].accuracy % 100 < 97) {
            lookup.push({ "pp.A": { $lt: Math.round(user["stats"].pp/2.5) }})
        } else if(user["stats"].accuracy % 100 > 97) {
            lookup.push({ "pp.X": { $lt: Math.round(user["stats"].pp/2) }})
        }
    } else {
        lookup.push({ "stars": { $gt: (user["stats"].stars) } });

        if(user["stats"].pp <= 549) {
            lookup.push({ "stars": { $lt: (user["stats"].stars + 1.5) } });
        } else if(user["stats"].pp >= 550) {
            lookup.push({ "stars": { $lt: (user["stats"].stars + 2) } });
        }

        if(user["stats"].accuracy % 100 < 97) {
            lookup.push({ "pp.A": { $lt: Math.round(user["stats"].pp*0.9) }})
            lookup.push({ "pp.A": { $lt: Math.round(user["stats"].pp*1.1) }})
        } else if(user["stats"].accuracy % 100 > 97) {
            lookup.push({ "pp.X": { $gt: Math.round(user["stats"].pp*0.9) }})
            lookup.push({ "pp.X": { $lt: Math.round(user["stats"].pp*1.4) }})
        }
    }

    let results = shuffle(await maps.find({ $and: lookup }).toArray()); // shuffle results
    results = results.filter(x => user["r"].includes(x.beatmap_id) == false);

    if(results.length <= 0) {
        await r.updateOne({ user: username }, { $set: { r: [] } }); // reset list
        results = shuffle(await maps.find({ $and: lookup }).toArray()); // shuffle results
    }

    results = results.splice(0, howMany); // how many requests uwu

    console.log(`Found ${results.length} recommendations!`);

    for(let i = 0; i < results.length; i++) {
        let map = results[i];

        if(mod.toUpperCase() == "DT" || mod.toUpperCase() == "HR") {
            let c = await pp.calculate({
                beatmapId: map.beatmap_id,
                mods: mod.toUpperCase()
            });

            map.pp.S = c.performance[1].totalPerformance;
            map.pp.X = c.performance[2].totalPerformance;
            map.stars = Math.round(c.difficulty.starRating * 100) / 100;
            map.stats.ar = Math.round(c.beatmapInfo.approachRate * 100) / 100;
            map.stats.bpm = Math.round(c.beatmapInfo.bpmMode * 100) / 100;
            map.stats.length = c.beatmapInfo.length;
        } 

        let recommend = {
            id: map.beatmap_id,
            name: `[https://osu.ppy.sh/b/${map.beatmap_id} ${map.name}]`,
            mapper: map.creator,
            pp: `~${Math.floor(map.pp.S*1.05)}pp`,
            status: `${map.status[0].toUpperCase()}${map.status.slice(1)}`,
            stats: `★ ${map.stars}, AR ${map.stats.ar}, BPM ${map.stats.bpm} - ${moment(map.stats.length*1000).format("mm:ss")}`,
            mods: mod.toUpperCase() == "DT" || mod.toUpperCase() == "HR" ? `+${mod.toUpperCase()} ` : ""
        }

        await r.updateOne({ user: username }, { $push: { r: map.beatmap_id } });
        console.log(`[${recommend.status}] × ${recommend.name} ${recommend.mods}| (${recommend.stats}) | ${recommend.pp}`);
    }

    process.exit();
})();

// https://stackoverflow.com/a/2450976
function shuffle(array) {
    let currentIndex = array.length,  randomIndex;

    // While there remain elements to shuffle.
    while (currentIndex != 0) {

    // Pick a remaining element.
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [
        array[randomIndex], array[currentIndex]];
    }

    return array;
}
  