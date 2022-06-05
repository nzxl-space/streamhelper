using System.Diagnostics;
using System.Threading.Tasks;
using Microsoft.Win32;
using System.Threading;
using System.Linq;
using System;

namespace client
{
    class Client
    {
        static int build = 1;
        // static String url = "https://ws.nzxl.space:443";
        static String url = "http://localhost:2048";
        static Boolean _quitFlag = false;
        static CancellationTokenSource cts = new CancellationTokenSource();
        static string[] mainArgs;
        public static SocketIOClient.SocketIO socket;
        public static RegistryKey key;

        public static void Main(string[] args)
        {
            mainArgs = args;
            Console.Clear();
            if(!Utils.checkVersion(url, build)) {
                Console.Write("You\'re using an outdated version of the client. \nDownload the newest one here: {0}/client.exe", url);
                return;
            }

            Console.Write("Connecting to server..\t");
            socket = Utils.connectServer(url);

            if(socket.Connected) {
                Console.Clear();
                Console.WriteLine("Connected to {0}..", url);
                socket.OnDisconnected += skillIssue;
            }

            key = Registry.CurrentUser.OpenSubKey(@"SOFTWARE\kiyomii");
            if(key == null) {
                string username;
                Console.WriteLine("Please enter your osu! username: ");
                username = Console.ReadLine();

                socket.EmitAsync("generateAuth", new { osu = username, id = Utils.GetMachineGuid() });
                socket.On("verify", x => {
                    if(x.GetValue<Boolean>(0) != false) {
                        Console.WriteLine("Please verify your identity by sending `!verify {0}` to kiyomii in osu!.", x.GetValue<String>(1));
                        socket.On("success", n => {
                            RegistryKey key = Registry.CurrentUser.CreateSubKey(@"SOFTWARE\kiyomii");
                            key.SetValue("username", n.GetValue<String>(0));
                            key.SetValue("secret", n.GetValue<String>(1));

                            Utils.restartApp(args, cts);
                        });
                    } else {
                        Console.WriteLine("It seems like your account is not enabled yet. Slide into my dms (nzxl#6334) to resolve.");
                        return;
                    }
                });
            } else {
                socket.EmitAsync("auth", new { osu = key.GetValue("username").ToString(), secret = key.GetValue("secret").ToString() });
                socket.On("loggedIn", u => {
                    if(u.GetValue<Boolean>(0) != false) {
                        Console.WriteLine("Logged in as {0}!", u.GetValue<String>(1));
                        osu.read(cts, args.FirstOrDefault());
                    } else {
                        Console.WriteLine("Failed to login due to an invalid secret or hwid. Slide into my dms (nzxl#6334) to resolve.");
                        return;
                    }
                });
            }

            while(!_quitFlag) {
                var keyInfo = Console.ReadKey(true);
                _quitFlag = keyInfo.Key == ConsoleKey.C && keyInfo.Modifiers == ConsoleModifiers.Control;
            }
        }

        static void skillIssue(object sender, string d) {
            Utils.restartApp(mainArgs, cts);
        }
    }
}
