using System.IO;
using System.Net;
using System.Diagnostics;
using System.Threading.Tasks;
using System.Collections.Generic;
using Microsoft.Win32;
using System.Threading;
using System.Runtime.InteropServices;
using System.Linq;
using System;
using SocketIOClient;
using OsuMemoryDataProvider;
using OsuMemoryDataProvider.OsuMemoryModels;

namespace client
{
    class Program
    {
        static int build = 1;
        // static String url = "https://ws.nzxl.space:443";
        static String url = "http://localhost:2048";
        static Boolean _quitFlag = false;
        static StructuredOsuMemoryReader _sreader;
        static OsuBaseAddresses BaseAddresses = new OsuBaseAddresses();
        static CancellationTokenSource cts = new CancellationTokenSource();
        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        static void Main(string[] args)
        {
            Console.Clear();

            var guid = GetMachineGuid();
            var socket = connect();

            if(socket.Connected) {
                Console.Clear();
                Console.WriteLine("Connected to {0}", url);

                Task.Run(async () => {
                    while(!cts.IsCancellationRequested) {
                        if(socket.Disconnected) {
                            socket.Dispose();
                            restartApp(args, cts);
                        } else await Task.Delay(TimeSpan.FromSeconds(2), cts.Token);
                    }
                });
            }

            HttpWebRequest webRequest = (HttpWebRequest) WebRequest.Create(url+"/b");
            HttpWebResponse httpResponse = (HttpWebResponse) webRequest.GetResponse();
            using (StreamReader responseReader = new StreamReader(httpResponse.GetResponseStream()))
            {
                var version = responseReader.ReadToEnd();
                if(version != build.ToString()) {
                    Console.Write("You\'re using an outdated version of the client. \nDownload the newest one here: {0}/client.exe", url);
                    quitApp();
                    return;
                }
            }

            if(Registry.CurrentUser.OpenSubKey(@"SOFTWARE\kiyomii") == null) {
                string username;
                Console.WriteLine("Please enter your osu! username: ");
                username = Console.ReadLine();

                socket.EmitAsync("generateAuth", new { osu = username, id = guid });
                socket.On("verify", x => {
                    if(x.GetValue<Boolean>(0) != false) {
                        Console.WriteLine("Please verify your identity by sending `!verify {0}` to kiyomii in osu!.", x.GetValue<String>(1));
                        socket.On("success", n => {
                            RegistryKey key = Registry.CurrentUser.CreateSubKey(@"SOFTWARE\kiyomii");
                            key.SetValue("username", n.GetValue<String>(0));
                            key.SetValue("secret", n.GetValue<String>(1));

                            Main(args);
                        });
                    } else {
                        Console.WriteLine("It seems like your account is not enabled yet. Slide into my dms (nzxl#6334) to resolve.");
                        quitApp();
                    }
                });
            }
            
            RegistryKey key = Registry.CurrentUser.OpenSubKey(@"SOFTWARE\kiyomii");
            if(key != null) {
                socket.EmitAsync("auth", new { osu = key.GetValue("username").ToString(), secret = key.GetValue("secret").ToString() });
                socket.On("loggedIn", async u => {
                    if(u.GetValue<Boolean>(0) != false) {
                        Console.WriteLine("Logged in as {0}!", u.GetValue<String>(1));
                        Console.WriteLine();
                        Console.WriteLine("Overlays:\nPerformance Points: {0}/pp-overlay/?s={1}", url, key.GetValue("secret").ToString());
                        Console.WriteLine("Keys: {0}/key-overlay/?s={1}", url, key.GetValue("secret").ToString());
                        Console.WriteLine("Score Farming: {0}/score-overlay/?s={1}", url, key.GetValue("secret").ToString());
                        Console.WriteLine();
                        Console.WriteLine("Now Playing (!np) & Beatmap request now available on your Twitch channel");
                        Console.WriteLine("Hide OBS window with Shift+Tab (Disable In-Game Interface)");
                        while (!cts.IsCancellationRequested) {
                            _sreader = StructuredOsuMemoryReader.Instance.GetInstanceForWindowTitleHint(args.FirstOrDefault());

                            while(Process.GetProcessesByName("osu!").Length == 0 && !_sreader.CanRead) {
                                await Task.Delay(TimeSpan.FromSeconds(30), cts.Token);
                                continue;
                            }

                            _sreader.TryRead(BaseAddresses.Beatmap);
                            _sreader.TryRead(BaseAddresses.Skin);
                            _sreader.TryRead(BaseAddresses.Player);
                            _sreader.TryRead(BaseAddresses.ResultsScreen);
                            _sreader.TryRead(BaseAddresses.GeneralData);

                            try {
                                var mods = BaseAddresses.GeneralData.OsuStatus == OsuMemoryStatus.MainMenu ? parseMods(BaseAddresses.GeneralData.Mods) : BaseAddresses.GeneralData.OsuStatus == OsuMemoryStatus.ResultsScreen ? parseMods(BaseAddresses.ResultsScreen.Mods.Value) : parseMods(BaseAddresses.Player.Mods.Value);
                                if(socket.Connected && BaseAddresses.GeneralData.GameMode == 0) await socket.EmitAsync("osuData", new { playing = BaseAddresses.GeneralData.OsuStatus == OsuMemoryStatus.Playing || BaseAddresses.GeneralData.OsuStatus == OsuMemoryStatus.ResultsScreen ? true : false, secret = key.GetValue("secret").ToString(), setId = BaseAddresses.Beatmap.SetId, id = BaseAddresses.Beatmap.Id, name = BaseAddresses.Beatmap.MapString, md5 = BaseAddresses.Beatmap.Md5, mods = (mods.Count >= 1 ? "+"+string.Join("", mods) : ""), skin = BaseAddresses.Skin.Folder, hit50 = BaseAddresses.GeneralData.OsuStatus == OsuMemoryStatus.ResultsScreen ? BaseAddresses.ResultsScreen.Hit50 : BaseAddresses.Player.Hit50, hit100 = BaseAddresses.GeneralData.OsuStatus == OsuMemoryStatus.ResultsScreen ? BaseAddresses.ResultsScreen.Hit100 : BaseAddresses.Player.Hit100, hit300 = BaseAddresses.GeneralData.OsuStatus == OsuMemoryStatus.ResultsScreen ? BaseAddresses.ResultsScreen.Hit300 : BaseAddresses.Player.Hit300, hitMiss = BaseAddresses.GeneralData.OsuStatus == OsuMemoryStatus.ResultsScreen ? BaseAddresses.ResultsScreen.HitMiss : BaseAddresses.Player.HitMiss, maxCombo = BaseAddresses.GeneralData.OsuStatus == OsuMemoryStatus.ResultsScreen ? BaseAddresses.ResultsScreen.MaxCombo : BaseAddresses.Player.MaxCombo, accuracy = BaseAddresses.Player.Accuracy });

                                foreach(Process p in Process.GetProcesses()) {
                                    if(p.ProcessName == "obs64" || p.ProcessName == "obs32") {
                                        ShowWindow(p.MainWindowHandle, BaseAddresses.GeneralData.OsuStatus == OsuMemoryStatus.Playing && BaseAddresses.GeneralData.ShowPlayingInterface == false && BaseAddresses.Player.IsReplay == false ? 2 : 4);
                                    }
                                }
                            } catch (Exception e) {
                                continue;
                            }

                            await Task.Delay(TimeSpan.FromSeconds(1), cts.Token);
                        }
                    } else {
                        Console.WriteLine("Failed to login due to an invalid secret or hwid. Slide into my dms (nzxl#6334) to resolve.");
                        quitApp();
                    }
                });
            }

            while(!_quitFlag) {
                var keyInfo = Console.ReadKey(true);
                _quitFlag = keyInfo.Key == ConsoleKey.C && keyInfo.Modifiers == ConsoleModifiers.Control;
            }
        }

