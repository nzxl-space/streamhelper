using System.Diagnostics;
using System.Threading.Tasks;
using Microsoft.Win32;
using System.Threading;
using System.Linq;
using System;
using Newtonsoft.Json.Linq;

namespace client
{
    class Client
    {
        static int build = 4;
        static String url = "https://osu.nzxl.space:443";
        // static String url = "http://localhost:2048";
        static Boolean _quitFlag = false;
        static CancellationTokenSource cts = new CancellationTokenSource();
        public static string[] mainArgs;
        public static SocketIOClient.SocketIO socket;
        public static RegistryKey key;
        static Boolean openedBrowser = false;
        static Boolean connecting = false;

        public static void Main(string[] args)
        {
            mainArgs = args;

            if(connecting) return;
            
            Console.Clear();
            Console.Write("Connecting to server..\t");
            connecting = true;
            socket = Utils.connectServer(url);

            if(socket.Connected) {
                Console.Clear();
                Console.WriteLine("Connected to {0}", url);
                connecting = false;
                socket.OnDisconnected += skillIssue;
            }

            if(!Utils.checkVersion(url, build)) {
                Console.Write("You\'re using an outdated version of the client. \nDownload the newest one here: {0}/client.exe", url);
                Console.ReadLine();
                return;
            }

            key = Registry.CurrentUser.OpenSubKey(@"SOFTWARE\kiyomii");
            if(key == null) {
                Console.WriteLine("Please enter your osu! username: ");
                socket.EmitAsync("REGISTER", new { osu = Console.ReadLine(), id = Utils.GetMachineGuid() });
            } else socket.EmitAsync("LOGIN", new { osu = key.GetValue("username").ToString(), secret = key.GetValue("secret").ToString() });

            socket.On("REGISTERED", response => {
                JObject data = JObject.Parse(response.GetValue().ToString());
                if((bool) data["success"] == true) Console.WriteLine("Please verify your identity by sending `!verify {0}` to kiyomii in osu!.", data["secret"]);
                else Console.WriteLine("HWID mismatch! DM nzxl#6334 to resolve.");
            });

            socket.On("VERIFIED", response => {
                JObject data = JObject.Parse(response.GetValue().ToString());
                RegistryKey key = Registry.CurrentUser.CreateSubKey(@"SOFTWARE\kiyomii");
                key.SetValue("username", data["username"]);
                key.SetValue("secret", data["secret"]);
                Utils.restartApp(args, cts);
            });

            socket.On("LOGGEDIN", response => {
                JObject data = JObject.Parse(response.GetValue().ToString());
                if((bool) data["success"] == true) {
                    Console.WriteLine("Logged in as {0}!", key.GetValue("username").ToString());
                    Console.WriteLine("F1 = Open Dashboard | CTRL+J = Reset settings | CTRL+C = Exit");
                    osu.read(cts, args.FirstOrDefault());

                    if(!openedBrowser) {
                        Process.Start("explorer", url);
                        openedBrowser = true;
                    }
                } else Console.WriteLine("Account disabled. DM nzxl#6334 to resolve.");
            });

            while(!_quitFlag) {
                var keyInfo = Console.ReadKey(true);
                _quitFlag = keyInfo.Key == ConsoleKey.C && keyInfo.Modifiers == ConsoleModifiers.Control;

                if(keyInfo.Key == ConsoleKey.F1 && openedBrowser) {
                    Process.Start("explorer", url);
                }

                if(keyInfo.Key == ConsoleKey.J && keyInfo.Modifiers == ConsoleModifiers.Control) {
                    if(Registry.CurrentUser.OpenSubKey(@"SOFTWARE\kiyomii") != null)
                        Registry.CurrentUser.DeleteSubKey(@"SOFTWARE\kiyomii");

                    Utils.restartApp(mainArgs, cts);
                }
            }
        }

        static void skillIssue(object sender, string d) {
            Utils.restartApp(mainArgs, cts);
        }
    }
}
