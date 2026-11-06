# Getting started with HomeownerHub: narration script

Voice: macOS `say`, Samantha, rate 135. Total length 103 seconds.

The captions are **open captions**: they are burned into the picture, so they show everywhere, including silent autoplay. There is no separate caption track. The page at `/welcome` shows this same text as a transcript under "Read the video instead".

**Re-rendering adds repo size.** Every re-render of the MP4s adds a new copy of about 10 MB to the repository history. Only commit a re-render when the script or screens really changed, and commit the final files once. To re-render: `node tools/welcome-video/render.mjs` from the repo root (macOS with `say`, ffmpeg from `brew install ffmpeg`, and Playwright's Chromium). Edit `tools/welcome-video/script.json` for the words. The render also rewrites `apps/hoa/src/app/welcome/transcript.ts`, which the page and its test read.

## Welcome (00:00)

Madison Park is moving to HomeownerHub.

One easy place for your dues, your requests, and your news.

## Step 1: Sign in (00:09)

Open the invitation email from HomeownerHub, sent by your board, and tap the button.

That signs you in. No password needed.

Next time, tap Email me a link. Or choose a password.

## Step 2: Add it to your phone (00:23)

Add it to your home screen, so it opens like any app.

On iPhone, use Safari. Tap Share, then Add to Home Screen.

On Android, use Chrome. Tap the menu.

Then tap Add to Home screen, or Install app.

## Dues and statement (00:43)

Tap Dues to see what you owe, and your statement.

Tap Pay to see how your board takes payment.

## Ask the board (00:53)

Need something fixed? Tap Requests, then New support request.

Write a note, and tap Send request.

## Book a space (01:03)

To book the clubhouse or the pool, tap Community, then Book a space.

Pick a space, a day, and a time.

Then check your booking, and tap Book it.

## News and neighbors (01:16)

On Home, you will find Announcements and Documents.

Under Community, answer polls and talk with your neighbors.

## If you get stuck (01:26)

Stuck? Tap the Help button. It says Hello, and your first name.

Or tap Ask, to chat with your assistant.

## You are ready (01:36)

Welcome to HomeownerHub, Madison Park.

Your board is glad to help.

