# SwissInv-Beta

A phone-first web app for **reuse inventories** of existing buildings, room by room, following the **Swiss-Inv data structure** (Cirkla, v1.0-2024). A person stays in the loop at every step: the building register pre-fills the building data, tap-to-outline proposes the element, the element catalogue proposes eBKP, IFC entity and unit – and the person checks and completes everything. Every element records how long it took, so assisted and manual inventory can be compared.

**Live demo:** https://bendieklaranjo.github.io/swissinv-beta/

SwissInv-Beta is the public, model-free part of the research. The full tool with vision models, LiDAR and price prediction is **BUISI**, developed separately.

## What it does

The app runs fully in **German or English** (chosen after the start screen; French and Italian are announced as coming soon). Every page has a progress bar, **back**, **skip** and a **home** button (project menu, or main menu outside a project).

1. **Start → language → main menu** – start a new project or resume one; time study results.
2. **Project** – name, project type (only the reuse inventory is available; others are "coming soon") and inventory mode. A short line under the mode buttons explains the two modes (assisted: box on the room photo + suggestions; manual: form only, the baseline of the time study).
3. **Project menu** with three parts:
   - **Projektinformationen** – four pages: find the building (address search in the Swiss building register GWR, which fills EGRID, EGID, address, year built, volume, storeys and the SIA 102 building type; outside Switzerland, e.g. in Germany, a button searches OpenStreetMap instead, which fills the address and, where mapped, storeys, year built and building type), Allgemeine Gebäudedaten, Weitere Informationen, Kontakte. The auditor is remembered for the next project.
   - **Inventar** – starts with the values for all elements (Verfügbarkeit, Status, Dokumente) and the floors, then floors → rooms → elements. Rooms get a tag after `Floor_Use_Number`, e.g. `OG1_OFF_02`; "Next room" sits in the top corner.
   - **Export** – Excel in the Swiss-Inv structure, ZIP with Excel + photos + uploaded documents, CSV, PDF report, QR labels.
4. **Room photo → bounding box** (assisted mode) – tap an element for an automatic box, or drag a box around it. The crop becomes the first photo. (Segmentation masks are reserved for BUISI.)
5. **Element** – six pages: photos (front, side, fixing detail), identification (function in the building → element type, which generates the eBKP number and name and the IFC entity; the name stays free), quantity and dimensions (with a sketch), potential, description and attachments ("Keine" for no documents), Bauteil Stufe 2 – Erweiterte Angaben. Verortung is filled from the room and not asked.

6. **Search** – the inventory screen (floors and rooms) has a search bar for all elements of the building; each room has one for its own elements. Case and accents do not matter ("tur" finds "Tür"), and every word must match: name, Bauteil ID, element type (German or English), eBKP, IFC, manufacturer, materials, colour, label code, room and floor. In the room, the rows keep their numbers, so they still match the boxes on the photo.
7. **Prefill from an existing element** – on the first page of a new element (draft), "Prefill from an existing element" opens a searchable list of the building's elements. Everything is copied except Bauteil ID, Verortung and Koordinaten (they belong to the new location). Photos are not copied; uploaded documents are (the file is shared, not duplicated). Copied values are blue suggestions and never replace what was already typed. Works in both modes and is recorded for the time study.
8. **Same element in the building** – a prefilled element is linked to its source. The element pages show "Same element: 3 entries in the building · 6 Stk" (entries, and the total Menge when all entries use the same Einheit); lists show "3× in building". "Not the same element" removes the link and keeps the values. In the room list and in the building search, linked elements appear as **one bar** with their number in the building; the small arrow opens it and lists every entry in the building with its room and floor. Entries in the current room keep their photo number, QR button and delete button.
9. **Delete** – element rows (right of the QR button), room rows (inventory screen) and projects (main menu) have a trash button. It asks first (Delete / Keep), then deletes with all timing data and photos on this device. A room takes its elements with it, a project its rooms and elements. Export first if the data is still needed.
10. **Add element with existing ID** – next to "Add element manually". A single page with the **GTIN**, which becomes the Bauteil ID, the **name** (Bezeichnung), a **comment**, exported as "Weitere Informationen", where web addresses become clickable links, and **uploaded documents**. Lists show the name, or "GTIN …" when there is none. The app warns when the GTIN's check digit does not fit (8, 12, 13 or 14 digits) but still saves. Verortung is filled from the room; all other fields stay empty, and building defaults are not applied. Elements with the same GTIN in the building are linked as the same element when saved, so the counter shows them.

