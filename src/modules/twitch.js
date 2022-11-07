const tmi = require("tmi.js");

module.exports = class Twitch {
    constructor(twitchUsername, twitchPassword, clientId, clientSecret) {
        this.twitchUsername = twitchUsername;
        this.twitchPassword = twitchPassword;
        this.clientId = clientId;
        this.clientSecret = clientSecret;

        this.accessToken = {};

        // export vars
        this.twitchClient = null;
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.twitchClient = new tmi.Client(
                {
                    identity: {
                        username: this.twitchUsername,
                        password: this.twitchPassword
                    }
                }
            );

            this.twitchClient.on("connected", () => resolve());

            this.twitchClient.on("join", (channel, username, self) => self ? console.log(`Enabled Beatmap Requests for ${channel}!`) : 0);
            this.twitchClient.on("part", (channel, username, self) => self ? console.log(`Disabled Beatmap Requests for ${channel}!`) : 0);

            this.twitchClient.on("message", (channel, tags, message, self) => {
                
            });

            this.twitchClient.connect().catch(() => reject());
        });
    }

    /**
     * Quick check if the given channel is live
     * @param {String} channel Twitch Username
     * @returns {Promise}
     */
    isLive(channel) {
        return new Promise(async (resolve) => {
            let expires = (Number(this.accessToken["expires"])-Math.floor(Date.now() / 1000));
            if(!this.accessToken["token"] || this.accessToken["token"] && expires <= 1000) {
                await fetch(`https://id.twitch.tv/oauth2/token?client_id=${this.clientId}&client_secret=${this.clientSecret}&grant_type=client_credentials`, { 
                    method: "POST",
                    retry: 3,
                    pause: 5000
                }).then(async (result) => {
                    result = await result.json();
                    this.accessToken["token"] = result.access_token;
                    this.accessToken["expires"] = (Math.floor(Date.now() / 1000)+result.expires_in);
                });
            }

            fetch(`https://api.twitch.tv/helix/streams?user_login=${channel}`, {
                method: "GET",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.accessToken["token"]}`,
                    "Client-Id": this.clientId
                },
                retry: 3,
                pause: 5000
            }).then(async (result) => {
                result = await result.json();
                resolve((result.data && result.data.length >= 1 ? true : false));
            }).catch(() => resolve(false));
        });
    }
}