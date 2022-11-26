const { MongoClient } = require("mongodb");

module.exports = class MongoDB {
    constructor(string, options) {
        this.string = string;
        this.options = options;

        // export vars
        this.users = null;
        this.mapData = null;
        this.logs = null;
        this.activeUsers = null;
    }

    connect() {
        return new Promise((resolve, reject) => {
            let mongoClient = new MongoClient(this.string, this.options);
            mongoClient.connect(async (err) => {
                if(err) return reject();
                const db = mongoClient.db("osu");

                this.users = db.collection("users");
                this.mapData = db.collection("map_data");
                this.logs = db.collection("logs");
                this.activeUsers = await this.users.distinct("id");

                resolve();
            });
        });
    }
}