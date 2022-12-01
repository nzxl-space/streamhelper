const c = require("../constants");
const AWS = require("aws-sdk");

/**
 * Simple log to JSON file
 * @param {String} Discord User Id
 * @param {String} ["beatmap+request", "get+beatmap", "twitch+api", "bancho+irc"] 
 * @param {Object} Data to write 
 * @returns {Promise}
 */
function log(user, type, data = {}) {
    return new Promise((resolve, reject) => {
        let month = c.lib.moment(Math.floor(Date.now()*1000)/1000).startOf("month").format("MMMM");
        let path = c.lib.path.join(c.storage.log, month);

        if(!user) return reject("No user specified");

        if(c.lib.fs.existsSync(path) == false) {
            c.lib.fs.mkdirSync(path, { recursive: true });
        }

        let types = ["beatmap+request", "get+beatmap", "twitch+api", "bancho+irc"];
        if(!types.includes(type)) return reject("Invalid type");

        let fileDir = c.lib.path.join(path, user);
        if(c.lib.fs.existsSync(fileDir) == false) {
            c.lib.fs.mkdirSync(fileDir, { recursive: true });
        }

        let file = c.lib.path.join(fileDir, `${type}_${(Math.random()+1).toString(36).substring(7)}.json`);
        if(c.lib.fs.existsSync(file) == false) {
            c.lib.fs.writeFileSync(file, JSON.stringify(data, null, 4));
            resolve();
        }
    });
}
exports.log = log;

// https://stackoverflow.com/a/46213474
function upload(s3Path, bucketName) {
    let s3 = new AWS.S3({ endpoint: "https://s3.filebase.com", signatureVersion: "v4" });

    function walkSync(currentDirPath, callback) {
        c.lib.fs.readdirSync(currentDirPath).forEach(function (name) {
            var filePath = c.lib.path.join(currentDirPath, name);
            var stat = c.lib.fs.statSync(filePath);
            if (stat.isFile()) {
                callback(filePath, stat);
            } else if (stat.isDirectory()) {
                walkSync(filePath, callback);
            }
        });
    }

    walkSync(s3Path, function(filePath) {
        let bucketPath = filePath.substring(s3Path.length+1);
        let params = { Bucket: bucketName, Key: bucketPath, Body: c.lib.fs.readFileSync(filePath) };
        s3.putObject(params, function(err) {
            if (err) {
                console.log(err)
            }
        });
    });
}
exports.upload = upload;