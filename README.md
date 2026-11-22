# Meridian

An interactive world travel planner. Spin a cartoon globe, open any country, province or city, browse its travel spots, and build a day-by-day trip plan with a rough budget and a shareable trip photo.

Meridian is open source. Everyone is welcome to fix information, add places and improve the code.

## What it does

- Cartoon 3D globe that hands over to a cartoon city map with 3D buildings and hand-built landmark models as you zoom in
- Travel spots for countries, provinces and cities, with filters (photo spots, nature, culture, fun, cafes, restaurants, bars, stays, shopping, diving)
- Photos in up to 4K with photographer credit, plus videos and review links
- "Plan this trip for me": six questions, then a day-by-day plan, rough budget and a trip photo
- Trip planner saved in the visitor's browser
- Share a trip with your own story, browse the community feed, follow travellers and copy any shared trip into your own plan
- Google sign-in so visitors can share trips and add places, tips and corrections for everyone
- Preview mode: until a Firebase project is connected, sharing works but is saved only in the visitor's browser

## Run it on your computer

No build step. You only need [Node.js](https://nodejs.org) 18 or newer.

```bash
node server.mjs
```

Then open http://localhost:4173.

## Project layout

| Path | What it is |
| --- | --- |
| `index.html`, `css/styles.css` | Page shell and styles |
| `js/app.js` | Globe, map, place panel, spot explorer, planner, trip photo |
| `js/landmarks.js` | 3D cartoon landmark models (three.js, built in code) |
| `js/community.js` | Google sign-in and community notes |
| `js/config.js` | Site settings (Firebase config, repository link) |
| `js/data.js` | Featured cities |
| `data/` | Pre-built travel spots per country, region and city |
| `tools/build-data.mjs` | Script that builds `data/` from Wikidata and OpenStreetMap |
| `firestore.rules` | Who may read and write community notes |

## Rebuild the travel data

```bash
node tools/build-data.mjs --no-food
```

The script skips files that already exist, so it is safe to stop and run again. Add `--only=JP,FR` to build chosen countries, `--force` to rebuild, or `--food` to build cafe and restaurant lists.

## Connect Google sign-in

Sign-in and community notes stay switched off until a Firebase project is connected. The site owner does this once:

1. Create a project at https://console.firebase.google.com (free plan is enough).
2. Authentication, Sign-in method: enable **Google**.
3. Authentication, Settings, Authorized domains: add the site's domain.
4. Firestore Database: create a database, then paste the contents of `firestore.rules` into the Rules tab. Replace `OWNER_EMAIL_HERE` with the owner's Google email so they can remove any note.
5. Project settings, Your apps: add a Web app and copy its config into `js/config.js`.

A Firebase web config is safe to publish. Access is enforced by the rules, not by hiding the config.

## Where the information comes from

| Source | Used for | Licence |
| --- | --- | --- |
| Wikidata | Travel spots, regions | CC0 |
| Wikimedia Commons | Photos and videos | Per file, shown with each photo |
| Wikipedia, Wikivoyage | Descriptions | CC BY-SA |
| OpenStreetMap (Overpass, Photon, Nominatim, OpenFreeMap) | Cafes, restaurants and other live places, map | ODbL |
| Openverse | Flickr photos with credit | Per photo |
| Esri World Imagery | Satellite view | Esri terms; commercial use needs an account |
| Open-Meteo | Weather and place search | CC BY 4.0 |

The code is under the MIT licence (see `LICENSE`). Data and photos keep the licences of their sources.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
