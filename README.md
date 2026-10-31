# Doodle Critters

A party game for kids aged 4–8. The game runs on the TV, and kids play on phones.

1. **Draw:** every kid draws a critter on a phone and gives it googly eyes.
2. **Meet:** the critters come alive on the TV. They walk in, blink, look around and say hi.
3. **Play:** four mini-games, each starring the kids' own critters:
   - 🎈 **Balloon Pop:** blow into the phone to fill your balloon, and stop at the green stripe before it pops.
   - 🐉 **Shh! The Dragon:** make noise to run to the castle, but go silent when the dragon falls asleep, or it puffs you backwards.
   - 🔦 **Flashlight Hide & Seek:** one critter hides in a dark bedroom, and everyone else steers a flashlight with a finger to find it.
   - 🪶 **Feather Float:** blow softly to keep your feather in the cloud zone.
4. **Parade:** every critter marches with its own medal (Balloon Boss, Dragon Dodger, Super Seeker…), and the team counts up its stars.

## Made for little kids

- **No reading needed.** The TV reads every instruction out loud (using the browser's speech), and phones show big pictures and buttons.
- **Fair for mixed ages.** Each kid picks their age when joining, and the games adjust: younger kids get wider targets, more speed and more slack when the dragon sleeps.
- **Everyone gets stars.** Each game gives 1–3 stars, with no knockouts and no losers.
- **Microphone or not.** Games read how hard a kid blows or how loud they are. On phones without a microphone (or if it isn't allowed), a big **hold to blow** button does the same job.
- **Nothing is stored.** Drawings exist only while the game is running. There's no chat and no free text between players.

## Run it

```bash
npm install
npm start          # http://localhost:3000
npm test           # plays a whole game over sockets
```

Open `/host` on the TV (or cast that tab). Kids scan the QR code or open `/play` and enter the room code. The first kid to join (👑) can press Start on their phone.

The microphone only works on `https://` pages or `localhost`, so deploy it (see below) to play with phones on Wi-Fi.

## Deploy on Render

`render.yaml` is included: in Render, choose **New → Blueprint** and pick this repo. Free services sleep after about 15 minutes, so the first visit can take up to a minute to load.

## Put it on the TV

There are three ways to get the game onto the TV:

- **Browser:** open `/host` on any screen, or cast that tab from Chrome on a laptop.
- **Cast button (no laptop):** on an Android phone using Chrome, open `/play` and tap **📺 Cast a new game to your TV**. The Chromecast loads `/cast`, sends the room code back to the phone, and kids join as usual. A kid already in a game can tap **📺 Cast** in the top bar to move that game onto the TV. iPhones can join, but can't start the cast (Apple doesn't allow casting from websites).
- **Android TV app:** an app on your Chromecast with Google TV, with its own tile in the Apps row (see below).

### One-time Cast setup

1. In the [Google Cast SDK Developer Console](https://cast.google.com/publish) (the same account as Smuggler, so there's no extra fee), choose **Add new application → Custom Receiver** and set the receiver URL to `https://doodle-critters.onrender.com/cast`.
2. The Application ID goes in `CAST_APP_ID` in `server.js` (the default is `791CB81D`, registered for doodle-critters.onrender.com), or set a `CAST_APP_ID` environment variable in Render to override it.
3. Your Chromecast is already registered as a test device on the account. If casting doesn't start, restart the Chromecast.

### Android TV app

`android-tv/` is a small Android TV app that opens `/tv` full-screen. It keeps the screen awake, plays sound without a click, and reads instructions aloud through Android's own voice (the app's built-in web viewer has no speech). GitHub Actions builds it whenever `android-tv/` changes and publishes the APK to **`/app`** (`/doodle-critters-tv.apk`).

To install it on the Chromecast, use the same steps as Smuggler: developer mode on, install **Downloader**, allow it to install apps, then download `doodle-critters.onrender.com/app`. To update, download it again; the new version installs over the old one.

The app is signed with a sideload-only key committed in the repo. Publishing to the Play Store would need a new private key.

## How it works

```
server.js            Express + Socket.IO: rooms, phone actions, live input relay to the TV
src/room.js          Game flow: lobby → draw → meet → (intro → play → results) × 4 → parade
public/host.*        TV screens; runs the mini-games and reports scores to the server
public/games/*.js    The mini-games (TV side): balloon, dragon, seek, feather
public/play.*        Phone controller: join, drawing pad, mic meter, flashlight pad, spot picker
public/critter.js    Turns a drawing into a living critter (googly eyes, feet, animation)
public/mic.js        Microphone → 0..1 "effort" above the room's background noise
public/sound.js      Synthesized sound effects and an original music loop
public/voice.js      Reads instructions aloud on the TV (Android TV app: via Android's voice)
public/cast.js       Chromecast sender (phone's Cast button)
public/cast.html     Chromecast receiver page (+ cast-receiver.js)
public/tv.html       TV screen for the Android TV app
public/icon.svg      App icon source; scripts/make-icons.js renders the PNGs and TV banner
android-tv/          Android TV app (WebView wrapper), built by .github/workflows/android-tv.yml
test/smoke.js        End-to-end test
```

Phones stream their mic level (about 15 times a second) and flashlight position to the TV through the server. The TV runs each game's physics and timer, then reports each kid's 0–1 score; the server turns scores into stars and keeps failsafe timers in case the TV disconnects.
