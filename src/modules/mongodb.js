const c = require("../constants");

function connect() {
    return new Promise((resolve, reject) => {
        c.client.mongo.connect(async (err) => {
            if(err)
                return reject("MongoDB connection failed!");
    
            const db = c.client.mongo.db("osu");
            c.database.users = db.collection("users");
            c.database.maps = db.collection("maps");
            c.database.userCount = await c.database.users.distinct("id");

            resolve("MongoDB connected!");
        });
    });
}
exports.connect = connect;