Blue fields are **suggestions** (from the register, the element type, the building-wide values or a prefilled element). They stay blue until the person checks or changes them, and the app never overwrites what the person typed.

### Illustration

`public/illustration.png` is the SwissInv building illustration shown on the start screen, in the main menu and after an export. Replace the file to change it.

### Element types (CRB)

The element types come from the **CRB rule set "eBKP-H (2020) – IFC", BETA 1.0** (`CRB_ifc_Regelsatz_eBKP-H2020_BETA_1.0.xlsx`, sheet `CRB_eBKP-H-Ifc`, level 4 "IFC-Regelelement"). They were extracted into `src/domain/crb/ebkp-ifc.json`: 768 rule elements in eBKP-H main groups C–J, each with its eBKP-H element code (e.g. G01.05), names in DE/EN/FR/IT, the IFC entity and its predefined type. Left out: main groups A/B, cost items, IFC2x3 duplicates and openings. You pick a main group (C–J), then the type, or search by name or code. Picking a type fills the full eBKP number + name (e.g. G01.05 Innentür) and the IFC entity (IfcDoor); the predefined type (DOOR) goes to "Zusatzfelder". To update, re-extract the JSON from a newer CRB file.

## Quick start (VS Code)

You need [Node.js](https://nodejs.org) (LTS).

```bash
npm install
npm run dev
```

Open the `Local` address on your computer, or the `Network` address on your phone (same Wi-Fi). Use `npm run dev:phone` for HTTPS on the local network.

## Live demo (GitHub Pages)

Every push to `main` builds the app and publishes it (`.github/workflows/deploy.yml`, Pages source: GitHub Actions). The demo URL follows the repository name. After a deploy, reload with Ctrl+Shift+R or use a private window – Pages caches for about 10 minutes. Each tester's data stays in their own browser.

## Swiss-Inv conformity

- All field names, order, value lists, Muss/Kann and explanations come from `src/domain/swissinv.ts`, transcribed from the template.
- The Excel export has the sheets **Gebäude** and **Bauteile** in template order and naming. Fields the app adds beyond Swiss-Inv (marked "Zusatz" in the app) go to a separate sheet **Zusatzfelder**: Hauptmaterial, destination project, mode, GWR reference, QR label code ("Etiketten-Code"), and for linked elements "Gleiches Bauteil (Gruppe)" (Bauteil ID of the group's first entry), "Anzahl Einträge gleiches Bauteil", "Menge gleiches Bauteil gesamt" "Vorbefüllt von" (Bauteil ID of the source) and "Erfassungsart" (`GTIN` for an element added with an existing ID, else `Formular`), plus "Hochgeladene Dokumente" (file names as in the ZIP; one row for the building, one column for the elements).
- **Uploaded documents:** next to "Liste der vorhandenen Dokumente" – on the element page "Beschreibung und Anhänge" and under "Defaults for all elements" (documents for the whole building) – any file can be uploaded (PDF, images, plans, data sheets, models). Each file has a document type from the Swiss-Inv list; uploading ticks that type and removes "Keine". The files stay on the device (like photos) and go into the ZIP export as `Dokumente/Gebaeude_<name>` and `Dokumente/<Bauteil ID>_<name>`; the PDF report lists them. A file shared by prefilled elements is stored once and deleted only when no element or project lists it any more. Elements added with an existing ID (GTIN) have the upload on their single page.
- **Dimensions:** the template lists height, width, depth, length and diameter as Muss. The app counts the group as complete with height + width + depth, or length, or diameter. Once the group is complete, the dimension fields still empty show "Kann" (e.g. length and diameter after height, width and depth).
- **Photos:** at least 3 per element, compressed to under 1.5 MB, named `<Bauteil ID>_<n>.jpg` in the ZIP and in "Liste der vorhandenen Fotos".
- **Bauwerksart** allows several values for mixed-use buildings, joined with "; ".
- **"Keine"** in "Liste der vorhandenen Dokumente" is an app addition for elements without documents.
- **Element type (Bauteiltyp)** and **IFC PredefinedType** are app fields from the CRB rule set; they standardise eBKP and IFC and are exported in "Zusatzfelder".

## QR labels

**Export → QR labels** makes a PDF with one label for each saved element. Draft elements get no label.

1. **Sheet:** A4 with 3 × 8 labels of 70 × 37 mm, no side margin. Print at 100 % (actual size).
2. **Label:** the QR code, the code (e.g. `K7M2-X9PA`), the Bauteil ID, the Bezeichnung, the Verortung and the project name. Long text ends with "…". Characters outside Windows-1252 print as "?", as in the PDF report.
3. **Code:** 8 characters from `23456789ABCDEFGHJKMNPQRSTUVWXYZ`. The last character is a check character, so a typing mistake is found. An element gets its code at the first label export and keeps it. A second export prints the same codes. The code is in the "Zusatzfelder" sheet as "Etiketten-Code".
4. **Link:** the QR code holds `<address>?e=<CODE>`. On GitHub Pages, the address is the published app. To print from another address, set `VITE_QR_BASE_URL` in `.env.local`, for example `VITE_QR_BASE_URL=https://bendieklaranjo.github.io/swissinv-beta/`. The Export screen shows the address and warns if a phone outside your network cannot open it.
5. **A printed label keeps its address forever.** Print labels for real use only from the permanent address.

**One label for one element.** In the room screen, each element row has a QR button on the right, drafts too. It opens a window with the label preview, **Print** and **Download PDF**. The PDF is one page of 70 × 37 mm, for a label printer, or print it at 100 % on A4 and cut it out. If the element has no code yet, it gets one when the window opens. Without Bluetooth (iPhone, Firefox), **Print** works with the PDF: on a PC it opens the print dialog; on a phone it opens the PDF in the phone's viewer, which has Print or Share.

**Zebra label printer over Bluetooth.** In Chrome or Edge (Android, Windows, macOS), **Print** sends the label straight to a Zebra Link-OS printer such as the ZQ511 (203 dpi, 72 mm print width), with no driver and no app.

1. The first **Print** of a session shows Chrome's list of nearby printers. Choose the printer. After that, one tap prints. The app reconnects by itself when the printer was asleep. Where Chrome supports it, the printer is found again after a reload, with no list.
2. **Change printer** chooses another one. **Print as PDF** prints the PDF as before, for example on an office printer.
3. The label is sent as a picture of 560 × 296 dots (70 × 37 mm) in ZPL, centred on the 72 mm head. All characters print. Text typed in the app can never act as a printer command.
4. The first print of a session also switches the printer to ZPL (`device.languages = zpl`), in case it was set to "line print".
5. **One-time printer setup** in the Zebra Printer Setup Utility app: Bluetooth Low Energy on, media type to match the roll (linerless: continuous, or mark if the roll has black marks), then calibrate the media once.
6. iPhone browsers have no Bluetooth for websites. There, use **Print** (PDF) or **Download PDF**.

**Printing from a PC (Windows) via the Bluetooth port.** The ZQ511 accepts print data over Bluetooth LE only on a paired, encrypted link. Android pairs by itself, so **Print** works there. Windows does not: Chrome connects, but the printer drops the data, and the window says "Printer not reachable". On a PC (not on Android) the label window therefore also has **Print via Bluetooth port (PC)**, which sends the same ZPL label over classic Bluetooth (Web Serial, `src/lib/zebraSerial.ts`):

1. Once: pair the printer in Windows (Settings → Bluetooth & devices → Add device → Bluetooth, confirm the code). Windows makes a port, e.g. "Standard Serial over Bluetooth link (COM6)".
2. The first **Print via Bluetooth port** shows Chrome's port list. Choose the printer's port (Windows lists it as the outgoing port of the printer under More Bluetooth settings → COM Ports). Chrome remembers it; **Choose another port** forgets it.
3. Each job opens the port, sends and closes it, so the printer is free for a phone in between. A phone connected to the printer at the same time blocks the port.

On Android nothing changes: the button is not shown there, and **Print** works over Bluetooth LE as before.

**Scan a label.** The phone camera opens the link, and the app opens the element page (photos step). If no element on this device has the code, or more than one element has it, the app shows the label screen. **Main menu → Open a label** takes a typed code or a pasted link.

Limits:

1. A label link needs a network connection to load the app.
2. The data is only on the device and in the browser that recorded the inventory. On another device, the app shows "This label is not known on this device".
3. The phone camera opens the link in the default browser. Record the inventory in that browser.
4. Only one tab writes. A scan opens a new tab, and older tabs then show a notice with **Continue here**. Thus an older tab cannot overwrite newer data.
5. Opening an element from a label starts the time-study clock, the same as a tap in the room list.

## The time study

- Each element stores its **mode**: `assisted` (bounding box on the room photo, crop as first photo, suggestions from the element type) or `manual` (form only). Both modes get the register data, the building-wide values, and eBKP + IFC generated from the element type.
- The clock **starts** at the first tap or drag on the room photo (assisted) or at "Add element manually", **pauses** while the app is in the background, and **stops** at the first save (`firstSavedMs`).
- Also logged: outline taps, suggestions kept, suggestions corrected, required fields filled, number of photos.
- **Prefill:** `timing.prefilledFrom` holds the element an element was prefilled from (CSV column `prefilled_from`, the source's Bauteil ID; empty if not prefilled). Prefilled values count as suggestions, so they appear in "suggestions kept/corrected". Filter on `prefilled_from` to compare like with like.
- **Entry:** the CSV column `entry` is `gtin` for elements added with an existing ID (GTIN + comment only) and `form` for the full form. Leave out `gtin` rows when comparing assisted and manual.
- Results: **Time study results** in the menu, its CSV export, and the "Zeitstudie" sheet in the Excel export.

## How the app is organised

```
src/
  i18n/              German/English: ui.ts (UI texts), options.ts (English for value lists)
  domain/
    swissinv.ts      Swiss-Inv fields (DE + EN), lists, explanations, eBKP
    crb.ts           element types from the CRB eBKP-H – IFC rule set (crb/ebkp-ifc.json)
    fields.ts        app vocabulary: project types, room uses, floors, room tags
    types.ts         data model
  lib/
    gwr.ts           Swiss building register (geo.admin.ch) search and mapping
    osm.ts           OpenStreetMap (Nominatim) address search outside Switzerland – only on button press, max 1 request/s
    elements.ts      element creation, suggestions (auto-fill), prefill and linked same elements
    search.ts        element search (accents and case ignored, every word must match)
    store.ts         IndexedDB storage (projects, elements, photos). The app shows only
                     start, language and menu until the data is loaded, so a form screen
                     restored after a reload cannot save empty values. Only the newest
                     tab writes (one writing tab).
    timing.ts        time-study clock
    segmentation/    engine interface + region-growing engine
    export.ts        Excel, ZIP, CSV, PDF, QR labels, time study
    labelCode.ts     QR label codes: new code, check character, link, reading scanned text
    labelSheet.ts    PDF layout: A4 sheet with 3 × 8 labels, or one 70 × 37 mm label
    labelZpl.ts      one label as a ZPL job for a 203 dpi Zebra printer (picture + compression)
    zebra.ts         Zebra printer over Web Bluetooth: choose once, reconnect, send
    zebraSerial.ts   Zebra printer over a Bluetooth serial port (Web Serial, PCs only; Android uses zebra.ts)
    labels.ts        label codes and the store: link address, assign codes, open a scanned link
    images.ts        photo decoding (incl. iPhone HEIC), compression, cropping
    nav.ts           screen navigation
  screens/           one file per screen (Label.tsx: open a label by code or link)
  components/        shared UI pieces (LabelDialog.tsx: the QR label of one element;
                     ElementSearch.tsx: search bar and result list; ElementPicker.tsx: choose an element to prefill from;
                     DocUpload.tsx: upload, open and remove documents)
```

## Roadmap for SwissInv-Beta

- [ ] Zürich-specific data from the city's 3D model (building height, volume) where the register is incomplete
- [ ] French and Italian versions (Swiss-Inv exists in DE/FR/IT)
- [ ] Installable offline app (`vite-plugin-pwa`)
- [ ] PDF report design
- [ ] Verify the eBKP suggestions in the element catalogue with practitioners

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server, reachable from your phone |
| `npm run dev:phone` | Same, over HTTPS |
| `npm run build` | Type check and production build into `dist/` |
| `npm run preview` | Serve the production build |
