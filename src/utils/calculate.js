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

const genreEnum = {
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
}

const modsEnum = {
    NF: 1<<0,
    EZ: 1<<1,
    HD: 1<<3,
    HR: 1<<4,
    SD: 1<<5,
    PF: 1<<14,
    NC: 1<<9,
    DT: 1<<6,
    RX: 1<<7,
    HT: 1<<8,
    FL: 1<<10,
    SO: 1<<12
}

mongoClient.connect(async err => {
    if(err) return console.log("MongoDB failed!");
    const mapData = mongoClient.db("osu").collection("map_data");
    console.log("MongoDB connected!");

    // await banchoClient.connect().then(console.log("Bancho connected!"));

    let username = "kiyomii";
    let howMany = 10;
    let data = { scores: await banchoClient.osuApi.user.getBest(username, 0, 100), performance: [], bpm: [], genre: [], stars: [] };

    console.time("Process time");
    let done = false;

    let i = 0;
    for (i = 0; i < data["scores"].length; i++) {
        let score = data.scores[i];
        let beatmap;

        let map = await mapData.findOne({ "mapData.id": score.beatmapId });
        if(map == null) continue;

        beatmap = map.mapData;

        data["performance"].push(Math.round(score.pp));
        data["genre"].push(Number(beatmap.genre) ? beatmap.genre : 0);
        data["bpm"].push(beatmap.bpm);
        data["stars"].push(beatmap.difficulty_rating);
        
        console.log(score.scoreId, `DONE (${(i+1)}/${data["scores"].length})`);
    }

    while ((i+1) <= data["scores"].length) {
        await new Promise(p => setTimeout(p, 25));
    }
    
    let genre = genreEnum[data["genre"].sort((a, b) => data["genre"].filter(v => v === a).length - data["genre"].filter(v => v === b).length).pop()];
    let performance = median(data["performance"]);
    let bpm = Math.floor(data["bpm"].reduce((a, b) => a + b, 0) / data["bpm"].length);
    let sr = Math.round(data["stars"].reduce((a, b) => a + b, 0) / data["stars"].length)-Number(String(data["stars"].length).slice(-1)*0.1);

    console.log(`${username} — Genre: ${genre} | Avg. BPM ${bpm} | Min. SR: ${sr} | Performance: ${performance}pp`);
    
    let found = [];
    let lookup = await mapData.find(
        { 
            $and: 
            [
                { "ppData.A": { $gt: Math.round(performance*0.75) }},
                { "ppData.X": { $lt: Math.round(performance*1.75) }},
                { "mapData.bpm": { $gt: Math.round(bpm-20) }},
                { "mapData.bpm": { $lt: Math.round(bpm+10) }},
                { "mapData.genre": (Object.values(genreEnum).map(v => v).indexOf(genre)+1) },
                { "mapData.difficulty_rating": { $gt: sr }},
                { "mapData.difficulty_rating": { $lt: (sr+0.5) }},
                { "mapData.status": "ranked" }
            ]
        }
    ).toArray();

    while (found.length < howMany) {
        if(lookup.length <= 0) break;
        if(found.length == lookup.length) break;

        let r = lookup[Math.floor((Math.random()*lookup.length))];
        if(found.filter(map => map.id == r.mapData.id).length >= 1) continue;

        found.push({
            id: r.mapData.id,
            name: `[https://osu.ppy.sh/b/${r.mapData.id} ${r.name}]`,
            mapper: r.mapData.creator,
            pp: `~${Math.floor((r.ppData.A+r.ppData.S+r.ppData.X)/3)}pp`,
            status: `${r.mapData.status[0].toUpperCase()}${r.mapData.status.slice(1)}`,
            stats: `★ ${Math.round(r.mapData.difficulty_rating * 100) / 100}, AR ${r.mapData.ar}, BPM ${r.mapData.bpm} - ${moment(r.mapData.total_length*1000).format("mm:ss")}`,
        });
    }

    console.log(`Found ${found.length} recommendations!`);

    if(found.length >= 1) {
        for (let x = 0; x < found.length; x++) {
            let format = `[${found[x].status}] × ${found[x].name} | (${found[x].stats}) | ${found[x].pp}`;
            console.log(format);

            if((x+1) == found.length) {
                done = true;
            }
        }
    }

    while (!done) {
        await new Promise(p => setTimeout(p, 25));
    }

    console.timeEnd("Process time");
    process.exit();
});