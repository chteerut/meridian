# Contributing to Meridian

Thank you for helping. There are two ways to contribute.

## 1. Add or fix travel information (no coding)

On the website, open a place, go to the **Spots** tab and press **Add a place or tip**. You sign in with Google, fill in a short form, and your note is visible to everyone straight away. You can remove your own notes at any time.

Please only add things you know first hand, keep it factual, and never post private information about other people.

Wrong facts that come from Wikidata or OpenStreetMap (a wrong name, a missing photo, a misplaced pin) are best fixed at the source, because every site that uses that data benefits:

- Wikidata: https://www.wikidata.org
- OpenStreetMap: https://www.openstreetmap.org

## 2. Improve the code

1. Fork the repository and create a branch.
2. Run the site with `node server.mjs` and open http://localhost:4173.
3. Make your change. Keep it small and focused: one fix or feature per pull request.
4. Check it in a desktop browser and at phone width.
5. Open a pull request that says what changed and how you tested it.

### House style

- No build step and no framework: plain HTML, CSS and JavaScript.
- Dark theme, one accent colour (`--accent`), Phosphor icons, no emojis in the interface.
- Every photo keeps its photographer credit and licence.
- Do not copy content from Instagram, TikTok or other sites that forbid it. Link to it instead.
- Do not commit API keys or passwords.

### Good first contributions

- Add a 3D landmark model in `js/landmarks.js`
- Add a featured city in `js/data.js`
- Improve the budget numbers in the planner
- Translate the interface

## Reporting problems

Open an issue with the place you were looking at, what you expected and what happened. A screenshot helps.
