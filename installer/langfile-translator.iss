; Inno Setup script (ASCII only). Build: ISCC.exe /DAppVersion=x.y.z installer\langfile-translator.iss
#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#define AppName "LangFile-Translator"
#define AppExe "LangFile-Translator.exe"
#define AppSrc "..\release\win-unpacked"
#define AppOut "..\release"

[Setup]
AppId={{8C4B6D2E-5A3F-4E87-9B1A-2D7F0C6E9A41}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=29kiyo
AppPublisherURL=https://github.com/29kiyo/LangFile-Translator
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\{#AppExe}
SetupIconFile=..\build\icon.ico
OutputDir={#AppOut}
OutputBaseFilename={#AppName}-{#AppVersion}-setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "japanese"; MessagesFile: "compiler:Languages\Japanese.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "{#AppSrc}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent
