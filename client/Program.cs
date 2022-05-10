using System.Threading.Tasks;
using System.Net.Mime;
using System.Collections.Generic;
using Microsoft.Win32;
using System.Threading;
using System;
using SocketIOClient;

namespace client
{
    class Program
    {
        // static String url = "https://ws.nzxl.space:443";
        static String url = "http://localhost:2048";
        static Boolean _quitFlag = false;

        static void Main(string[] args)
        {
            Console.Clear();

            var guid = GetMachineGuid();
            var socket = connect();

            if(socket.Connected)
            {
                Console.Clear();
                Console.Write("Connected to {0}\n", url);
                Task.Run(() => {
                    while(true) {
                        if(socket.Disconnected) {
                            Main(args);
                            break;
                        }
                        Thread.Sleep(500);
                    }
                });
            }

            if(Registry.CurrentUser.OpenSubKey(@"SOFTWARE\kiyomii") == null)
            {
                string username;
                Console.Write("Please enter your osu! username: ");
                username = Console.ReadLine();

                socket.EmitAsync("generateAuth", new { osu = username, id = guid });
                socket.On("verify", x => {
                    if(x.GetValue<Boolean>(0) != false) {
                        Console.Write("\nPlease verify your identity by sending `!verify {0}` to kiyomii in osu!.", x.GetValue<String>(1));
                        socket.On("success", n => {
                            RegistryKey key = Registry.CurrentUser.CreateSubKey(@"SOFTWARE\kiyomii");
                            key.SetValue("username", n.GetValue<String>(0));
                            key.SetValue("secret", n.GetValue<String>(1));

                            Main(args);
                        });
                    } else {
                        Console.Write("It seems like your account is not enabled yet. Slide into my dms (nzxl#6334) to resolve.");
                        quitApp();
                    }
                });
            }
            
            RegistryKey key = Registry.CurrentUser.OpenSubKey(@"SOFTWARE\kiyomii");
            if(key != null) 
            {
                socket.EmitAsync("auth", new { osu = key.GetValue("username").ToString(), secret = key.GetValue("secret").ToString() });
                socket.On("loggedIn", u => {
                    if(u.GetValue<Boolean>(0) != false) {
                        Console.Write("Logged in as {0}!", u.GetValue<String>(1));
                    } else {
                        Console.Write("Failed to login due to an invalid secret or hwid. Slide into my dms (nzxl#6334) to resolve.");
                        quitApp();
                    }
                });
            }

            while(!_quitFlag)
            {
                var keyInfo = Console.ReadKey(true);
                _quitFlag = keyInfo.Key == ConsoleKey.C && keyInfo.Modifiers == ConsoleModifiers.Control;
            }
        }

        static SocketIO connect()
        {
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

        static String GetMachineGuid()
        {
            string location = @"SOFTWARE\Microsoft\Cryptography";
            string name = "MachineGuid";

            using (RegistryKey localMachineX64View = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, RegistryView.Registry64))
            {
                using (RegistryKey rk = localMachineX64View.OpenSubKey(location))
                {
                    if (rk == null)
                        throw new KeyNotFoundException(string.Format("Key Not Found: {0}", location));

                    object machineGuid = rk.GetValue(name);
                    if (machineGuid == null)
                        throw new IndexOutOfRangeException(string.Format("Index Not Found: {0}", name));

                    return machineGuid.ToString();
                }
            }
        }

        static void quitApp() {
            Thread.Sleep(5000);
            Environment.Exit(0);
        }
    }
}
