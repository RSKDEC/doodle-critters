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
public/voice.js      Reads instructions aloud on the TV
test/smoke.js        End-to-end test
```

Phones stream their mic level (about 15 times a second) and flashlight position to the TV through the server. The TV runs each game's physics and timer, then reports each kid's 0–1 score; the server turns scores into stars and keeps failsafe timers in case the TV disconnects.
