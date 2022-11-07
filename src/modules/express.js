const path = require("path");

const DiscordOauth2 = require("discord-oauth2");
const oauth = new DiscordOauth2();

const express = require("express");
const { createServer } = require("http");

const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "static"));
app.use(express.static(path.join(__dirname, "..", "static")));

const httpServer = createServer(app);

const { mongoDB, discord } = require("../app");

module.exports = class Express {
    constructor(port, clientId, clientSecret, redirectURI, token, guild) {
        this.port = port;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectURI = redirectURI;
        this.token = token;
        this.guild = guild;

        this.authorizeURL = `https://discord.com/api/oauth2/authorize?client_id=${this.clientId}&redirect_uri=${this.redirectURI}&response_type=code&scope=identify%20connections%20guilds.join`;
    }

    createServer() {
        return new Promise((resolve) => {
            app.get("/", (req, res) => res.render("index", { discordURL: this.authorizeURL }));

            app.get("/discord", async (req, res) => {
                if(!req.query.code) return res.send(`<script>window.close()</script>`);
    
                let token = await oauth.tokenRequest(
                    {
                        clientId: this.clientId,
                        clientSecret: this.clientSecret,
                        code: req.query.code,
                        scope: "identify guilds",
                        grantType: "authorization_code",
                        redirectUri: this.redirectURI
                    }
                );
                if(!token || !token["access_token"]) return res.send(`<a href="#" onclick="window.close()">AUTHORIZATION FAILED; TRY AGAIN!</a>`);
    
                let user = await oauth.getUser(token.access_token);
    
                let exists = await mongoDB.users.findOne({ userId: user.id });
                if(exists) return res.send(`<script>window.close()</script>`);
    
                let conns = await oauth.getUserConnections(token.access_token);
    
                let twitch = conns.filter(x => x.type == "twitch");
                if(twitch.length <= 0) {
                    return res.send(`<a href="#" onclick="window.close()">NO LINKED TWITCH CHANNEL FOUND; TRY AGAIN!</a>`);
                }
    
                let guild = discord.discordClient.guilds.cache.get(this.guild);
                let guildMember = guild.members.cache.get(user.id);
    
                if(!guildMember) {
                    await oauth.addMember(
                        {
                            accessToken: token.access_token,
                            botToken: this.token,
                            guildId: this.guild,
                            userId: user.id
                        }
                    );
                }
    
                await mongoDB.users.insertOne(
                    {
                        userId: user.id,
                        discordName: `${user.username}#${user.discriminator}`,
                        twitch: `${twitch[0].name}`,
                        osu: null
                    }
                );
    
                mongoDB.activeUsers.push(user.id);
                await discord.updateRole(user.id, "on hold");
    
                console.log(`${user.username}#${user.discriminator} has been registered to the service!`);
    
                return res.send(`<script>window.close()</script>`);
            });
    
            httpServer.listen(this.port, () => resolve());
        });
    }
}