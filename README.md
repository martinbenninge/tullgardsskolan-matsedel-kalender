# Tullgårdsskolans matsedelskalendrar

Det här projektet gör Skolmaten.se:s RSS-flöde till tre prenumerationsbara
iCalendar-filer för Apple Kalender:

- `kott.ics` – visar endast köttalternativet. Dagar med enbart vegetarisk mat
  får ingen händelse i denna kalender.
- `vegetariskt.ics` – visar det vegetariska alternativet.
- `bada.ics` – visar **en** heldagshändelse per dag med både kött- och
  vegetariskt alternativ när bägge finns.

Kalenderfilerna uppdateras automatiskt från den här datorn tre gånger per dag
och publiceras på GitHub Pages. Varje måltid blir en heldagshändelse. Enligt
skolans upplägg tolkas första raden som kött och andra raden som vegetariskt.
Om RSS-posten bara innehåller en rad tolkas den som vegetarisk.

Efter att GitHub Pages har publicerats går det att prenumerera via:

```
https://<GitHub-användare>.github.io/<projektnamn>/kott.ics
https://<GitHub-användare>.github.io/<projektnamn>/vegetariskt.ics
https://<GitHub-användare>.github.io/<projektnamn>/bada.ics
```
