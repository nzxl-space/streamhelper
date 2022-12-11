const c = require("../constants");

const { S3 } = require("@aws-sdk/client-s3")
const s3 = new S3({
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    },
    endpoint: "https://s3.filebase.com", 
    signatureVersion: "v4",
    region: "us-east-1"
});

const S3SyncClient = require("s3-sync-client");
const { TransferMonitor } = require("s3-sync-client");
const { sync } = new S3SyncClient({ client: s3 });

let syncing = false;
const monitor = new TransferMonitor();
const status = setInterval(() => {
    let p = monitor.getStatus();
    if(p["size"].total == 0 || !syncing) return;

    let currentInMb = Math.round((p["size"].current / 1000000) * 100) / 100;
    let totalInMb = Math.round((p["size"].total / 1000000) * 100) / 100;

    console.log(`Syncing ${currentInMb % 100}MB/${totalInMb % 100}MB ..`);
}, 30*1000);

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

function upload(path, bucket) {
    return new Promise(async (resolve) => {
        syncing = true;

        await sync(path, `s3://${bucket}`, { maxConcurrentTransfers: 2, monitor });
        console.log(`Bucket ${bucket} is now synced!`);

        syncing = false;

        resolve();
    });
}
exports.upload = upload;

function download(path, bucket) {
    return new Promise(async (resolve) => {
        syncing = true;

        await sync(`s3://${bucket}`, path, { maxConcurrentTransfers: 2, monitor, del: true });
        console.log(`Bucket ${bucket} is now synced!`);

        syncing = false;

        resolve();
    });
}
exports.download = download;