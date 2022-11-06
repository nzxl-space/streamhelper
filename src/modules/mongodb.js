const { MongoClient } = require("mongodb");

module.exports = class MongoDB {
    constructor(string, options) {
        this.string = string;
        this.options = options;

        this.connect()
        .then(() => console.log("MongoDB connected!"))
        .catch(() => console.log("MongoDB failed!"));
    }

    connect() {
        return new Promise((resolve, reject) => {
            let mongoClient = new MongoClient(this.string, this.options);
            mongoClient.connect(async (err) => {
                if(err) return reject();
                let db = mongoClient.db("osu");

                const users = exports.users = db.collection("users");
                exports.mapData = db.collection("map_data");
                exports.activeUsers = await users.distinct("userId");

                resolve();
            });
        });
    }
}