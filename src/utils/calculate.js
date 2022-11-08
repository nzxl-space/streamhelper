require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");
const mongoClient = new MongoClient(process.env.MONGODB, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1, monitorCommands: true });
const { BeatmapCalculator } = require("@kionell/osu-pp-calculator");
const pp = new BeatmapCalculator();
const Banchojs = require("bancho.js");
const banchoClient = new Banchojs.BanchoClient({
    username: process.env.OSU_USERNAME,
    password: process.env.OSU_PASSWORD,
    apiKey: process.env.OSU_API_KEY
});

// https://stackoverflow.com/a/72503985
function mode(arr) {
    const store = {}
    arr.forEach((num) => store[num] ? store[num] += 1 : store[num] = 1)
    return Object.keys(store).sort((a, b) => store[b] - store[a])[0]
}

const Genre = {
    0:   "Any",
    1:   "Unspecified",
    2:   "Video Game",
    3:   "Anime",
    4:   "Rock",
    5:   "Pop",
    6:   "Other",
    7:   "Novelty",
    9:   "Hip Hop",
    10:  "Electronic"
};

(() => {
    mongoClient.connect(async err => {
        if(err) return console.log("MongoDB failed!");
        const db = mongoClient.db("osu");
        const mapData = db.collection("map_data");

        console.log("DB connected");


        // UserScore {
        //     scoreId: 4262431480,
        //     score: 8411900,
        //     count300: 473,
        //     count100: 6,
        //     count50: 0,
        //     countMiss: 0,
        //     maxCombo: 589,
        //     countKatu: 6,
        //     countGeki: 100,
        //     perfect: true,
        //     enabledMods: 0,
        //     username: undefined,
        //     userId: 19012828,
        //     date: 2022-09-03T15:21:47.000Z,
        //     rank: 'S',
        //     pp: 407.234,
        //     replayAvailable: false,
        //     beatmapId: 1663107
        // }

        // Beatmap {
        //     approved: 1,
        //     submitDate: 2018-06-05T01:51:38.000Z,
        //     approvedDate: 2018-06-30T18:40:21.000Z,
        //     lastUpdate: 2018-06-23T18:55:39.000Z,
        //     artist: 'UROBOROS',
        //     id: 1663107,
        //     setId: 792964,
        //     bpm: 204,
        //     creator: 'Mir',
        //     creatorId: 8688812,
        //     difficultyRating: 7.02134,
        //     diffSize: 4,
        //     diffOverall: 9.3,
        //     diffApproach: 9.6,
        //     diffDrain: 5,
        //     countNormal: 377,
        //     countSlider: 102,
        //     countSpinner: 0,
        //     hitLength: 77,
        //     source: '六花の勇者',
        //     genre: 3,
        //     language: 3,
        //     title: 'Black Swallowtail (TV Size)',
        //     totalLength: 86,
        //     version: 'Catastrophe',
        //     fileMd5: '1924bfe2bba850824d197282d735f220',
        //     mode: 0,
        //     tags: [
        //       'rokka',  'no',
        //       'yuusha', 'opening',
        //       '2',      'braves',
        //       'of',     'the',
        //       'six',    'flowers',
        //       'lasse',  'flezlin'
        //     ],
        //     favouriteCount: 243,
        //     rating: 9.14156,
        //     downloadUnavailable: false,
        //     audioUnavailable: false,
        //     playcount: 601821,
        //     passcount: 57141,
        //     maxCombo: 589,
        //     diffAim: 3.57962,
        //     diffSpeed: 3.10201,
        //     packs: [ 'S669' ],
        //     storyboard: false,
        //     video: false
        // }

        // Genres
        // 0   Any
        // 1   Unspecified
        // 2   Video Game
        // 3   Anime
        // 4   Rock
        // 5   Pop
        // 6   Other
        // 7   Novelty
        // 9   Hip Hop
        // 10  Electronic

        let scores = await banchoClient.osuApi.user.getBest("kiyomii", 0, 5);

        let performance = [];
        let bpm = [];
        let genre = [];
        
        for (let i = 0; i < scores.length; i++) {
            let score = scores[i];
            let beatmap;
            let map = await mapData.findOne({ "mapData.id": score.beatmapId });

            if(map == null) {
                let lookup = await banchoClient.osuApi.beatmaps.getByBeatmapId(score.beatmapId);
                if(lookup.length <= 0) return;

                // existing maps in the db don't have the genre value, so need to update every single map again pogchamp !!
                map = {};
                map.mapData = {
                    "beatmapset_id": lookup[0].setId,
                    "difficulty_rating": Math.round(lookup[0].difficultyRating * 100) / 100, //5.32
                    "id": lookup[0].id,
                    "mode": "osu",
                    "status": "ranked",
                    "total_length": lookup[0].totalLength,
                    "user_id": lookup[0].creatorId,
                    "version": lookup[0].version,
                    "accuracy": lookup[0].diffOverall,
                    "ar": lookup[0].diffApproach,
                    "bpm": lookup[0].bpm,
                    "convert": false,
                    "count_circles": lookup[0].countNormal,
                    "count_sliders": lookup[0].countSlider,
                    "count_spinners": lookup[0].countSpinner,
                    "cs": lookup[0].diffSize,
                    "deleted_at": null,
                    "drain": lookup[0].diffDrain,
                    "hit_length": lookup[0].hitLength,
                    "is_scoreable": true,
                    "last_updated": lookup[0].lastUpdate,
                    "mode_int": 0,
                    "passcount": lookup[0].passcount,
                    "playcount": lookup[0].playcount,
                    "ranked": lookup[0].rankedStatus,
                    "url": `https://osu.ppy.sh/beatmaps/${lookup[0].id}`,
                    "checksum": lookup[0].fileMd5,
                    "max_combo": lookup[0].maxCombo,
                    "genre": lookup[0].genre
                }
                map.score = await pp.calculate({ beatmapId: map.mapData.id }); 

                // await mapData.insertOne({
                //     name: `${lookup[0].artist} - ${lookup[0].title} [${lookup[0].version}]`,
                //     setId: map.mapData.id,
                //     mapData: map.mapData,
                //     ppData: {
                //         A: Math.round(map.score.performance[0].totalPerformance),
                //         S: Math.round(map.score.performance[1].totalPerformance),
                //         X: Math.round(map.score.performance[2].totalPerformance)
                //     }
                // });
            }

            beatmap = map.mapData;

            performance.push(Math.round(score.pp));
            genre.push(Number(beatmap.genre) ? beatmap.genre : 0);
            bpm.push(beatmap.bpm);

            console.log(score.scoreId, "done");

            if(i+1 >= scores.length) {
                let mostPlayed = mode(genre);
                let averageBpm = Math.round(bpm.reduce((a, b) => a + b, 0) / bpm.length);
                let median = (function() {
                    performance.sort((a, b) => a - b);
                    var h = Math.floor(performance.length / 2);

                    if (performance.length % 2)
                        return performance[h];
                
                    return (performance[h - 1] + performance[h]) / 2.0;
                })();

                console.log(Genre[mostPlayed], `${averageBpm}bpm`, `${median}pp`);
            }
        }
    });
})();