using System.Collections.Generic;
using System;
using System.Threading.Tasks;
using System.Threading;
using System.Diagnostics;
using OsuMemoryDataProvider;
using OsuMemoryDataProvider.OsuMemoryModels;

namespace client 
{
    class osu 
    {
        static StructuredOsuMemoryReader _sreader;
        static OsuBaseAddresses BaseAddresses = new OsuBaseAddresses();

        public static async void read(CancellationTokenSource cts, string windowTitle)
        {
            _sreader = StructuredOsuMemoryReader.Instance.GetInstanceForWindowTitleHint(windowTitle);
            while(!cts.IsCancellationRequested) {
                try {
                    foreach(Process p in Process.GetProcesses()) {
                        if(p.ProcessName == "osu!" && _sreader.CanRead) {
                            _sreader.TryRead(BaseAddresses.GeneralData);
                            _sreader.TryRead(BaseAddresses.Beatmap);
                            _sreader.TryRead(BaseAddresses.Player);
                            _sreader.TryRead(BaseAddresses.Skin);
                            _sreader.TryRead(BaseAddresses.ResultsScreen);

                            var mods = BaseAddresses.GeneralData.OsuStatus == OsuMemoryStatus.MainMenu ? BaseAddresses.GeneralData.Mods : BaseAddresses.GeneralData.OsuStatus == OsuMemoryStatus.ResultsScreen ? BaseAddresses.ResultsScreen.Mods.Value : BaseAddresses.Player.Mods.Value;
                            var parsedMods = parseMods(mods);

                            if(Client.socket.Connected) {
                                await Client.socket.EmitAsync("CLIENT", new {
                                    secretId = Client.key.GetValue("secret").ToString(),
                                    Beatmap = new {
                                        setId = BaseAddresses.Beatmap.SetId,
                                        id = BaseAddresses.Beatmap.Id,
                                        name = BaseAddresses.Beatmap.MapString,
                                    },
                                    Player = new {
                                        playing = BaseAddresses.GeneralData.OsuStatus == OsuMemoryStatus.Playing || BaseAddresses.GeneralData.OsuStatus == OsuMemoryStatus.ResultsScreen ? true : false,
                                        skin = BaseAddresses.Skin.Folder.ToString(),
                                        mods = new {
                                            text = string.Join("", parsedMods),
                                            value = mods
                                        }
                                    },
                                    Stats = new {
                                        accuracy = BaseAddresses.GeneralData.OsuStatus == OsuMemoryStatus.ResultsScreen ? 100 : BaseAddresses.Player.Accuracy,
                                        n300 = BaseAddresses.GeneralData.OsuStatus == OsuMemoryStatus.ResultsScreen ? BaseAddresses.ResultsScreen.Hit300 : BaseAddresses.Player.Hit300,
                                        n100 = BaseAddresses.GeneralData.OsuStatus == OsuMemoryStatus.ResultsScreen ? BaseAddresses.ResultsScreen.Hit100 : BaseAddresses.Player.Hit100,
                                        n50 = BaseAddresses.GeneralData.OsuStatus == OsuMemoryStatus.ResultsScreen ? BaseAddresses.ResultsScreen.Hit50 : BaseAddresses.Player.Hit50,
                                        nMisses = BaseAddresses.GeneralData.OsuStatus == OsuMemoryStatus.ResultsScreen ? BaseAddresses.ResultsScreen.HitMiss : BaseAddresses.Player.HitMiss,
                                        combo = BaseAddresses.GeneralData.OsuStatus == OsuMemoryStatus.ResultsScreen ? BaseAddresses.ResultsScreen.MaxCombo : BaseAddresses.Player.MaxCombo,
                                        passedObjects = BaseAddresses.GeneralData.OsuStatus == OsuMemoryStatus.ResultsScreen ? (BaseAddresses.ResultsScreen.Hit300+BaseAddresses.ResultsScreen.Hit100+BaseAddresses.ResultsScreen.Hit50) : (BaseAddresses.Player.Hit300+BaseAddresses.Player.Hit100+BaseAddresses.Player.Hit50),
                                    }
                                });
                            }
                        }
                    }
                    await Task.Delay(TimeSpan.FromSeconds(0.25));
                } catch {
                    Utils.restartApp(Client.mainArgs, cts);
                }
            }   
        }

        static List<string> parseMods(int num) {
            List<string> mods = new List<string>();

            if((num & 1<<0) != 0) mods.Add("NF");
            if((num & 1<<1) != 0) mods.Add("EZ");
            if((num & 1<<3) != 0) mods.Add("HD");
            if((num & 1<<4) != 0) mods.Add("HR");
            if((num & 1<<5) != 0) mods.Add("SD");
            if((num & 1<<9) != 0) mods.Add("NC");
            else if((num & 1<<6) != 0) mods.Add("DT");
            if((num & 1<<7) != 0) mods.Add("RX");
            if((num & 1<<8) != 0) mods.Add("HT");
            if((num & 1<<10) != 0) mods.Add("FL");
            if((num & 1<<12) != 0) mods.Add("SO");
            if((num & 1<<14) != 0) mods.Add("PF");

            if(mods.Count <= 0) {
                mods.Add("None");
            }

            return mods;
        }
    }
}