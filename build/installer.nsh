; Désinstallation d'Hydarium : questions claires, et surtout on demande avant d'effacer les instances et les réglages.
; Silencieux (mise à jour, /S) : on désinstalle le programme et on GARDE les données (valeurs /SD).
!ifdef BUILD_UNINSTALLER
  Var HydDel
!endif

!macro customUnInit
  MessageBox MB_YESNO|MB_ICONQUESTION "Désinstaller Hydarium ?$\r$\n$\r$\nLe launcher sera retiré de cet ordinateur." /SD IDYES IDYES hyd_continue
  Abort
  hyd_continue:
  StrCpy $HydDel "0"
  MessageBox MB_YESNO|MB_ICONQUESTION "Veux-tu aussi supprimer tes instances, tes mondes, tes skins et tes réglages ?$\r$\n$\r$\nOUI : tout est effacé (dossier $APPDATA\hydarium-launcher).$\r$\nNON : tu retrouveras tout si tu réinstalles Hydarium plus tard." /SD IDNO IDNO hyd_keep
  StrCpy $HydDel "1"
  hyd_keep:
!macroend

!macro customUnInstall
  ${If} $HydDel == "1"
    RMDir /r "$APPDATA\hydarium-launcher"
  ${EndIf}
!macroend
