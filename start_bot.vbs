Set WshShell = CreateObject("WScript.Shell")

' Start MySQL
WshShell.Run "cmd /c """"C:\xampp\mysql\bin\mysqld.exe""""", 0, False

' Wait 3 seconds for database to start
WScript.Sleep 3000

' Set working directory to project folder
WshShell.CurrentDirectory = "C:\Users\Administrator\Desktop\APPKG\family-system"

' Start Node server
WshShell.Run "cmd /c node server.js", 0, False

' Start Ngrok with static domain
WshShell.Run "cmd /c .\ngrok.exe http --domain=residency-audible-tribune.ngrok-free.dev 3000", 0, False
