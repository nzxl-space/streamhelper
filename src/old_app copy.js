process.noDeprecation = true;

const moment = require("moment");
const path = require("path");

require("dotenv").config();
require("log-prefix")(() => { return `[nzxl.space | ${moment(Date.now()).format("HH:mm:ss")}]`; });
process.on("unhandledRejection", error => console.error(error));

// Discord
const DiscordOauth2 = require("discord-oauth2");
const oauth = new DiscordOauth2();

// Webserver
const express = require("express");
const { createServer } = require("http");
const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "static"));
app.use(express.static(path.join(__dirname, "static")));
const httpServer = createServer(app);

let activeUsers, users;
(() => {

    httpServer.listen(process.env.PORT || 2048, () => {
        console.log(`Listening on port ${httpServer.address().port}!`);
        app.get("/", (req, res) => {
            res.render("index", { discordURL: `https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_PUBLIC}&redirect_uri=${process.env.DISCORD_REDIRECT_URI}&response_type=code&scope=identify%20connections%20guilds.join` });
        });

        app.get("/discord", (req, res) => {
            if(req.query.code) {
                oauth.tokenRequest({
                    clientId: process.env.DISCORD_PUBLIC,
                    clientSecret: process.env.DISCORD_SECRET,
                    code: req.query.code,
                    scope: "identify guilds",
                    grantType: "authorization_code",
                    redirectUri: process.env.DISCORD_REDIRECT_URI
                }).then((data) => {
                    if(!data || data && !data["access_token"]) return;
    
                    oauth.getUser(data.access_token).then((user) => {
                        oauth.addMember({
                            accessToken: data.access_token,
                            botToken: process.env.DISCORD_TOKEN,
                            guildId: process.env.DISCORD_GUILD,
                            userId: user.id
                        }).then(() => {
                            oauth.getUserConnections(data.access_token).then((c) => {
                                users.findOne({ userId: user.id }).then(async (result) => {
                                    if(!result || result && result.length <= 0) {
                                        let twitch = c.filter(x => x.type == "twitch");
                                        if(twitch.length <= 0) {
                                            await setRole(user.id, ["on hold"]);
                                            return await sendDM(user.id, "Twitch channel not found. Please connect one to your Discord first, and then try re-authorizing :)");
                                        }
                                        
                                        users.insertOne({
                                            userId: user.id,
                                            discordName: `${user.username}#${user.discriminator}`,
                                            twitch: `${twitch[0].name}`,
                                            osu: null
                                        }).then(async () => {
                                            activeUsers.push(user.id);
                                            await setRole(user.id, ["on hold"]);

                                            console.log(`Added user ${user.username}#${user.discriminator} to db`);
                                        });
                                    }
                                });
                            });
                        }).catch((err) => err);
                    });
                });
            }

            res.send("<script>window.close()</script>");
        });
    });
    
})();



