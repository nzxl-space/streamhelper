require("dotenv").config();
const { Client, MessageEmbed, Intents } = require("discord.js");
const client = new Client({
    partials: ["CHANNEL"],
    intents: [ Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_PRESENCES, Intents.FLAGS.DIRECT_MESSAGES, Intents.FLAGS.DIRECT_MESSAGE_TYPING ]
});

const embeds = [
    {
        color: "#908aa3",
        title: "𝗜𝗠𝗣𝗢𝗥𝗧𝗔𝗡𝗧 𝗡𝗢𝗧𝗜𝗖𝗘 ⚠️",
        desc: "𝗥𝗘𝗔𝗗 𝗧𝗛𝗜𝗦. 𝗣𝗟𝗘𝗔𝗦𝗘.",
        fields: [
            { name: "Requirements", value: "✅ Active Discord Game Activity\n✅ Linked Twitch Account to Discord\n❌ Streamer mode is not needed" },
            { name: "How It Works", value: "👉 The bot utilises Discord's Rich Presence feature to obtain beatmap data and looks at your Twitch account link to determine the correct twitch channel." },
            { name: "How To Disable", value: "👉 By leaving this server, the bot will automatically be disabled." },
            { name: "Bot doesn't work!! Pls Fix", value: "The bot will **only join** your twitch channel **if** you are **LIVE** and **streaming in the osu! category**.\nIf you've **changed** your **twitch name** or **osu! username**, you will need to **leave** this server and **re-authorize the access**.\n(*Make sure you've also updated your Twitch connection on your Discord profile.*)" },
            { name: "Links", value: "Registration: https://osu.nzxl.space/\nReddit: https://redd.it/ysu6bh\nGitHub Repository: https://github.com/nzxl-space/streamhelper" }
        ],
        files: ["src/static/assets/vids/presence.webm", "src/static/assets/vids/twitch.webm"],
        priority: 100
    },
    {
        color: "#908aa3",
        title: "𝗧𝗪𝗜𝗧𝗖𝗛 𝗕𝗢𝗧 𝗖𝗢𝗠𝗠𝗔𝗡𝗗𝗦 🤖",
        desc: "𝗔𝗡 𝗢𝗩𝗘𝗥𝗩𝗜𝗘𝗪 𝗢𝗙 𝗧𝗛𝗘 𝗔𝗩𝗔𝗜𝗟𝗔𝗕𝗟𝗘 𝗖𝗢𝗠𝗠𝗔𝗡𝗗𝗦",
        fields: [
            { name: "Management", value: "!silence — toggle bot messages and disable *all* commands\n!request — toggle beatmap requests\n!blacklist [<username>] — blacklist a user from sending requests\n!prefix [<new prefix>] — change bot commands prefix" },
            { name: "osu!", value: "!np[<pp>] [<accuracy in %> | <mods>] — display current playing map\n!last[<pp>] [<accuracy in %> | <mods>] — display last played map" }
        ],
        files: [],
        priority: 80
    },
    {
        color: "#908aa3",
        title: "𝗥𝗢𝗟𝗘𝗦 ‼️",
        desc: "𝗔𝗡 𝗢𝗩𝗘𝗥𝗩𝗜𝗘𝗪 𝗢𝗙 𝗧𝗛𝗘 𝗗𝗜𝗦𝗖𝗢𝗥𝗗 𝗥𝗢𝗟𝗘𝗦",
        fields: [
            { name: "Master", value: "<@&1026506301443948644> — bot master" },
            { name: "Early Tester", value: "<@&1034528667008765962> — early tester before 10/24/22" },
            { name: "Regular", value: "<@&1034529067682234478> — you're good to go" },
            { name: "On Hold", value: "<@&1034529583376105563> — no linked twitch account or osu! username found" },
        ],
        files: [],
        priority: 70
    }
];

client.on("ready", async () => {
    console.log(`${client.user.username} is ready!`);

    let guild = client.guilds.cache.get("1024630490336075827");
    if(!guild) return;

    let channel = guild.channels.cache.get("1024630491145588768");
    if(!channel) return;

    let sortedByPriority = embeds.sort((a, b) => b.priority - a.priority);

    for (let i = 0; i < sortedByPriority.length; i++) {
        let embed = sortedByPriority[i];
        await channel.send({
            embeds: [
                new MessageEmbed()
                .setColor(embed.color)
                .setTitle(embed.title)
                .setDescription(embed.desc)
                .addFields(embed.fields)
                .setTimestamp()
            ],
            files: embed.files
        });
    }
});

client.login(process.env.DISCORD_TOKEN);