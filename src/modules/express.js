const c = require("../constants");

function createServer() {
    return new Promise((resolve) => {
        c.webserver.app.get("/", (req, res) => {
            res.render("index", { discordURL: c.storage.discordURL });
        });

        c.webserver.app.get("/discord", async (req, res) => {
            let code = req.query.code;
            if(!code)
                return res.send(`<script>window.close()</script>`);

            let token = await c.client.discordApi.tokenRequest(
                {
                    clientId: process.env.DISCORD_PUBLIC,
                    clientSecret: process.env.DISCORD_SECRET,
                    code: code,
                    scope: "identify guilds",
                    grantType: "authorization_code",
                    redirectUri: process.env.DISCORD_REDIRECT_URI
                }
            ).catch((err) => {
                return console.log(`${err}`);
            });

            if(!token || !token.access_token)
                return res.send(`<a href="#" onclick="window.close()">AUTHORIZATION FAILED; TRY AGAIN!</a>`);

            let discordUser = await c.client.discordApi.getUser(token.access_token);

            let lookupUser = await c.database.users.findOne({ id: Number(discordUser.id) });
            if(lookupUser)
                return res.send(`<script>window.close()</script>`);

            let profileLinks = await c.client.discordApi.getUserConnections(token.access_token);

            let twitchLink = profileLinks.filter(x => x.type == "twitch");
            if(twitchLink.length <= 0)
                return res.send(`<a href="#" onclick="window.close()">NO LINKED TWITCH CHANNEL FOUND; TRY AGAIN!</a>`);

            let twitchId = c.funcs.twitch.getId(twitchLink[0].name);
            if(!twitchId)
                return res.send(`<a href="#" onclick="window.close()">NO LINKED TWITCH CHANNEL FOUND; TRY AGAIN!</a>`); 

            let guild = c.client.discord.guilds.cache.get(process.env.DISCORD_GUILD);
            if(!guild)
                return res.send(`<a href="#" onclick="window.close()">AUTHORIZATION FAILED; TRY AGAIN!</a>`);

            let guildMember = guild.members.cache.get(discordUser.id);
            if(!guildMember)
                await c.client.discordApi.addMember({
                    accessToken: token.access_token,
                    botToken: process.env.DISCORD_TOKEN,
                    guildId: process.env.DISCORD_GUILD,
                    userId: discordUser.id
                }).catch(() => {
                    return res.send(`<a href="#" onclick="window.close()">AUTHORIZATION FAILED; YOU MAY HAVE ALREADY REACHED THE 100-SERVER LIMIT!; TRY AGAIN!</a>`);
                });

            await c.database.users.insertOne({
                id: Number(discordUser.id),
                identifier: `${discordUser.username}#${discordUser.discriminator}`,
                twitch_id: Number(twitchId),
                osu_id: null,
                silenced: false,
                silencedReq: false,
                blacklist: [],
                replays: [],
                activityRetryCount: 0
            });

            c.database.userCount.push(discordUser.id);
            await c.funcs.discord.updateRole(discordUser.id, "on hold");

            console.log(`${discordUser.username}#${discordUser.discriminator} has been registered to the service!`);

            res.send(`<a href="#" onclick="window.close()">SUCCESSFULLY REGISTERED! YOU MAY CLOSE THIS WINDOW NOW :)</a>`);
        });

        c.webserver.httpServer.listen(process.env.PORT || 2048, () => resolve(`HTTP Server listening on ${process.env.PORT || 2048}!`));
    });
}
exports.createServer = createServer;