        static SocketIO connect() {
            Console.Write("Connecting to server..\t");
            var client = new SocketIO(url);
            client.ConnectAsync();

            while (!client.Connected)
            {
                Thread.Sleep(150);
                Console.Write("\b\\");
                Thread.Sleep(150);
                Console.Write("\b|");
                Thread.Sleep(150);
                Console.Write("\b/");
                Thread.Sleep(150);
                Console.Write("\b-");
            }

            return client;
        }

        static String GetMachineGuid() {
            string location = @"SOFTWARE\Microsoft\Cryptography";
            string name = "MachineGuid";

            using (RegistryKey localMachineX64View = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, RegistryView.Registry64)) {
                using (RegistryKey rk = localMachineX64View.OpenSubKey(location)) {
                    if (rk == null)
                        throw new KeyNotFoundException(string.Format("Key Not Found: {0}", location));

                    object machineGuid = rk.GetValue(name);
                    if (machineGuid == null)
                        throw new IndexOutOfRangeException(string.Format("Index Not Found: {0}", name));

                    return machineGuid.ToString();
                }
            }
        }

        static void restartApp(string[] args, CancellationTokenSource cts) {
            Main(args);
            cts.Cancel();
        }

        static void quitApp() {
            Thread.Sleep(5*1000);
            Environment.Exit(0);
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

            return mods;
        }
    }
}
