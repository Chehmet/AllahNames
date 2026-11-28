# Asma · 99 Names of Allah

Asma is a bilingual web app for learning the 99 Names of Allah (*Al-Asma al-Husna*). Study the meanings in Russian or English, practice with quizzes and flashcards, and compare names that are easy to confuse.

**[Open the app](https://chehmet.github.io/AllahNames/)**

## Study modes

- **Catalogue.** Browse all 99 names in Arabic, with Cyrillic and Latin transliterations, brief and expanded bilingual explanations, optional memory cues, and linked sources. Quran references include Arabic excerpts and study translations.
- **Quizzes.** Choose a difficulty and question count. Questions and answer options are shuffled. Use 50/50, text fragments, source context, or a related name. Leave and resume an unfinished quiz in the same browser.
- **Flashcards.** See the meaning at a glance, flip the card for an explanation, and schedule your next review.
- **Meaning groups.** Compare related names side by side. For example, the mercy group explores how *Ar-Rahman* and *Ar-Rahim* share a root and differ in emphasis.
- **Favorites and themes.** Save names for later and switch between light and dark mode. Solo progress and review schedules are stored in your browser.

## Group quizzes

With Supabase configured, a host signs in by email and creates a room. Players join with a QR code or room code and a nickname. The room uses the host’s language at creation to show the same wording and answer choices on every device.

Players can revise their answer until everyone has submitted or the 40-second answer window closes. The correct answer then appears, followed by the next question after a 10-second review window. A correct answer earns 1,000 points plus up to 250 for speed, calculated from the final choice. Players can resume through the original link or the last-room card in the same browser.

The results show up to three podium places, percentages for correct, incorrect, and skipped answers for each question, and a private review list for each player. The host can download all responses with points and response times as CSV. Signing in also enables favorites sync across devices.

## Run locally

The frontend uses HTML, CSS, and vanilla JavaScript. GitHub Pages serves the [`docs/`](docs/) directory directly. Solo study works without an account or a backend.

With Node.js 22 or later, run `npm start` and open the address printed in the terminal. To run the automated tests, use `npm ci` followed by `npm test`.

To enable group play and account features on your own deployment, run [`supabase/schema.sql`](supabase/schema.sql) in your Supabase project. Enable email and anonymous sign-in, set the deployed app address as the Auth Site URL, and add your Project URL and publishable key to [`docs/config.js`](docs/config.js). Keep secret and service-role keys out of the frontend. [Supabase anonymous sign-in guide](https://supabase.com/docs/guides/auth/auth-anonymous) · [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)

For an existing deployment, run the updated [`supabase/schema.sql`](supabase/schema.sql) in **Supabase → SQL Editor** before publishing the updated frontend. The script keeps existing rooms, answers, and favorites. Create a new room to use the automatic rounds and speed scoring.

## Sources

[Quran 7:180](https://quran.com/7/180) calls on believers to invoke Allah by His beautiful names. [Sahih al-Bukhari 2736](https://sunnah.com/bukhari:2736) mentions 99 names without listing them. The study catalogue follows the traditional enumeration in [Jamiʿ at-Tirmidhi 3507](https://sunnah.com/tirmidhi:3507). The app's source notes describe the scholarly discussion about the transmission of that list. Translations and memory cues are learning aids.

## License

[MIT](LICENSE)

## Contacts

В случае вопросов, предложений, замечаний, пишите на почту valiullinac2004@gmail.com
