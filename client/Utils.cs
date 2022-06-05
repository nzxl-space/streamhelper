using System.IO;
using System.Net;
using System.Threading;
using System.Runtime.InteropServices;
using Microsoft.Win32;
using System.Diagnostics;
using System.Collections.Generic;
using System;
using SocketIOClient;

namespace client
{
    class Utils
    {
        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
        [DllImport("user32.dll")]
        private static extern bool IsWindowVisible(IntPtr hWnd);

        public static String GetMachineGuid() {
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

        public static bool checkVersion(String url, int b) {
            try {
                HttpWebRequest webRequest = (HttpWebRequest) WebRequest.Create(url+"/b");
                HttpWebResponse httpResponse = (HttpWebResponse) webRequest.GetResponse();
                using (StreamReader responseReader = new StreamReader(httpResponse.GetResponseStream()))
                {
                    var version = responseReader.ReadToEnd();
                    if(version != b.ToString()) {
                        return false;
                    }
                }
            } catch (Exception) {
                Console.Write("There was an error while trying to get version string. Try again later!");
                Environment.Exit(0);
            }

            return true;
        }

        public static SocketIO connectServer(String url) {
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

        public static void restartApp(string[] args, CancellationTokenSource cts) {
            Client.Main(args);
            cts.Cancel();
        }
        
        public static bool toggleOBS() {
            foreach(Process p in Process.GetProcesses()) {
                if(p.ProcessName == "obs" || p.ProcessName == "obs64") {
                    ShowWindow(p.MainWindowHandle, IsWindowVisible(p.MainWindowHandle) ? 2 : 4);
                }
            }
            return true;
        }
    }
}