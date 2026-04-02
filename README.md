# GitHub Pages portfolio starter

This is a no-build static portfolio site made for GitHub Pages.

## What is included

- Landing page with a looping Vimeo background and logo split intro
- Showreel page with:
  - floating project titles
  - left-side filters
  - hover still previews
  - highlight levels from `1` to `3`
- Project overlay with:
  - embedded Vimeo or YouTube video
  - metadata
  - collapsible credits
- `35 mm` overlay with:
  - stacked photo carousel
  - pause-on-click behaviour
  - drag mode when paused
  - album name label
  - audio meter + mute button
- About overlay

## Run locally

Because this is a static site, you have two easy options:

### Option 1
Open `index.html` directly in your browser.

### Option 2
Run a tiny local server for smoother media loading:

```bash
python3 -m http.server 8000
```

Then open:

```bash
http://localhost:8000
```

## Publish to GitHub Pages

1. Create a new GitHub repository.
2. Upload all files from this folder.
3. In GitHub, go to:
   - **Settings**
   - **Pages**
4. Set the source to:
   - **Deploy from a branch**
   - branch: `main`
   - folder: `/root`
5. Save.

## Main files to edit

### `assets/js/site-data.js`
This is the main content file.

Edit:

- site email
- about text
- social links
- project list
- still images
- album names
- 35mm images

Each project supports:

- `slug`
- `index`
- `title`
- `role`
- `year`
- `type`
- `categories`
- `highlight`
- `duration`
- `client`
- `subtitle`
- `description`
- `credits`
- `videoEmbed`
- `stills`

### `assets/media/logo-placeholder.png`
Replace this with your real transparent PNG logo.

### `assets/media/avatar-placeholder.png`
Replace this with your portrait for the About page.

### `assets/media/projects/`
Replace the placeholder project stills.

### `assets/media/35mm/`
Replace the placeholder 35mm photos and organise them by album in `site-data.js`.

## Vimeo / YouTube
For project videos, use embed URLs such as:

- Vimeo: `https://player.vimeo.com/video/VIDEO_ID?...`
- YouTube: `https://www.youtube.com/embed/VIDEO_ID?...`

## Notes
- The landing page currently uses a placeholder Vimeo background.
- The `35 mm` page uses a local ambient loop placeholder audio file. I used this instead of a real Spotify player because a pure static GitHub Pages site cannot reliably control Spotify playback or volume bars without a more complex authenticated integration. You can still swap this for your own background audio, or later upgrade it to a Spotify-connected version.
- On smaller screens, the showreel switches from free-floating positions to a stacked responsive list for better usability.
